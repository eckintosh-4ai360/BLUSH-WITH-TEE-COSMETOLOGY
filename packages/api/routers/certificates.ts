import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assessmentResults,
  assessments,
  certificateVerifications,
  certificates,
  courses,
  enrollments,
  studentProfiles,
  systemSettings,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import {
  certificateSettings,
  deriveGrade,
  issueCertificate,
} from "../services/certificates";
import { notify } from "../services/notify";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { permissionProcedure, publicProcedure, router } from "../trpc";

const DEFAULT_BANDS = [
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

export const certificatesRouter = router({
  list: permissionProcedure("certificates.read")
    .input(listInputSchema.extend({ status: z.enum(["issued", "revoked"]).optional() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.status ? eq(certificates.status, input.status) : undefined,
        input.search
          ? or(
              ilike(certificates.certificateNumber, likePattern(input.search)),
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({
            certificate: certificates,
            studentName: studentProfiles.fullName,
            studentNumber: studentProfiles.studentNumber,
            courseTitle: courses.title,
          })
          .from(certificates)
          .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
          .innerJoin(courses, eq(certificates.courseId, courses.id))
          .where(where)
          .orderBy(desc(certificates.issuedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(certificates)
          .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
          .where(where),
      ]);

      return paginate(
        rows.map(row => ({
          ...row.certificate,
          studentName: row.studentName,
          studentNumber: row.studentNumber,
          courseTitle: row.courseTitle,
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /** Students who have completed a course but hold no certificate yet. */
  eligible: permissionProcedure("certificates.read").query(async () => {
    const db = await dbOrThrow();

    const rows = await db
      .select({
        studentId: studentProfiles.id,
        studentNumber: studentProfiles.studentNumber,
        fullName: studentProfiles.fullName,
        status: studentProfiles.status,
        enrollmentId: enrollments.id,
        courseId: courses.id,
        courseTitle: courses.title,
        completedAt: enrollments.completedAt,
        expectedCompletionDate: enrollments.expectedCompletionDate,
      })
      .from(enrollments)
      .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .leftJoin(certificates, eq(certificates.enrollmentId, enrollments.id))
      // The left join plus this null check is what makes it "not yet awarded".
      .where(and(eq(enrollments.status, "completed"), isNull(certificates.id)))
      .orderBy(desc(enrollments.enrolledAt))
      .limit(100);

    return rows;
  }),

  issue: permissionProcedure("certificates.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        courseId: z.number().int().positive(),
        enrollmentId: z.number().int().positive().optional(),
        completionDate: z.coerce.date(),
        finalGrade: z.string().max(8).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select({
          id: studentProfiles.id,
          fullName: studentProfiles.fullName,
          userId: studentProfiles.userId,
        })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentId))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

      // One certificate per student per course.
      const [existing] = await db
        .select({ id: certificates.id, certificateNumber: certificates.certificateNumber })
        .from(certificates)
        .where(
          and(
            eq(certificates.studentId, input.studentId),
            eq(certificates.courseId, input.courseId),
            eq(certificates.status, "issued"),
          ),
        )
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This student already holds certificate ${existing.certificateNumber} for this course.`,
        });
      }

      const grade = input.finalGrade ?? (await computeGrade(db, input.studentId, input.courseId));

      const issued = await issueCertificate(db, {
        studentId: input.studentId,
        courseId: input.courseId,
        enrollmentId: input.enrollmentId,
        completionDate: input.completionDate,
        finalGrade: grade,
        issuedByUserId: ctx.user.id,
      });

      await recordAudit(db, ctx.actor, {
        action: "issue_certificate",
        entity: "certificate",
        entityId: issued.id,
        entityLabel: issued.certificateNumber,
        newValue: { studentId: input.studentId, courseId: input.courseId, grade },
        summary: `${ctx.actor.name ?? "Staff"} issued ${issued.certificateNumber} to ${student.fullName}`,
      });

      if (student.userId) {
        await notify(db, {
          userIds: [student.userId],
          type: "certificate_issued",
          title: "Your certificate has been issued",
          body: `Certificate ${issued.certificateNumber} is available to download from your portal.`,
          entityType: "certificate",
          entityId: issued.id,
          link: "/portal",
        });
      }

      return issued;
    }),

  revoke: permissionProcedure("certificates.write")
    .input(
      z.object({
        certificateId: z.number().int().positive(),
        reason: z.string().min(2).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select()
        .from(certificates)
        .where(eq(certificates.id, input.certificateId))
        .limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found." });
      if (before.status === "revoked") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This certificate is already revoked." });
      }

      await db
        .update(certificates)
        .set({ status: "revoked", revokedAt: new Date(), revokedReason: input.reason })
        .where(eq(certificates.id, input.certificateId));

      await recordAudit(db, ctx.actor, {
        action: "revoke_certificate",
        entity: "certificate",
        entityId: input.certificateId,
        entityLabel: before.certificateNumber,
        oldValue: { status: before.status },
        newValue: { status: "revoked", reason: input.reason },
        summary: `${ctx.actor.name ?? "Staff"} revoked ${before.certificateNumber}`,
      });

      return { success: true };
    }),

  /** Everything the printable certificate template needs. */
  detail: permissionProcedure("certificates.read")
    .input(z.object({ certificateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [row] = await db
        .select({
          certificate: certificates,
          studentName: studentProfiles.fullName,
          studentNumber: studentProfiles.studentNumber,
          courseTitle: courses.title,
          issuedBy: users.name,
        })
        .from(certificates)
        .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
        .innerJoin(courses, eq(certificates.courseId, courses.id))
        .leftJoin(users, eq(certificates.issuedByUserId, users.id))
        .where(eq(certificates.id, input.certificateId))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found." });

      const [settings, school] = await Promise.all([
        certificateSettings(db),
        db
          .select({ value: systemSettings.value })
          .from(systemSettings)
          .where(eq(systemSettings.key, "school.profile"))
          .limit(1),
      ]);

      return {
        ...row.certificate,
        studentName: row.studentName,
        studentNumber: row.studentNumber,
        courseTitle: row.courseTitle,
        issuedBy: row.issuedBy,
        settings,
        school: (school[0]?.value ?? {}) as Record<string, string>,
      };
    }),

  verifications: permissionProcedure("certificates.read")
    .input(z.object({ certificateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      return db
        .select()
        .from(certificateVerifications)
        .where(eq(certificateVerifications.certificateId, input.certificateId))
        .orderBy(desc(certificateVerifications.createdAt))
        .limit(50);
    }),
});

/**
 * Public certificate verification (§37).
 *
 * Accepts either the printed certificate number or the token from the QR code.
 * The response is deliberately minimal - enough for an employer to confirm the
 * award is genuine, and nothing more about the student.
 */
export const certificateVerificationRouter = router({
  verify: publicProcedure
    .input(z.object({ value: z.string().trim().min(4).max(64) }))
    .query(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [row] = await db
        .select({
          id: certificates.id,
          certificateNumber: certificates.certificateNumber,
          status: certificates.status,
          issuedAt: certificates.issuedAt,
          completionDate: certificates.completionDate,
          revokedAt: certificates.revokedAt,
          studentName: studentProfiles.fullName,
          studentNumber: studentProfiles.studentNumber,
          courseTitle: courses.title,
        })
        .from(certificates)
        .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
        .innerJoin(courses, eq(certificates.courseId, courses.id))
        .where(
          or(
            eq(certificates.certificateNumber, input.value),
            eq(certificates.verificationToken, input.value),
          ),
        )
        .limit(1);

      // Every lookup is logged, found or not, so abuse is visible.
      await db.insert(certificateVerifications).values({
        certificateId: row?.id ?? null,
        lookupValue: input.value.slice(0, 64),
        wasFound: Boolean(row),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent?.slice(0, 255),
      });

      if (!row) {
        return { status: "not_found" as const, certificate: null };
      }

      return {
        status: row.status === "revoked" ? ("revoked" as const) : ("verified" as const),
        certificate: {
          certificateNumber: row.certificateNumber,
          studentName: row.studentName,
          studentNumber: row.studentNumber,
          courseTitle: row.courseTitle,
          completionDate: row.completionDate,
          issuedAt: row.issuedAt,
          revokedAt: row.revokedAt,
        },
      };
    }),
});

/** Weighted grade across the assessments the student sat for this course. */
async function computeGrade(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  studentId: number,
  courseId: number,
): Promise<string | null> {
  const [bandRow, results] = await Promise.all([
    db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "academic.grading"))
      .limit(1),
    db
      .select({
        score: assessmentResults.score,
        totalScore: assessments.totalScore,
        weight: assessments.weight,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
      .where(and(eq(assessmentResults.studentId, studentId), eq(assessments.courseId, courseId))),
  ]);

  const stored = bandRow[0]?.value as { bands?: Array<{ grade: string; min: number }> } | undefined;
  const bands = stored?.bands?.length ? stored.bands : DEFAULT_BANDS;

  return deriveGrade(results, bands)?.grade ?? null;
}
