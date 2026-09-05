import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  assessmentResults,
  assessments,
  attendanceRecords,
  certificates,
  courseModules,
  courses,
  enrollments,
  intakes,
  people,
  studentProfiles,
} from "@blush/db/schema";
import { studentAccountSummary } from "../../fees";
import { defineTool } from "../types";
import { isoDay, likeTerm, since } from "./shared";

const STUDENT_STATUS = ["active", "suspended", "completed", "graduated", "withdrawn"] as const;

export const studentTools = [
  defineTool({
    name: "count_students",
    description:
      "Count students on the register, optionally by status or course. Use for how-many questions.",
    permissions: ["students.read"],
    input: z.object({
      status: z.enum(STUDENT_STATUS).optional(),
      courseTitle: z.string().optional().describe("Only students enrolled on a matching course."),
    }),
    async run(args, ctx) {
      const filters = [isNull(studentProfiles.deletedAt)];
      if (args.status) filters.push(eq(studentProfiles.status, args.status));

      if (args.courseTitle) {
        const matching = ctx.db
          .select({ id: enrollments.studentId })
          .from(enrollments)
          .innerJoin(courses, eq(enrollments.courseId, courses.id))
          .where(ilike(courses.title, likeTerm(args.courseTitle)));
        filters.push(inArray(studentProfiles.id, matching));
      }

      const [total] = await ctx.db
        .select({ value: count() })
        .from(studentProfiles)
        .where(and(...filters));

      const byStatus = await ctx.db
        .select({ status: studentProfiles.status, value: count() })
        .from(studentProfiles)
        .where(and(...filters))
        .groupBy(studentProfiles.status);

      return {
        total: total?.value ?? 0,
        byStatus: Object.fromEntries(byStatus.map(row => [row.status, row.value])),
        appliedFilters: { status: args.status ?? "any", course: args.courseTitle ?? "any" },
      };
    },
  }),

  defineTool({
    name: "list_students",
    description:
      "List students with status, contact details and student number. Use when asked who, not how many.",
    permissions: ["students.read"],
    input: z.object({
      search: z.string().optional().describe("Name, student number, email or phone."),
      status: z.enum(STUDENT_STATUS).optional(),
      limit: z.number().int().min(1).max(40).default(15),
    }),
    async run(args, ctx) {
      const filters = [isNull(studentProfiles.deletedAt)];
      if (args.status) filters.push(eq(studentProfiles.status, args.status));
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(
            ilike(studentProfiles.fullName, term),
            ilike(studentProfiles.studentNumber, term),
            ilike(studentProfiles.email, term),
            ilike(studentProfiles.phone, term),
          )!,
        );
      }

      const rows = await ctx.db
        .select({
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
          email: studentProfiles.email,
          phone: studentProfiles.phone,
          status: studentProfiles.status,
          registeredOn: studentProfiles.createdAt,
        })
        .from(studentProfiles)
        .where(and(...filters))
        .orderBy(desc(studentProfiles.createdAt))
        .limit(args.limit);

      return { count: rows.length, students: rows };
    },
  }),

  defineTool({
    name: "student_record",
    description:
      "One student in full: courses, fee balance, attendance, results, certificates.",
    permissions: ["students.read"],
    input: z.object({
      identifier: z.string().min(2).describe("Student number, name or email."),
    }),
    async run(args, ctx) {
      const term = likeTerm(args.identifier);
      const [student] = await ctx.db
        .select({
          id: studentProfiles.id,
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
          email: studentProfiles.email,
          phone: studentProfiles.phone,
          status: studentProfiles.status,
          graduatedAt: studentProfiles.graduatedAt,
          registeredOn: studentProfiles.createdAt,
          personId: studentProfiles.personId,
        })
        .from(studentProfiles)
        .where(
          and(
            isNull(studentProfiles.deletedAt),
            or(
              ilike(studentProfiles.studentNumber, term),
              ilike(studentProfiles.fullName, term),
              ilike(studentProfiles.email, term),
            ),
          ),
        )
        .limit(1);

      if (!student) return { found: false, searchedFor: args.identifier };

      const [enrolments, attendance, results, awarded, person] = await Promise.all([
        ctx.db
          .select({
            course: courses.title,
            status: enrollments.status,
            enrolledAt: enrollments.enrolledAt,
            progressPercent: enrollments.progressPercent,
            completedAt: enrollments.completedAt,
          })
          .from(enrollments)
          .innerJoin(courses, eq(enrollments.courseId, courses.id))
          .where(eq(enrollments.studentId, student.id))
          .orderBy(desc(enrollments.enrolledAt)),
        ctx.db
          .select({ status: attendanceRecords.status, value: count() })
          .from(attendanceRecords)
          .innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id))
          .where(eq(enrollments.studentId, student.id))
          .groupBy(attendanceRecords.status),
        ctx.db
          .select({
            assessment: assessments.title,
            type: assessments.assessmentType,
            score: assessmentResults.score,
            outOf: assessments.totalScore,
            grade: assessmentResults.grade,
          })
          .from(assessmentResults)
          .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
          .where(and(eq(assessmentResults.studentId, student.id), isNull(assessments.deletedAt)))
          .orderBy(desc(assessmentResults.createdAt))
          .limit(15),
        ctx.db
          .select({
            certificateNumber: certificates.certificateNumber,
            course: courses.title,
            finalGrade: certificates.finalGrade,
            status: certificates.status,
            issuedAt: certificates.issuedAt,
          })
          .from(certificates)
          .innerJoin(courses, eq(certificates.courseId, courses.id))
          .where(eq(certificates.studentId, student.id)),
        student.personId
          ? ctx.db
              .select({
                address: people.address,
                city: people.city,
                emergencyContactName: people.emergencyContactName,
                emergencyContactPhone: people.emergencyContactPhone,
              })
              .from(people)
              .where(eq(people.id, student.personId))
              .limit(1)
          : Promise.resolve([]),
      ]);

      const marks = Object.fromEntries(attendance.map(row => [row.status, row.value]));
      const totalMarks = attendance.reduce((sum, row) => sum + row.value, 0);
      const present = (marks.present ?? 0) + (marks.late ?? 0);

      const { id: _id, personId: _personId, ...profile } = student;

      // A fee balance is money, and is shown only to a caller allowed to see
      // money - the same rule the finance screens follow.
      const account = ctx.access?.can("fees.read")
        ? await studentAccountSummary(ctx.db, student.id)
        : null;

      return {
        found: true,
        student: { ...profile, ...(person[0] ?? {}) },
        enrolments,
        feeAccount: account
          ? { ...account, currency: "GHS" }
          : "withheld - this account cannot view fee records",
        attendance: {
          marksRecorded: totalMarks,
          breakdown: marks,
          attendanceRatePercent: totalMarks ? Math.round((present / totalMarks) * 100) : null,
        },
        results,
        certificates: awarded,
      };
    },
  }),

  defineTool({
    name: "attendance_summary",
    description:
      "Attendance across the school over recent days, overall and per course.",
    permissions: ["attendance.read"],
    input: z.object({
      days: z.number().int().min(1).max(365).default(30),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);

      const [overall, byCourse] = await Promise.all([
        ctx.db
          .select({ status: attendanceRecords.status, value: count() })
          .from(attendanceRecords)
          .where(gte(attendanceRecords.classDate, from))
          .groupBy(attendanceRecords.status),
        ctx.db
          .select({
            course: courses.title,
            present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present','late'))`,
            marks: count(),
          })
          .from(attendanceRecords)
          .innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id))
          .innerJoin(courses, eq(enrollments.courseId, courses.id))
          .where(gte(attendanceRecords.classDate, from))
          .groupBy(courses.title)
          .orderBy(desc(count()))
          .limit(12),
      ]);

      const marks = Object.fromEntries(overall.map(row => [row.status, row.value]));
      const total = overall.reduce((sum, row) => sum + row.value, 0);
      const present = (marks.present ?? 0) + (marks.late ?? 0);

      return {
        window: { days: args.days, from: isoDay(from) },
        marksRecorded: total,
        breakdown: marks,
        attendanceRatePercent: total ? Math.round((present / total) * 100) : null,
        byCourse: byCourse.map(row => ({
          course: row.course,
          marks: Number(row.marks),
          attendanceRatePercent: Number(row.marks)
            ? Math.round((Number(row.present) / Number(row.marks)) * 100)
            : null,
        })),
      };
    },
  }),
];

export const academicTools = [
  defineTool({
    name: "list_courses",
    description:
      "Course catalogue: tuition, duration, syllabus and enrolment counts. Use for anything about programmes or course fees.",
    permissions: ["academics.read", "students.read", "admissions.read"],
    input: z.object({
      search: z.string().optional().describe("Course title, code or category."),
      includeModules: z.boolean().default(false).describe("Include the syllabus outline."),
      limit: z.number().int().min(1).max(30).default(20),
    }),
    async run(args, ctx) {
      const filters = [isNull(courses.deletedAt), eq(courses.isActive, true)];
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(ilike(courses.title, term), ilike(courses.code, term), ilike(courses.category, term))!,
        );
      }

      const rows = await ctx.db
        .select({
          id: courses.id,
          code: courses.code,
          title: courses.title,
          category: courses.category,
          summary: courses.summary,
          durationWeeks: courses.durationWeeks,
          tuition: courses.tuition,
          productFee: courses.productFee,
          schedule: courses.schedule,
          certification: courses.certification,
          requirements: courses.requirements,
          activeStudents: sql<number>`(
            select count(*) from ${enrollments}
            where ${enrollments.courseId} = ${courses.id} and ${enrollments.status} = 'active'
          )`,
        })
        .from(courses)
        .where(and(...filters))
        .orderBy(asc(courses.category), asc(courses.title))
        .limit(args.limit);

      if (!args.includeModules || !rows.length) {
        return { currency: "GHS", count: rows.length, courses: rows.map(stripId) };
      }

      const modules = await ctx.db
        .select({ courseId: courseModules.courseId, title: courseModules.title })
        .from(courseModules)
        .where(
          and(
            inArray(
              courseModules.courseId,
              rows.map(row => row.id),
            ),
            eq(courseModules.isActive, true),
          ),
        )
        .orderBy(asc(courseModules.sequence));

      return {
        currency: "GHS",
        count: rows.length,
        courses: rows.map(row => ({
          ...stripId(row),
          covers: modules.filter(module => module.courseId === row.id).map(module => module.title),
        })),
      };
    },
  }),

  defineTool({
    name: "list_intakes",
    description:
      "Intakes with start dates, deadlines and capacity. Use for when the next class starts.",
    permissions: ["academics.read", "admissions.read"],
    input: z.object({
      status: z.enum(["open", "closed", "completed"]).optional(),
      limit: z.number().int().min(1).max(25).default(12),
    }),
    async run(args, ctx) {
      const rows = await ctx.db
        .select({
          title: intakes.title,
          course: courses.title,
          startDate: intakes.startDate,
          endDate: intakes.endDate,
          applicationDeadline: intakes.applicationDeadline,
          capacity: intakes.capacity,
          status: intakes.status,
          enrolled: sql<number>`(
            select count(*) from ${enrollments} where ${enrollments.intakeId} = ${intakes.id}
          )`,
        })
        .from(intakes)
        .innerJoin(courses, eq(intakes.courseId, courses.id))
        .where(args.status ? eq(intakes.status, args.status) : undefined)
        .orderBy(desc(intakes.startDate))
        .limit(args.limit);

      return { count: rows.length, intakes: rows };
    },
  }),

  defineTool({
    name: "list_certificates",
    description: "Certificates awarded to graduates, with grade and status.",
    permissions: ["certificates.read"],
    input: z.object({
      search: z.string().optional().describe("Certificate number or student name."),
      status: z.enum(["issued", "revoked"]).optional(),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    async run(args, ctx) {
      const filters = [];
      if (args.status) filters.push(eq(certificates.status, args.status));
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(ilike(certificates.certificateNumber, term), ilike(studentProfiles.fullName, term))!,
        );
      }

      const rows = await ctx.db
        .select({
          certificateNumber: certificates.certificateNumber,
          student: studentProfiles.fullName,
          studentNumber: studentProfiles.studentNumber,
          course: courses.title,
          finalGrade: certificates.finalGrade,
          status: certificates.status,
          issuedAt: certificates.issuedAt,
          completionDate: certificates.completionDate,
        })
        .from(certificates)
        .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
        .innerJoin(courses, eq(certificates.courseId, courses.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(certificates.issuedAt))
        .limit(args.limit);

      return { count: rows.length, certificates: rows };
    },
  }),
];

export const admissionTools = [
  defineTool({
    name: "list_applications",
    description:
      "Admissions pipeline: who applied, for what, and where each application stands.",
    permissions: ["admissions.read"],
    input: z.object({
      status: z
        .enum(["draft", "submitted", "under_review", "more_information", "approved", "rejected"])
        .optional(),
      search: z.string().optional().describe("Applicant name, reference, email or phone."),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    async run(args, ctx) {
      const filters = [isNull(applications.deletedAt)];
      if (args.status) filters.push(eq(applications.status, args.status));
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(
            ilike(applications.fullName, term),
            ilike(applications.reference, term),
            ilike(applications.email, term),
            ilike(applications.phone, term),
          )!,
        );
      }

      const [rows, byStatus] = await Promise.all([
        ctx.db
          .select({
            reference: applications.reference,
            fullName: applications.fullName,
            email: applications.email,
            phone: applications.phone,
            course: courses.title,
            status: applications.status,
            submittedAt: applications.submittedAt,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .innerJoin(courses, eq(applications.courseId, courses.id))
          .where(and(...filters))
          .orderBy(desc(applications.createdAt))
          .limit(args.limit),
        ctx.db
          .select({ status: applications.status, value: count() })
          .from(applications)
          .where(isNull(applications.deletedAt))
          .groupBy(applications.status),
      ]);

      return {
        count: rows.length,
        applications: rows,
        pipelineTotals: Object.fromEntries(byStatus.map(row => [row.status, row.value])),
      };
    },
  }),
];

function stripId<T extends { id: number }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  return rest;
}
