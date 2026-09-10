import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assessmentResults,
  assessments,
  courseModules,
  courses,
  enrollments,
  studentProfiles,
} from "@blush/db/schema";
import { dbOrThrow, type DbExecutor } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { gradeForPercent, readGrading, toPercent } from "../services/grading";
import { ordinal, positionsByScore, tiedPositions } from "../services/ranking";
import { permissionProcedure, router } from "../trpc";

// Marking an assessment, and the positions that fall out of it.
const MAX_SHEET_ENTRIES = 300;

// Who is sitting the assessment.
async function roster(db: DbExecutor, courseId: number) {
  return db
    .select({
      studentId: studentProfiles.id,
      studentNumber: studentProfiles.studentNumber,
      fullName: studentProfiles.fullName,
      enrolmentStatus: enrollments.status,
    })
    .from(enrollments)
    .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
    .where(
      and(
        eq(enrollments.courseId, courseId),
        inArray(enrollments.status, ["active", "paused"]),
        isNull(studentProfiles.deletedAt),
      ),
    )
    .orderBy(asc(studentProfiles.fullName));
}

// The assessment plus the programme it is set against, or a 404.
async function assessmentOrThrow(db: DbExecutor, assessmentId: number) {
  const [row] = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      assessmentType: assessments.assessmentType,
      totalScore: assessments.totalScore,
      weight: assessments.weight,
      dueDate: assessments.dueDate,
      courseId: assessments.courseId,
      courseTitle: courses.title,
      courseCode: courses.code,
      moduleTitle: courseModules.title,
    })
    .from(assessments)
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .leftJoin(courseModules, eq(assessments.moduleId, courseModules.id))
    // A removed assessment cannot be marked, and its sheet cannot be opened.
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That assessment was not found." });
  }
  return row;
}

export const resultsRouter = router({
  // The catalogue, with how much of each assessment has been marked.
  catalogue: permissionProcedure("results.read").query(async () => {
    const db = await dbOrThrow();

    // Counted with correlated subqueries rather than grouped joins.
    return db
      .select({
        id: assessments.id,
        title: assessments.title,
        assessmentType: assessments.assessmentType,
        totalScore: assessments.totalScore,
        dueDate: assessments.dueDate,
        courseId: assessments.courseId,
        courseTitle: courses.title,
        courseCode: courses.code,
        enrolled: sql<number>`(
          select count(*)::int
          from ${enrollments}
          inner join ${studentProfiles} on ${studentProfiles.id} = ${enrollments.studentId}
          where ${enrollments.courseId} = ${assessments.courseId}
            and ${enrollments.status} in ('active', 'paused')
            and ${studentProfiles.deletedAt} is null
        )`,
        marked: sql<number>`(
          select count(*)::int
          from ${assessmentResults}
          where ${assessmentResults.assessmentId} = ${assessments.id}
        )`,
      })
      .from(assessments)
      .innerJoin(courses, eq(assessments.courseId, courses.id))
      .where(isNull(assessments.deletedAt))
      .orderBy(asc(courses.title), asc(assessments.title));
  }),

  // One assessment's mark sheet.
  sheet: permissionProcedure("results.read")
    .input(z.object({ assessmentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const assessment = await assessmentOrThrow(db, input.assessmentId);
      const [students, existing, grading] = await Promise.all([
        roster(db, assessment.courseId),
        db
          .select({
            studentId: assessmentResults.studentId,
            score: assessmentResults.score,
            instructorComment: assessmentResults.instructorComment,
            updatedAt: assessmentResults.updatedAt,
          })
          .from(assessmentResults)
          .where(eq(assessmentResults.assessmentId, input.assessmentId)),
        readGrading(db),
      ]);

      const byStudent = new Map(existing.map(row => [row.studentId, row]));
      const scores = students.map(student => {
        const held = byStudent.get(student.studentId);
        return held ? Number(held.score) : null;
      });

      const positions = positionsByScore(scores);
      const tied = tiedPositions(positions);

      const rows = students.map((student, index) => {
        const score = scores[index] ?? null;
        const held = byStudent.get(student.studentId);
        const percent = score === null ? null : toPercent(score, assessment.totalScore);

        return {
          ...student,
          score,
          percent,
          grade: percent === null ? null : gradeForPercent(percent, grading.bands),
          passed: percent === null ? null : percent >= grading.passMark,
          position: positions[index] ?? null,
          positionLabel:
            positions[index] === null || positions[index] === undefined
              ? null
              : `${ordinal(positions[index])}${tied.has(positions[index]) ? " (tied)" : ""}`,
          instructorComment: held?.instructorComment ?? "",
          markedAt: held?.updatedAt ?? null,
        };
      });

      // Position order, so the sheet reads as a result sheet.
      rows.sort((a, b) => {
        if (a.position === null && b.position === null) {
          return a.fullName.localeCompare(b.fullName);
        }
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        if (a.position !== b.position) return a.position - b.position;
        return a.fullName.localeCompare(b.fullName);
      });

      const marks = scores.filter((score): score is number => score !== null);
      const percents = marks.map(score => toPercent(score, assessment.totalScore));

      return {
        assessment,
        grading,
        students: rows,
        totals: {
          sitting: students.length,
          marked: marks.length,
          unmarked: students.length - marks.length,
          passed: percents.filter(percent => percent >= grading.passMark).length,
          highest: marks.length ? Math.max(...marks) : null,
          lowest: marks.length ? Math.min(...marks) : null,
          // The class average, in the same units the marks were typed in.
          average: marks.length
            ? Math.round((marks.reduce((sum, mark) => sum + mark, 0) / marks.length) * 100) / 100
            : null,
        },
      };
    }),

  // Saves a whole mark sheet in one transaction.
  record: permissionProcedure("results.write")
    .input(
      z.object({
        assessmentId: z.number().int().positive(),
        entries: z
          .array(
            z.object({
              studentId: z.number().int().positive(),
              // Null clears a mark, which is how a wrong entry is undone.
              score: z.number().min(0).nullable(),
              instructorComment: z.string().trim().max(2000).optional(),
            }),
          )
          .min(1)
          .max(MAX_SHEET_ENTRIES),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const assessment = await assessmentOrThrow(db, input.assessmentId);

      const ids = input.entries.map(entry => entry.studentId);
      if (new Set(ids).size !== ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The same student appears twice on that sheet.",
        });
      }

      // A mark above the total is a typo every time.
      const over = input.entries.find(
        entry => entry.score !== null && entry.score > assessment.totalScore,
      );
      if (over) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${assessment.title} is marked out of ${assessment.totalScore}, so ${over.score} cannot be a score on it.`,
        });
      }

      // Checked against the register rather than trusting the ids the browser sent.
      const sitting = new Set((await roster(db, assessment.courseId)).map(row => row.studentId));
      const stranger = ids.find(id => !sitting.has(id));
      if (stranger !== undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That sheet has a mark for somebody who is not enrolled on this programme.",
        });
      }

      const grading = await readGrading(db);
      const scored = input.entries.filter(
        (entry): entry is typeof entry & { score: number } => entry.score !== null,
      );
      const cleared = input.entries.filter(entry => entry.score === null).map(entry => entry.studentId);

      await db.transaction(async tx => {
        if (scored.length) {
          await tx
            .insert(assessmentResults)
            .values(
              scored.map(entry => {
                const percent = toPercent(entry.score, assessment.totalScore);
                return {
                  assessmentId: input.assessmentId,
                  studentId: entry.studentId,
                  score: entry.score.toFixed(2),
                  // Derived, never taken from the client: a typed letter can disagree with the score sitting.
                  grade: gradeForPercent(percent, grading.bands),
                  instructorComment: entry.instructorComment || null,
                  gradedByUserId: ctx.user.id,
                };
              }),
            )
            .onConflictDoUpdate({
              target: [assessmentResults.assessmentId, assessmentResults.studentId],
              set: {
                score: sql`excluded.score`,
                grade: sql`excluded.grade`,
                instructorComment: sql`excluded."instructorComment"`,
                gradedByUserId: sql`excluded."gradedByUserId"`,
                updatedAt: new Date(),
              },
            });
        }

        if (cleared.length) {
          await tx
            .delete(assessmentResults)
            .where(
              and(
                eq(assessmentResults.assessmentId, input.assessmentId),
                inArray(assessmentResults.studentId, cleared),
              ),
            );
        }

        await recordAudit(tx, ctx.actor, {
          action: "record_results",
          entity: "assessment",
          entityId: assessment.id,
          entityLabel: assessment.title,
          newValue: {
            course: assessment.courseTitle,
            marked: scored.length,
            cleared: cleared.length,
            outOf: assessment.totalScore,
          },
          summary: `${ctx.actor.name ?? "Staff"} marked ${scored.length} student${scored.length === 1 ? "" : "s"} on "${assessment.title}"`,
        });
      });

      return {
        saved: scored.length,
        cleared: cleared.length,
        title: assessment.title,
      };
    }),
});

// One student's mark on one assessment, for the single-entry form on the staff screen.
export async function recordOneResult(
  db: DbExecutor,
  input: {
    assessmentId: number;
    studentId: number;
    score: number;
    instructorComment?: string | null;
    gradedByUserId: number;
  },
): Promise<{ grade: string; percent: number }> {
  const assessment = await assessmentOrThrow(db, input.assessmentId);

  if (input.score > assessment.totalScore) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${assessment.title} is marked out of ${assessment.totalScore}, so ${input.score} cannot be a score on it.`,
    });
  }

  const grading = await readGrading(db);
  const percent = toPercent(input.score, assessment.totalScore);
  const grade = gradeForPercent(percent, grading.bands);

  await db
    .insert(assessmentResults)
    .values({
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      score: input.score.toFixed(2),
      grade,
      instructorComment: input.instructorComment || null,
      gradedByUserId: input.gradedByUserId,
    })
    .onConflictDoUpdate({
      target: [assessmentResults.assessmentId, assessmentResults.studentId],
      set: {
        score: sql`excluded.score`,
        grade: sql`excluded.grade`,
        instructorComment: sql`excluded."instructorComment"`,
        gradedByUserId: sql`excluded."gradedByUserId"`,
        updatedAt: new Date(),
      },
    });

  return { grade, percent };
}
