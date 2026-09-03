--> The old constraint claimed "not two live enrolments on the same course" and
--> never enforced it: `intakeId` is null on every enrolment the academics
--> screen creates, and Postgres treats nulls in a unique constraint as
--> distinct, so it matched nothing. It also blocked a legitimate retake within
--> the same intake, which the partial index below deliberately allows.
ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollment_student_course_intake_unique";--> statement-breakpoint

--> Withdraw the duplicates before the index refuses them.
--> Keeps the earliest live enrolment on each (student, course) pair - the one
--> attendance, fees and results were most likely recorded against - and retires
--> the rest rather than deleting them, because `attendanceRecords` cascades off
--> `enrollmentId` and certificates and fee charges point at it.
UPDATE "enrollments" SET "status" = 'withdrawn'
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "studentId", "courseId"
      ORDER BY "enrolledAt" ASC, "id" ASC
    ) AS "seq"
    FROM "enrollments"
    WHERE "status" IN ('active', 'paused')
  ) "ranked"
  WHERE "ranked"."seq" > 1
);--> statement-breakpoint

--> One live enrolment per student per course. Partial, so withdrawing or
--> completing one leaves the student free to sit the course again.
CREATE UNIQUE INDEX "enrollment_live_course_unique"
  ON "enrollments" USING btree ("studentId", "courseId")
  WHERE "status" IN ('active', 'paused');
