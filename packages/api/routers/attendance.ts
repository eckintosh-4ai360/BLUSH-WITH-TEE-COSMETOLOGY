import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  attendanceRecords,
  courses,
  enrollments,
  studentProfiles,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { permissionProcedure, router } from "../trpc";

/**
 * The daily attendance register (§23).
 *
 * Marking a class is one action, not one action per student: an instructor
 * standing in front of a room wants to open today's list, change the two people
 * who are not there, and save. That shape is why `mark` takes the whole
 * register rather than a single row, and why the page can send a full class in
 * one request instead of thirty.
 *
 * Re-marking is expected — someone arrives late, or a mistake is corrected —
 * so writes upsert on `(enrollmentId, classDate)`. The unique index has always
 * said "one mark per student per class day"; this is the first code that
 * actually honours it rather than colliding with it.
 */

const ATTENDANCE_STATUS = ["present", "late", "absent", "excused"] as const;

/** A year at a time. Long enough for a full intake, short enough to stay one query. */
const MAX_HISTORY_DAYS = 366;

/**
 * A calendar day, not an instant.
 *
 * Taken as `YYYY-MM-DD` text and built in UTC rather than accepting a Date,
 * because a browser in Accra sending midnight local time as an ISO instant can
 * land on the previous day once Postgres casts it — which would file Monday's
 * register under Sunday.
 */
const classDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date written as YYYY-MM-DD.")
  .transform((value, ctx) => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      ctx.addIssue({ code: "custom", message: "That is not a real date." });
      return z.NEVER;
    }
    return date;
  });

export const attendanceRouter = router({
  /**
   * Today's list for one programme: every active enrolment, with whatever was
   * already recorded for that date.
   *
   * Withdrawn and completed enrolments are left out — they are not in the room
   * — but paused ones are kept, because a pause is often the very thing an
   * absence record is evidence for.
   */
  register: permissionProcedure("attendance.read")
    .input(
      z.object({
        courseId: z.number().int().positive(),
        classDate: classDateInput,
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [course] = await db
        .select({ id: courses.id, title: courses.title })
        .from(courses)
        .where(eq(courses.id, input.courseId))
        .limit(1);
      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That programme was not found." });
      }

      const rows = await db
        .select({
          enrollmentId: enrollments.id,
          studentId: studentProfiles.id,
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
          enrolmentStatus: enrollments.status,
          status: attendanceRecords.status,
          note: attendanceRecords.note,
          recordedAt: attendanceRecords.createdAt,
        })
        .from(enrollments)
        .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
        // Left-joined on the date so an unmarked student still appears, with a
        // null status. An inner join would silently hide exactly the people the
        // register exists to catch.
        .leftJoin(
          attendanceRecords,
          and(
            eq(attendanceRecords.enrollmentId, enrollments.id),
            eq(attendanceRecords.classDate, input.classDate),
          ),
        )
        .where(
          and(
            eq(enrollments.courseId, input.courseId),
            inArray(enrollments.status, ["active", "paused"]),
            sql`${studentProfiles.deletedAt} is null`,
          ),
        )
        .orderBy(asc(studentProfiles.fullName));

      return {
        course,
        classDate: input.classDate,
        markedCount: rows.filter(row => row.status !== null).length,
        students: rows,
      };
    }),

  /** Programmes that have somebody enrolled, for the register's picker. */
  markableCourses: permissionProcedure("attendance.read").query(async () => {
    const db = await dbOrThrow();

    return db
      .select({
        id: courses.id,
        title: courses.title,
        code: courses.code,
        enrolled: count(enrollments.id),
      })
      .from(courses)
      .innerJoin(enrollments, eq(enrollments.courseId, courses.id))
      .where(inArray(enrollments.status, ["active", "paused"]))
      .groupBy(courses.id)
      .orderBy(asc(courses.title));
  }),

  /**
   * Saves a whole register in one transaction.
   *
   * All or nothing on purpose: a half-saved register is worse than an unsaved
   * one, because it looks finished.
   */
  mark: permissionProcedure("attendance.write")
    .input(
      z.object({
        classDate: classDateInput,
        entries: z
          .array(
            z.object({
              enrollmentId: z.number().int().positive(),
              status: z.enum(ATTENDANCE_STATUS),
              note: z.string().trim().max(255).optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const ids = input.entries.map(entry => entry.enrollmentId);
      if (new Set(ids).size !== ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The same student appears twice in that register.",
        });
      }

      // Checked before writing rather than trusting the ids the browser sent:
      // an enrolment id is a plain integer, and nothing else stops a caller
      // marking somebody on a programme they cannot see.
      const known = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(inArray(enrollments.id, ids));

      if (known.length !== ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That register refers to an enrolment that no longer exists.",
        });
      }

      await db.transaction(async tx => {
        await tx
          .insert(attendanceRecords)
          .values(
            input.entries.map(entry => ({
              enrollmentId: entry.enrollmentId,
              classDate: input.classDate,
              status: entry.status,
              note: entry.note || null,
              recordedByUserId: ctx.user.id,
            })),
          )
          .onConflictDoUpdate({
            target: [attendanceRecords.enrollmentId, attendanceRecords.classDate],
            set: {
              status: sql`excluded.status`,
              note: sql`excluded.note`,
              recordedByUserId: sql`excluded."recordedByUserId"`,
            },
          });

        const counts = ATTENDANCE_STATUS.reduce<Record<string, number>>((totals, status) => {
          totals[status] = input.entries.filter(entry => entry.status === status).length;
          return totals;
        }, {});

        await recordAudit(tx, ctx.actor, {
          action: "record_attendance",
          entity: "attendanceRecord",
          entityLabel: input.classDate.toISOString().slice(0, 10),
          newValue: { students: input.entries.length, ...counts },
          summary: `${ctx.actor.name ?? "Staff"} marked ${input.entries.length} student${input.entries.length === 1 ? "" : "s"} for ${input.classDate.toISOString().slice(0, 10)}`,
        });
      });

      return { saved: input.entries.length };
    }),

  /**
   * Every mark in a window, one row per student per day.
   *
   * Flat rather than summarised because this is what gets exported: a
   * spreadsheet of marks can be pivoted into whatever shape the reader wants,
   * where a pre-summarised one cannot be taken apart again. Absences sort to
   * the front of a day so the exception is the first thing read.
   */
  history: permissionProcedure("attendance.read")
    .input(
      z
        .object({
          /** Omitted means every programme, for a whole-school export. */
          courseId: z.number().int().positive().optional(),
          from: classDateInput,
          to: classDateInput,
        })
        .refine(value => value.from <= value.to, {
          message: "The start date comes after the end date.",
          path: ["from"],
        })
        .refine(
          value =>
            (value.to.getTime() - value.from.getTime()) / 86_400_000 <= MAX_HISTORY_DAYS,
          {
            message: `A range covers at most ${MAX_HISTORY_DAYS} days. Export a shorter window.`,
            path: ["to"],
          },
        ),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const rows = await db
        .select({
          classDate: attendanceRecords.classDate,
          status: attendanceRecords.status,
          note: attendanceRecords.note,
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
          courseTitle: courses.title,
          markedBy: users.name,
        })
        .from(attendanceRecords)
        .innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id))
        .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .leftJoin(users, eq(attendanceRecords.recordedByUserId, users.id))
        .where(
          and(
            gte(attendanceRecords.classDate, input.from),
            lte(attendanceRecords.classDate, input.to),
            input.courseId ? eq(enrollments.courseId, input.courseId) : undefined,
            sql`${studentProfiles.deletedAt} is null`,
          ),
        )
        .orderBy(
          desc(attendanceRecords.classDate),
          // Anything other than "present" first within a day.
          sql`(${attendanceRecords.status} = 'present')`,
          asc(studentProfiles.fullName),
        );

      const totals = { present: 0, late: 0, absent: 0, excused: 0 };
      for (const row of rows) totals[row.status] += 1;

      return {
        rows: rows.map(row => ({
          ...row,
          classDate: row.classDate.toISOString().slice(0, 10),
        })),
        totals,
        // Distinct days actually marked, so an empty Sunday is not counted as
        // a day the school failed to take a register.
        daysMarked: new Set(rows.map(row => row.classDate.toISOString().slice(0, 10))).size,
      };
    }),

  /**
   * The last few days marked for a programme, so it is obvious at a glance
   * whether yesterday was missed.
   */
  recentDays: permissionProcedure("attendance.read")
    .input(
      z.object({
        courseId: z.number().int().positive(),
        days: z.number().int().min(1).max(60).default(14),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.days);

      const rows = await db
        .select({
          classDate: attendanceRecords.classDate,
          marked: count(),
          present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')`,
          late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')`,
          absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')`,
          excused: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'excused')`,
        })
        .from(attendanceRecords)
        .innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id))
        .where(
          and(
            eq(enrollments.courseId, input.courseId),
            gte(attendanceRecords.classDate, since),
            lte(attendanceRecords.classDate, new Date()),
          ),
        )
        .groupBy(attendanceRecords.classDate)
        .orderBy(desc(attendanceRecords.classDate));

      return rows.map(row => ({
        classDate: row.classDate,
        marked: Number(row.marked),
        present: Number(row.present),
        late: Number(row.late),
        absent: Number(row.absent),
        excused: Number(row.excused),
      }));
    }),
});
