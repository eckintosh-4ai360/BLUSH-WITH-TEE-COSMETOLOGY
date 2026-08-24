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
import { courses, enrollments, studentProfiles } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import {
  listInputSchema,
  likePattern,
  paginate,
  paginationBounds,
} from "../services/pagination";
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
});
