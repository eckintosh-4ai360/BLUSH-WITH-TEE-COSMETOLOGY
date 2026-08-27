import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { courses, enrollments, studentProfiles } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { recordAudit } from "../services/audit";
import {
  listInputSchema,
  likePattern,
  paginate,
  paginationBounds,
} from "../services/pagination";
import {
  findStudentAccountForEmail,
  grantStudentRole,
  resolvePerson,
} from "../services/people";
import { permissionProcedure, router } from "../trpc";

const STUDENT_STATUS = [
  "active",
  "suspended",
  "completed",
  "graduated",
  "withdrawn",
] as const;

/** Whether a student holds any enrolment at all - the "not yet enrolled" cohort. */
const ENROLMENT_FILTER = ["enrolled", "unenrolled"] as const;

export const studentsRouter = router({
  /** The student register, paginated, searched and filtered server-side (§43). */
  list: permissionProcedure("students.read")
    .input(
      listInputSchema.extend({
        status: z.enum(STUDENT_STATUS).optional(),
        courseId: z.number().int().positive().optional(),
        enrolment: z.enum(ENROLMENT_FILTER).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      // Programme and enrolment filters ask a question about a student's
      // enrolments, not about a joined row - EXISTS keeps one row per student
      // so the page count stays honest however many programmes they hold.
      const enrolmentOf = (extra?: SQL) =>
        db
          .select({ one: sql`1` })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, studentProfiles.id), extra));

      const where = and(
        isNull(studentProfiles.deletedAt),
        input.status ? eq(studentProfiles.status, input.status) : undefined,
        input.courseId
          ? exists(enrolmentOf(eq(enrollments.courseId, input.courseId)))
          : undefined,
        input.enrolment === "enrolled" ? exists(enrolmentOf()) : undefined,
        input.enrolment === "unenrolled" ? notExists(enrolmentOf()) : undefined,
        input.search
          ? or(
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
              ilike(studentProfiles.email, likePattern(input.search)),
              ilike(studentProfiles.phone, likePattern(input.search))
            )
          : undefined
      );

      const [students, [total]] = await Promise.all([
        db
          .select()
          .from(studentProfiles)
          .where(where)
          .orderBy(desc(studentProfiles.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(studentProfiles).where(where),
      ]);

      // Enrolments are fetched for the page only, so a large register costs the
      // same as a small one.
      const ids = students.map(student => student.id);
      const programmes = ids.length
        ? await db
            .select({
              id: enrollments.id,
              studentId: enrollments.studentId,
              courseId: enrollments.courseId,
              courseTitle: courses.title,
              status: enrollments.status,
              progressPercent: enrollments.progressPercent,
            })
            .from(enrollments)
            .innerJoin(courses, eq(enrollments.courseId, courses.id))
            .where(inArray(enrollments.studentId, ids))
            .orderBy(desc(enrollments.enrolledAt))
        : [];

      return paginate(
        students.map(student => ({
          ...student,
          programmes: programmes.filter(
            programme => programme.studentId === student.id
          ),
        })),
        Number(total?.total ?? 0),
        input
      );
    }),

  /**
   * Adds a student directly, without an application.
   *
   * Approving an application is still the main route in (§21) and produces the
   * same record. This exists for the students who never went through the form:
   * a walk-in enrolled at the desk, or a register being typed up from paper.
   *
   * Two things it does that a bare insert would not. It goes through
   * `resolvePerson`, so somebody already known to the school as a customer
   * becomes the same person rather than a second one (§34). And it links an
   * existing portal account with the same email and grants it the student
   * role, so the student can sign in without anybody wiring it up afterwards.
   */
  create: permissionProcedure("students.write")
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().min(7).max(40),
        studentNumber: z.string().trim().max(40).optional(),
        status: z.enum(STUDENT_STATUS).default("active"),
        gender: z.string().trim().max(32).optional(),
        birthDate: z.coerce.date().optional(),
        address: z.string().trim().max(1500).optional(),
        emergencyContactName: z.string().trim().max(160).optional(),
        emergencyContactPhone: z.string().trim().max(40).optional(),
        /** Enrols on a programme straight away. Optional. */
        courseId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const email = input.email.toLowerCase();

      const [duplicate] = await db
        .select({ id: studentProfiles.id, studentNumber: studentProfiles.studentNumber })
        .from(studentProfiles)
        .where(sql`lower(${studentProfiles.email}) = ${email}`)
        .limit(1);
      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A student with that email is already on file as ${duplicate.studentNumber}.`,
        });
      }

      if (input.studentNumber) {
        const [taken] = await db
          .select({ id: studentProfiles.id })
          .from(studentProfiles)
          .where(eq(studentProfiles.studentNumber, input.studentNumber))
          .limit(1);
        if (taken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Student number ${input.studentNumber} already belongs to another student.`,
          });
        }
      }

      if (input.courseId) {
        const [course] = await db
          .select({ id: courses.id })
          .from(courses)
          .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
          .limit(1);
        if (!course) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That programme is unavailable." });
        }
      }

      return db.transaction(async tx => {
        const personId = await resolvePerson(tx, {
          fullName: input.fullName,
          email,
          phone: input.phone,
          birthDate: input.birthDate ?? null,
          gender: input.gender ?? null,
          address: input.address ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        });

        // Only links an account that already exists; it never creates one, so
        // no password is invented on the student's behalf.
        const accountId = await findStudentAccountForEmail(tx, email);

        const studentNumber = input.studentNumber || buildReference("STU");

        const [student] = await tx
          .insert(studentProfiles)
          .values({
            personId,
            userId: accountId,
            studentNumber,
            fullName: input.fullName,
            email,
            phone: input.phone,
            status: input.status,
          })
          .returning({ id: studentProfiles.id });

        if (!student?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The student could not be created.",
          });
        }

        if (accountId) await grantStudentRole(tx, accountId);

        if (input.courseId) {
          await tx.insert(enrollments).values({
            studentId: student.id,
            courseId: input.courseId,
            status: "active",
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "studentProfile",
          entityId: student.id,
          entityLabel: studentNumber,
          newValue: { fullName: input.fullName, email, status: input.status },
          summary: `${ctx.actor.name ?? "Staff"} added ${input.fullName} as ${studentNumber}`,
        });

        return { id: student.id, studentNumber, linkedAccount: Boolean(accountId) };
      });
    }),
});
