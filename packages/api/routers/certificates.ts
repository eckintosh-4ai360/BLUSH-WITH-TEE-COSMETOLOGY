import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assessmentResults,
  assessments,
  certificateScans,
  certificateVerifications,
  certificates,
  courses,
  enrollments,
  studentProfiles,
  systemSettings,
  users,
} from "@blush/db/schema";
import { storageDelete, storageGet, storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { announce } from "../services/messaging/announce";
import { flushInBackground } from "../services/messaging/dispatch";
import {
  certificateSettings,
  deriveGrade,
  issueCertificate,
} from "../services/certificates";
import { readGrading } from "../services/grading";
import { notify } from "../services/notify";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import {
  MAX_UPLOAD_BASE64_LENGTH,
  safeFileName,
  validateDocumentUpload,
} from "../platform.utils";
import { permissionProcedure, router, throttledPublicProcedure } from "../trpc";

/**
 * Certificate numbers are sequential and printed on the award, so `verify` is
 * the one public endpoint an attacker can walk to harvest every graduate.
 * An employer checks a handful; a scraper wants thousands.
 */
const verifyLimit = throttledPublicProcedure({ bucket: "certificates.verify", limit: 20, windowMs: 10 * 60_000 });

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
            // Counted here rather than fetched per row: the table shows only
            // whether a scan is on file, and one query should answer that.
            scanCount: sql<number>`(
              select count(*) from ${certificateScans}
              where ${certificateScans.certificateId} = ${certificates.id}
            )`,
            // The newest copy is the one Print hands over, so the row carries
            // its key. Resolved here rather than fetched on click: opening a
            // tab after an await is what popup blockers stop.
            latestScanKey: sql<string | null>`(
              select ${certificateScans.storageKey} from ${certificateScans}
              where ${certificateScans.certificateId} = ${certificates.id}
              order by ${certificateScans.createdAt} desc
              limit 1
            )`,
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
        await Promise.all(
          rows.map(async row => ({
            ...row.certificate,
            studentName: row.studentName,
            studentNumber: row.studentNumber,
            courseTitle: row.courseTitle,
            scanCount: Number(row.scanCount ?? 0),
            scanUrl: row.latestScanKey ? (await storageGet(row.latestScanKey)).url : null,
          })),
        ),
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
          email: studentProfiles.email,
          phone: studentProfiles.phone,
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

      const [course] = await db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, input.courseId))
        .limit(1);

      await announce(db, {
        type: "certificate_issued",
        recipient: {
          name: student.fullName,
          email: student.email,
          phone: student.phone,
          userId: student.userId,
        },
        title: "Your certificate has been issued",
        body: `Certificate ${issued.certificateNumber} is available to download from your portal.`,
        facts: { course: course?.title, reference: issued.certificateNumber },
        entityType: "certificate",
        entityId: issued.id,
        link: "/portal",
      });
      flushInBackground(db);

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

  /**
   * Scanned copies of the paper award.
   *
   * The certificate the app prints is generated from the row; what the school
   * hands over is signed, stamped, and sometimes signed back on collection.
   * These are those scans, kept against the record so the office file can be
   * answered from the certificate rather than from a filing cabinet.
   *
   * The bytes live behind the storage proxy, so what reaches the browser is an
   * app URL authorized on every fetch, never a Cloudinary address.
   */
  scans: permissionProcedure("certificates.read")
    .input(z.object({ certificateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const rows = await db
        .select({
          id: certificateScans.id,
          storageKey: certificateScans.storageKey,
          fileName: certificateScans.fileName,
          mimeType: certificateScans.mimeType,
          sizeBytes: certificateScans.sizeBytes,
          note: certificateScans.note,
          createdAt: certificateScans.createdAt,
          uploadedBy: users.name,
        })
        .from(certificateScans)
        .leftJoin(users, eq(certificateScans.uploadedByUserId, users.id))
        .where(eq(certificateScans.certificateId, input.certificateId))
        .orderBy(desc(certificateScans.createdAt));

      return Promise.all(
        rows.map(async row => ({ ...row, url: (await storageGet(row.storageKey)).url })),
      );
    }),

  uploadScan: permissionProcedure("certificates.write")
    .input(
      z.object({
        certificateId: z.number().int().positive(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(3).max(120),
        base64Data: z.string().min(8).max(MAX_UPLOAD_BASE64_LENGTH),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [certificate] = await db
        .select({
          id: certificates.id,
          certificateNumber: certificates.certificateNumber,
          studentName: studentProfiles.fullName,
        })
        .from(certificates)
        .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
        .where(eq(certificates.id, input.certificateId))
        .limit(1);
      if (!certificate) throw new TRPCError({ code: "NOT_FOUND", message: "Certificate not found." });

      // Checks the declared type against the file's own signature, so a
      // renamed executable cannot arrive dressed as a scan.
      let buffer: Buffer;
      try {
        buffer = validateDocumentUpload(input.mimeType, input.base64Data);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid file.",
        });
      }

      const fileName = safeFileName(input.fileName);
      const stored = await storagePut(
        `certificates/${certificate.id}/${Date.now()}-${fileName}`,
        buffer,
        input.mimeType,
      );

      const [inserted] = await db
        .insert(certificateScans)
        .values({
          certificateId: certificate.id,
          storageKey: stored.key,
          fileName,
          mimeType: input.mimeType,
          sizeBytes: buffer.length,
          note: input.note || null,
          uploadedByUserId: ctx.user.id,
        })
        .returning({ id: certificateScans.id });

      await recordAudit(db, ctx.actor, {
        action: "upload_certificate_scan",
        entity: "certificate",
        entityId: certificate.id,
        entityLabel: certificate.certificateNumber,
        newValue: { fileName, sizeBytes: buffer.length, note: input.note ?? null },
        summary: `${ctx.actor.name ?? "Staff"} filed a scanned copy of ${certificate.certificateNumber} for ${certificate.studentName}`,
      });

      return { id: inserted?.id, url: stored.url, fileName };
    }),

  deleteScan: permissionProcedure("certificates.write")
    .input(z.object({ scanId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [scan] = await db
        .select({
          id: certificateScans.id,
          certificateId: certificateScans.certificateId,
          storageKey: certificateScans.storageKey,
          fileName: certificateScans.fileName,
          certificateNumber: certificates.certificateNumber,
        })
        .from(certificateScans)
        .innerJoin(certificates, eq(certificateScans.certificateId, certificates.id))
        .where(eq(certificateScans.id, input.scanId))
        .limit(1);
      if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "That scan is no longer on file." });

      await db.delete(certificateScans).where(eq(certificateScans.id, input.scanId));

      // The row is what the app reads, so it goes first. An object that
      // outlives it is unreachable - nothing holds the key any more - and a
      // storage outage should not pin a wrongly filed scan to the record.
      try {
        await storageDelete(scan.storageKey);
      } catch {
        // Left for the storage account to tidy up.
      }

      await recordAudit(db, ctx.actor, {
        action: "delete_certificate_scan",
        entity: "certificate",
        entityId: scan.certificateId,
        entityLabel: scan.certificateNumber,
        oldValue: { fileName: scan.fileName, storageKey: scan.storageKey },
        summary: `${ctx.actor.name ?? "Staff"} removed a scanned copy of ${scan.certificateNumber}`,
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
  verify: verifyLimit
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
  const [grading, results] = await Promise.all([
    readGrading(db),
    db
      .select({
        score: assessmentResults.score,
        totalScore: assessments.totalScore,
        weight: assessments.weight,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
      .where(
        and(
          eq(assessmentResults.studentId, studentId),
          eq(assessments.courseId, courseId),
          isNull(assessments.deletedAt),
        ),
      ),
  ]);

  return deriveGrade(results, grading.bands)?.grade ?? null;
}
