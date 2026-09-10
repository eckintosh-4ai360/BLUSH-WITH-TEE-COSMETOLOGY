import {
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applicationDocuments,
  applications,
  assessmentResults,
  assessments,
  courseModules,
  courses,
  enrollments,
  expenseCategories,
  expenses,
  feeCharges,
  inventoryItems,
  inventoryMovements,
  mediaFiles,
  payments,
  paymentPlans,
  storeOrders,
  studentProfiles,
} from "@blush/db/schema";
import { DEFAULT_COURSE_CATEGORY } from "@blush/shared/const";
import { storageGet, storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { syncStudentCharges } from "../services/billing";
import { ensurePlatformBootstrapped } from "../services/bootstrap";
import { isUniqueViolation } from "../services/dbErrors";
import { allocatePayment, studentAccountSummary } from "../services/fees";
import { likePattern } from "../services/pagination";
import {
  findStudentAccountForEmail,
  grantStudentRole,
  resolvePerson,
} from "../services/people";
import {
  MAX_UPLOAD_BASE64_LENGTH,
  buildReference,
  money,
  safeFileName,
  slugify,
  validateDocumentUpload,
} from "../platform.utils";
import { announce } from "../services/messaging/announce";
import { flushInBackground } from "../services/messaging/dispatch";
import { adminProcedure, permissionProcedure, router } from "../trpc";

// One syllabus line, as the school advertises it.
const outlineInput = z.array(z.string().trim().min(1).max(180)).max(40).optional();

// The values expenses.
const LEGACY_EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "transport",
  "equipment",
  "beauty_products",
  "maintenance",
  "marketing",
  "stationery",
  "cleaning",
  "other",
] as const;

function isLegacyExpenseCategory(key: string): key is (typeof LEGACY_EXPENSE_CATEGORIES)[number] {
  return (LEGACY_EXPENSE_CATEGORIES as readonly string[]).includes(key);
}

// Says what is in the way and what to do about it, not that a write failed.
function alreadyEnrolled(studentName: string, courseTitle: string, status: string): string {
  const standing = status === "paused" ? "a paused enrolment on" : "already on";
  return `${studentName} is ${standing} ${courseTitle}. Remove that enrolment, or graduate the student, before placing them on it again.`;
}

// Rewrites a programme's syllabus to exactly outline, in that order.
async function saveOutline(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof dbOrThrow>>["transaction"]>[0]>[0],
  courseId: number,
  outline: string[],
): Promise<void> {
  const titles = outline.map(title => title.trim()).filter(Boolean);

  const existing = await tx
    .select({ id: courseModules.id, sequence: courseModules.sequence })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(asc(courseModules.sequence), asc(courseModules.id));

  for (const [index, title] of titles.entries()) {
    const sequence = index + 1;
    const row = existing[index];
    if (row) {
      await tx
        .update(courseModules)
        .set({ title, sequence, isActive: true })
        .where(eq(courseModules.id, row.id));
    } else {
      await tx.insert(courseModules).values({
        courseId,
        code: `M${String(sequence).padStart(2, "0")}`,
        title,
        sequence,
      });
    }
  }

  const surplus = existing.slice(titles.length).map(row => row.id);
  if (surplus.length) {
    await tx.delete(courseModules).where(inArray(courseModules.id, surplus));
  }
}

export const adminNamespaceRouter = router({
  dashboard: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const [[studentCount], [applicationCount], [orderCount], [lowStockCount], recentOrders, recentApplications] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(studentProfiles),
      db.select({ count: sql<number>`count(*)` }).from(applications).where(and(eq(applications.status, "submitted"), isNull(applications.deletedAt))),
      db.select({ count: sql<number>`count(*)` }).from(storeOrders).where(eq(storeOrders.fulfillmentStatus, "new")),
      db.select({ count: sql<number>`count(*)` }).from(inventoryItems).where(sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`),
      db.select().from(storeOrders).orderBy(desc(storeOrders.createdAt)).limit(5),
      db.select({ reference: applications.reference, fullName: applications.fullName, status: applications.status, createdAt: applications.createdAt, courseTitle: courses.title }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).where(isNull(applications.deletedAt)).orderBy(desc(applications.createdAt)).limit(5),
    ]);
    return {
      metrics: {
        students: Number(studentCount?.count ?? 0),
        newApplications: Number(applicationCount?.count ?? 0),
        newOrders: Number(orderCount?.count ?? 0),
        lowStock: Number(lowStockCount?.count ?? 0),
      },
      recentOrders: recentOrders.map(order => ({ ...order, total: money(order.total) })),
      recentApplications,
    };
  }),

  applications: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        search: z.string().max(200).optional(),
        status: z
          .enum(["draft", "submitted", "under_review", "more_information", "approved", "rejected"])
          .optional(),
        // Length of the programme applied for, in weeks.
        durationWeeks: z.number().int().positive().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { page = 1, pageSize = 20, search, status, durationWeeks } = input;

      // A removed application is gone from every list that reads this, the export included.
      const conditions: SQL[] = [isNull(applications.deletedAt)];
      if (status) conditions.push(eq(applications.status, status));
      if (durationWeeks) conditions.push(eq(courses.durationWeeks, durationWeeks));
      if (search && search.trim()) {
        const pattern = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(applications.fullName, pattern),
            ilike(applications.email, pattern),
            ilike(applications.reference, pattern)
          )!
        );
      }

      const where = and(...conditions);
      const offset = (page - 1) * pageSize;

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            application: applications,
            courseTitle: courses.title,
            // What the applicant was quoted.
            courseTuition: sql<string | null>`coalesce(${applications.tuition}, ${courses.tuition})`,
            courseProductFee: sql<string | null>`coalesce(${applications.productFee}, ${courses.productFee})`,
          })
          .from(applications)
          .innerJoin(courses, eq(applications.courseId, courses.id))
          .where(where)
          .orderBy(desc(applications.createdAt))
          .limit(pageSize)
          .offset(offset),
        // Joined here as well as above because the duration filter asks about the course.
        db
          .select({ total: count() })
          .from(applications)
          .innerJoin(courses, eq(applications.courseId, courses.id))
          .where(where),
      ]);

      const total = Number(totalRow?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return { rows, page, pageSize, total, totalPages, hasMore: page < totalPages };
    }),

  applicationDocuments: adminProcedure.input(z.object({ applicationId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const documents = await db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, input.applicationId));
    return Promise.all(documents.map(async document => ({ ...document, url: (await storageGet(document.storageKey)).url })));
  }),

  // The students who can still be placed on a programme.
  students: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.select({ student: studentProfiles, enrollment: enrollments, courseTitle: courses.title }).from(studentProfiles).leftJoin(enrollments, eq(studentProfiles.id, enrollments.studentId)).leftJoin(courses, eq(enrollments.courseId, courses.id)).where(and(isNull(studentProfiles.deletedAt), ne(studentProfiles.status, "graduated"))).orderBy(desc(studentProfiles.createdAt), desc(enrollments.enrolledAt));
    type Row = (typeof rows)[number];
    const byStudent = new Map<number, { student: Row["student"]; enrollments: { enrollment: NonNullable<Row["enrollment"]>; courseTitle: Row["courseTitle"] }[] }>();
    for (const row of rows) {
      const entry = byStudent.get(row.student.id) ?? { student: row.student, enrollments: [] };
      if (row.enrollment) entry.enrollments.push({ enrollment: row.enrollment, courseTitle: row.courseTitle });
      byStudent.set(row.student.id, entry);
    }
    return [...byStudent.values()];
  }),

  createEnrollment: adminProcedure.input(z.object({ studentId: z.number().int().positive(), courseId: z.number().int().positive(), expectedCompletionDate: z.coerce.date().optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();

    // Leaving a removed or graduated student out of the picker is presentation.
    const [student] = await db
      .select({ id: studentProfiles.id, fullName: studentProfiles.fullName, status: studentProfiles.status })
      .from(studentProfiles)
      .where(and(eq(studentProfiles.id, input.studentId), isNull(studentProfiles.deletedAt)))
      .limit(1);

    if (!student) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That student is no longer on the register." });
    }
    if (student.status === "graduated") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That student has graduated and cannot be placed on a programme.",
      });
    }

    const [course] = await db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1);

    if (!course) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That programme was not found." });
    }

    // Read first so the refusal can name the student and the programme.
    const [live] = await db
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, input.studentId),
          eq(enrollments.courseId, input.courseId),
          inArray(enrollments.status, ["active", "paused"]),
        ),
      )
      .limit(1);

    if (live) {
      throw new TRPCError({ code: "CONFLICT", message: alreadyEnrolled(student.fullName, course.title, live.status) });
    }

    try {
      const [enrollment] = await db.insert(enrollments).values({ studentId: input.studentId, courseId: input.courseId, expectedCompletionDate: input.expectedCompletionDate }).returning({ id: enrollments.id });

      // Placing a student on a programme is what makes them liable for its fees.
      const billed = await syncStudentCharges(db, input.studentId, ctx.user.id);

      return { id: enrollment?.id, charged: billed.raised + billed.repaired };
    } catch (error) {
      // Two people enrolling the same student at once both pass the read above.
      if (isUniqueViolation(error, "enrollment_live_course_unique")) {
        throw new TRPCError({ code: "CONFLICT", message: alreadyEnrolled(student.fullName, course.title, "active") });
      }
      throw error;
    }
  }),

  // Takes an enrolment off the active register.
  removeEnrollment: adminProcedure
    .input(z.object({ enrollmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [existing] = await db
        .select({
          id: enrollments.id,
          status: enrollments.status,
          studentNumber: studentProfiles.studentNumber,
          studentName: studentProfiles.fullName,
          courseTitle: courses.title,
        })
        .from(enrollments)
        .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .where(eq(enrollments.id, input.enrollmentId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That enrolment is no longer on file." });
      }

      if (existing.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That enrolment is already off the active register.",
        });
      }

      return db.transaction(async tx => {
        await tx
          .update(enrollments)
          .set({ status: "withdrawn" })
          .where(eq(enrollments.id, existing.id));

        await recordAudit(tx, ctx.actor, {
          action: "withdraw_enrolment",
          entity: "enrollment",
          entityId: existing.id,
          entityLabel: `${existing.studentNumber} - ${existing.courseTitle}`,
          oldValue: { status: existing.status },
          newValue: { status: "withdrawn" },
        });

        return { studentName: existing.studentName, courseTitle: existing.courseTitle };
      });
    }),

  createAssessment: permissionProcedure("academics.write").input(z.object({ courseId: z.number().int().positive(), title: z.string().min(2).max(180), assessmentType: z.enum(["theory", "practical", "project", "exam"]), totalScore: z.number().int().min(1).max(1000), dueDate: z.coerce.date().optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [assessment] = await db.insert(assessments).values(input).returning({ id: assessments.id });

    await recordAudit(db, ctx.actor, {
      action: "create",
      entity: "assessment",
      entityId: assessment?.id,
      entityLabel: input.title,
      newValue: { courseId: input.courseId, assessmentType: input.assessmentType, totalScore: input.totalScore },
      summary: `${ctx.actor.name ?? "Staff"} added the ${input.assessmentType} "${input.title}"`,
    });

    return { id: assessment?.id };
  }),

  // Takes an assessment out of the catalogue.
  deleteAssessment: permissionProcedure("academics.write")
    .input(z.object({ assessmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select({
          id: assessments.id,
          title: assessments.title,
          assessmentType: assessments.assessmentType,
          totalScore: assessments.totalScore,
          courseId: assessments.courseId,
        })
        .from(assessments)
        .where(and(eq(assessments.id, input.assessmentId), isNull(assessments.deletedAt)))
        .limit(1);

      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That assessment is no longer on file." });
      }

      const [marks] = await db
        .select({ total: count() })
        .from(assessmentResults)
        .where(eq(assessmentResults.assessmentId, input.assessmentId));
      const markCount = Number(marks?.total ?? 0);

      await db
        .update(assessments)
        .set({ deletedAt: new Date() })
        .where(eq(assessments.id, input.assessmentId));

      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "assessment",
        entityId: before.id,
        entityLabel: before.title,
        oldValue: {
          title: before.title,
          assessmentType: before.assessmentType,
          totalScore: before.totalScore,
          courseId: before.courseId,
          marksHeld: markCount,
        },
        summary: `${ctx.actor.name ?? "Staff"} removed the ${before.assessmentType} "${before.title}"${markCount ? ` and the ${markCount} mark${markCount === 1 ? "" : "s"} on it` : ""}`,
      });

      return { id: before.id, title: before.title, marksKept: markCount };
    }),

  // Records an application taken in person.
  createApplication: permissionProcedure("admissions.write")
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320).optional().or(z.literal("")),
        phone: z.string().trim().min(7).max(40),
        whatsapp: z.string().trim().max(40).optional(),
        courseId: z.number().int().positive(),
        birthDate: z.coerce.date().optional(),
        hometown: z.string().trim().max(160).optional(),
        age: z.number().int().min(10).max(120).optional(),
        gender: z.string().trim().max(32).optional(),
        maritalStatus: z.string().trim().max(32).optional(),
        address: z.string().trim().max(1500).optional(),
        emergencyContact: z.string().trim().max(180).optional(),
        emergencyRelationship: z.string().trim().max(80).optional(),
        instagram: z.string().trim().max(120).optional(),
        tiktok: z.string().trim().max(120).optional(),
        otherSocialMedia: z.string().trim().max(160).optional(),
        educationalLevel: z.string().trim().max(120).optional(),
        education: z.string().trim().max(1800).optional(),
        paymentPlan: z.string().trim().max(80).optional(),
        duration: z.string().trim().max(80).optional(),
        startDate: z.coerce.date().optional(),
        guardianName: z.string().trim().max(160).optional(),
        guardianAddress: z.string().trim().max(1500).optional(),
        guardianPhone: z.string().trim().max(40).optional(),
        signatureData: z.string().trim().max(500).optional(),
        agreedToTerms: z.boolean().default(true),
        statement: z.string().trim().max(3000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const email = input.email && input.email.trim().length > 0 ? input.email.trim().toLowerCase() : null;

      const [course] = await db
        .select({
          id: courses.id,
          title: courses.title,
          durationWeeks: courses.durationWeeks,
          tuition: courses.tuition,
          productFee: courses.productFee,
        })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
        .limit(1);
      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That programme is unavailable." });
      }

      const recorded = await db.transaction(async tx => {
        // Same dedup as the public form.
        await resolvePerson(tx, {
          fullName: input.fullName,
          email,
          phone: input.phone,
          whatsapp: input.whatsapp ?? null,
          birthDate: input.birthDate ?? null,
          gender: input.gender ?? null,
          address: input.address ?? null,
        });

        const reference = buildReference("APP");

        const [created] = await tx
          .insert(applications)
          .values({
            reference,
            userId: email ? await findStudentAccountForEmail(tx, email) : null,
            fullName: input.fullName,
            email,
            phone: input.phone,
            whatsapp: input.whatsapp,
            birthDate: input.birthDate,
            hometown: input.hometown,
            age: input.age,
            gender: input.gender,
            maritalStatus: input.maritalStatus,
            address: input.address,
            emergencyContact: input.emergencyContact,
            emergencyRelationship: input.emergencyRelationship,
            instagram: input.instagram,
            tiktok: input.tiktok,
            otherSocialMedia: input.otherSocialMedia,
            educationalLevel: input.educationalLevel,
            education: input.education,
            courseId: input.courseId,
            paymentPlan: input.paymentPlan,
            // The quote this form is signed against, copied for the same reason as on a public.
            tuition: course.tuition,
            productFee: course.productFee,
            duration: input.duration || `${course.durationWeeks} weeks`,
            startDate: input.startDate,
            guardianName: input.guardianName,
            guardianAddress: input.guardianAddress,
            guardianPhone: input.guardianPhone,
            signatureData: input.signatureData,
            agreedToTerms: input.agreedToTerms,
            statement: input.statement,
            status: "submitted",
            submittedAt: new Date(),
          })
          .returning({ id: applications.id });

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "application",
          entityId: created?.id,
          entityLabel: reference,
          newValue: { fullName: input.fullName, email, courseId: input.courseId },
          summary: `${ctx.actor.name ?? "Staff"} recorded application ${reference} for ${input.fullName}`,
        });

        await announce(tx, {
          type: "application_submitted",
          recipient: { name: input.fullName, email, phone: input.phone },
          title: "Application received",
          body: `Application ${reference} for ${course.title}.`,
          facts: { course: course.title, reference },
          entityType: "application",
          entityId: created?.id,
        });

        return { id: created?.id, reference, courseTitle: course.title };
      });

      flushInBackground(db);
      return recorded;
    }),

  // Corrects an admission form already on file.
  updateApplication: permissionProcedure("admissions.write")
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320).optional().or(z.literal("")),
        phone: z.string().trim().min(7).max(40),
        whatsapp: z.string().trim().max(40).optional(),
        courseId: z.number().int().positive(),
        birthDate: z.coerce.date().optional(),
        hometown: z.string().trim().max(160).optional(),
        age: z.number().int().min(10).max(120).optional(),
        gender: z.string().trim().max(32).optional(),
        maritalStatus: z.string().trim().max(32).optional(),
        address: z.string().trim().max(1500).optional(),
        emergencyContact: z.string().trim().max(180).optional(),
        emergencyRelationship: z.string().trim().max(80).optional(),
        instagram: z.string().trim().max(120).optional(),
        tiktok: z.string().trim().max(120).optional(),
        otherSocialMedia: z.string().trim().max(160).optional(),
        educationalLevel: z.string().trim().max(120).optional(),
        education: z.string().trim().max(1800).optional(),
        paymentPlan: z.string().trim().max(80).optional(),
        duration: z.string().trim().max(80).optional(),
        startDate: z.coerce.date().optional(),
        guardianName: z.string().trim().max(160).optional(),
        guardianAddress: z.string().trim().max(1500).optional(),
        guardianPhone: z.string().trim().max(40).optional(),
        statement: z.string().trim().max(3000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const email = input.email && input.email.trim().length > 0 ? input.email.trim().toLowerCase() : null;

      const [existing] = await db
        .select()
        .from(applications)
        .where(and(eq(applications.id, input.applicationId), isNull(applications.deletedAt)))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
      }

      const [course] = await db
        .select({
          id: courses.id,
          title: courses.title,
          durationWeeks: courses.durationWeeks,
          tuition: courses.tuition,
          productFee: courses.productFee,
        })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
        .limit(1);
      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That programme is unavailable." });
      }

      // The quote is frozen against the programme it was given.
      const movedProgramme = existing.courseId !== input.courseId;

      await db
        .update(applications)
        .set({
          fullName: input.fullName,
          email,
          phone: input.phone,
          whatsapp: input.whatsapp ?? null,
          birthDate: input.birthDate ?? null,
          hometown: input.hometown ?? null,
          age: input.age ?? null,
          gender: input.gender ?? null,
          maritalStatus: input.maritalStatus ?? null,
          address: input.address ?? null,
          emergencyContact: input.emergencyContact ?? null,
          emergencyRelationship: input.emergencyRelationship ?? null,
          instagram: input.instagram ?? null,
          tiktok: input.tiktok ?? null,
          otherSocialMedia: input.otherSocialMedia ?? null,
          educationalLevel: input.educationalLevel ?? null,
          education: input.education ?? null,
          courseId: input.courseId,
          paymentPlan: input.paymentPlan ?? null,
          ...(movedProgramme ? { tuition: course.tuition, productFee: course.productFee } : {}),
          duration: input.duration || `${course.durationWeeks} weeks`,
          startDate: input.startDate ?? null,
          guardianName: input.guardianName ?? null,
          guardianAddress: input.guardianAddress ?? null,
          guardianPhone: input.guardianPhone ?? null,
          statement: input.statement ?? null,
        })
        .where(eq(applications.id, existing.id));

      await recordAudit(db, ctx.actor, {
        action: "update",
        entity: "application",
        entityId: existing.id,
        entityLabel: existing.reference,
        oldValue: {
          fullName: existing.fullName,
          email: existing.email,
          phone: existing.phone,
          courseId: existing.courseId,
        },
        newValue: {
          fullName: input.fullName,
          email,
          phone: input.phone,
          courseId: input.courseId,
        },
        summary: `${ctx.actor.name ?? "Staff"} corrected application ${existing.reference} (${input.fullName})`,
      });

      return { id: existing.id, reference: existing.reference, courseTitle: course.title };
    }),

  // Takes an admission form off the admissions list.
  deleteApplication: permissionProcedure("admissions.delete")
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [existing] = await db
        .select()
        .from(applications)
        .where(and(eq(applications.id, input.applicationId), isNull(applications.deletedAt)))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
      }

      const [student] = await db
        .select({ studentNumber: studentProfiles.studentNumber })
        .from(studentProfiles)
        .where(
          and(eq(studentProfiles.applicationId, existing.id), isNull(studentProfiles.deletedAt)),
        )
        .limit(1);

      if (student) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${existing.fullName} was admitted on this form and is on the register as ${student.studentNumber}. Remove the student record first if they are really leaving.`,
        });
      }

      await db
        .update(applications)
        .set({ deletedAt: new Date() })
        .where(eq(applications.id, existing.id));

      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "application",
        entityId: existing.id,
        entityLabel: existing.reference,
        oldValue: {
          fullName: existing.fullName,
          email: existing.email,
          status: existing.status,
          courseId: existing.courseId,
        },
        summary: `${ctx.actor.name ?? "Staff"} removed application ${existing.reference} (${existing.fullName})`,
      });

      return { id: existing.id, reference: existing.reference, fullName: existing.fullName };
    }),

  endorseApplication: permissionProcedure("admissions.review")
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        signature: z.string().trim().min(2).max(160),
        endorsed: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      // Scoped past removed forms like every other read of this table.
      const [app] = await db
        .select()
        .from(applications)
        .where(and(eq(applications.id, input.applicationId), isNull(applications.deletedAt)))
        .limit(1);
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });

      await db
        .update(applications)
        .set({
          ceoEndorsed: input.endorsed,
          ceoEndorsementSignature: input.signature,
          ceoEndorsementDate: new Date(),
        })
        .where(eq(applications.id, input.applicationId));

      await recordAudit(db, ctx.actor, {
        action: "endorse",
        entity: "application",
        entityId: app.id,
        entityLabel: app.reference,
        summary: `${ctx.actor.name ?? "CEO"} endorsed application ${app.reference} (${app.fullName})`,
      });

      return { success: true };
    }),

  reviewApplication: permissionProcedure("admissions.review").input(z.object({ applicationId: z.number().int().positive(), status: z.enum(["under_review", "more_information", "approved", "rejected"]), decisionNote: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    // Removed forms are not reviewable.
    const [application] = await db.select().from(applications).where(and(eq(applications.id, input.applicationId), isNull(applications.deletedAt))).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
    await db.update(applications).set({ status: input.status, decisionNote: input.decisionNote, reviewedByUserId: ctx.user.id }).where(eq(applications.id, application.id));

    // Carried out of the approval branch below so the message can quote the new student number.
    let studentNumber: string | null = null;

    if (input.status === "approved") {
      const [existing] = await db.select().from(studentProfiles).where(eq(studentProfiles.applicationId, application.id)).limit(1);
      if (!existing) {
        const accountId = application.userId ?? (application.email ? await findStudentAccountForEmail(db, application.email) : null);
        // Linked to a person like every other route that creates a student.
        const personId = await resolvePerson(db, {
          fullName: application.fullName,
          email: application.email,
          phone: application.phone,
          whatsapp: application.whatsapp,
          birthDate: application.birthDate,
          gender: application.gender,
          address: application.address,
        });
        studentNumber = buildReference("STU");
        const [student] = await db.insert(studentProfiles).values({ applicationId: application.id, personId, userId: accountId, studentNumber, fullName: application.fullName, email: application.email ?? null, phone: application.phone }).returning({ id: studentProfiles.id });
        if (student?.id) {
          await db.insert(enrollments).values({ studentId: student.id, courseId: application.courseId, status: "active" });
          // Was a hardcoded 0.
          await syncStudentCharges(db, student.id, ctx.user.id);
        }
        if (accountId) {
          await grantStudentRole(db, accountId);
          if (!application.userId) await db.update(applications).set({ userId: accountId }).where(eq(applications.id, application.id));
        }
      } else {
        studentNumber = existing.studentNumber;
      }
    }

    // "under_review" is an internal step and is deliberately not announced.
    const announcement = {
      approved: "application_approved",
      rejected: "application_rejected",
      more_information: "missing_document",
    } as const;
    const type = announcement[input.status as keyof typeof announcement];

    if (type) {
      const [course] = await db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, application.courseId))
        .limit(1);

      await announce(db, {
        type,
        recipient: {
          name: application.fullName,
          email: application.email,
          phone: application.phone,
          userId: application.userId,
        },
        title:
          input.status === "approved"
            ? "Your application was approved"
            : input.status === "rejected"
              ? "Your application was not successful"
              : "More information needed",
        body: input.decisionNote ?? undefined,
        facts: {
          course: course?.title,
          // The student number is the more useful reference once there is one.
          reference: studentNumber ?? application.reference,
          note: input.decisionNote,
        },
        entityType: "application",
        entityId: application.id,
        link: "/portal",
      });
      flushInBackground(db);
    }

    return { success: true };
  }),

  inventory: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select().from(inventoryItems).orderBy(inventoryItems.name);
  }),

  addInventory: adminProcedure.input(z.object({ sku: z.string().min(2).max(64), name: z.string().min(2).max(180), description: z.string().max(1500).optional(), category: z.string().min(2).max(80), quantityOnHand: z.number().int().min(0), reorderLevel: z.number().int().min(0), unitCost: z.number().min(0), sellingPrice: z.number().min(0), isSellable: z.boolean() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [item] = await db.insert(inventoryItems).values({ ...input, unitCost: input.unitCost.toFixed(2), sellingPrice: input.sellingPrice.toFixed(2) }).returning({ id: inventoryItems.id });
    if (item?.id && input.quantityOnHand) await db.insert(inventoryMovements).values({ inventoryItemId: item.id, movementType: "received", quantityDelta: input.quantityOnHand, referenceType: "opening_balance", performedByUserId: ctx.user.id });
    return { id: item?.id };
  }),

  orders: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select().from(storeOrders).orderBy(desc(storeOrders.createdAt));
  }),

  updateOrder: adminProcedure.input(z.object({ orderId: z.number().int().positive(), fulfillmentStatus: z.enum(["new", "confirmed", "processing", "ready", "shipped", "delivered", "cancelled"]), paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    await db.update(storeOrders).set(input).where(eq(storeOrders.id, input.orderId));
    return { success: true };
  }),

  expenses: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({ ...getTableColumns(expenses), categoryName: expenseCategories.name })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .orderBy(desc(expenses.expenseDate));
  }),

  // The pick list behind the expense form, seeded rows and staff-added alike.
  expenseCategories: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    // The seeded categories are this list.
    await ensurePlatformBootstrapped(db);
    return db
      .select({ id: expenseCategories.id, key: expenseCategories.key, name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.isActive, true))
      .orderBy(asc(expenseCategories.name));
  }),

  // Adds a category the seed list did not anticipate.
  addExpenseCategory: adminProcedure
    .input(z.object({ name: z.string().trim().min(2).max(120) }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const name = input.name.trim();
      const key = slugify(name).replaceAll("-", "_").slice(0, 48);

      // Two admins naming the same category at once must not turn into a unique.
      const [created] = await db
        .insert(expenseCategories)
        .values({ key, name })
        .onConflictDoNothing({ target: expenseCategories.key })
        .returning({ id: expenseCategories.id, key: expenseCategories.key, name: expenseCategories.name });
      if (created) {
        await recordAudit(db, ctx.actor, {
          action: "create",
          entity: "expenseCategory",
          entityId: created.id,
          entityLabel: created.name,
          summary: `${ctx.actor.name ?? "Staff"} added the "${created.name}" expense category`,
        });
        return created;
      }

      const [existing] = await db
        .select({ id: expenseCategories.id, key: expenseCategories.key, name: expenseCategories.name, isActive: expenseCategories.isActive })
        .from(expenseCategories)
        .where(eq(expenseCategories.key, key))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The category could not be saved." });
      }
      // Re-adding a retired name brings it back, rather than failing on a row the person cannot.
      if (!existing.isActive) {
        await db
          .update(expenseCategories)
          .set({ isActive: true })
          .where(eq(expenseCategories.id, existing.id));
      }
      return { id: existing.id, key: existing.key, name: existing.name };
    }),

  addExpense: adminProcedure
    .input(
      z.object({
        title: z.string().min(2).max(180),
        // A key from expenseCategories, which staff can add to.
        category: z.string().trim().min(1).max(48),
        amount: z.number().positive(),
        expenseDate: z.coerce.date(),
        vendor: z.string().max(160).optional(),
        paymentMethod: z.enum(["cash", "mobile_money", "bank", "card", "online"]),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [category] = await db
        .select({ id: expenseCategories.id, key: expenseCategories.key })
        .from(expenseCategories)
        .where(and(eq(expenseCategories.key, input.category), eq(expenseCategories.isActive, true)))
        .limit(1);
      if (!category) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That expense category no longer exists." });
      }

      const [expense] = await db
        .insert(expenses)
        .values({
          title: input.title,
          // Expenses.
          category: isLegacyExpenseCategory(category.key) ? category.key : "other",
          categoryId: category.id,
          amount: input.amount.toFixed(2),
          expenseDate: input.expenseDate,
          vendor: input.vendor,
          paymentMethod: input.paymentMethod,
          note: input.note,
          recordedByUserId: ctx.user.id,
        })
        .returning({ id: expenses.id });
      return { id: expense?.id };
    }),

  financeSummary: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const [[received], [spent], [outstanding], [storeRevenue]] = await Promise.all([
      db.select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(eq(payments.status, "completed")),
      db.select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses),
      db.select({ total: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)` }).from(feeCharges).where(sql`${feeCharges.status} in ('open', 'partially_paid')`),
      db.select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(and(eq(payments.status, "completed"), sql`${payments.storeOrderId} is not null`)),
    ]);
    const income = money(received?.total); const outgoings = money(spent?.total);
    return { income, outgoings, net: income - outgoings, outstandingFees: money(outstanding?.total), storeRevenue: money(storeRevenue?.total) };
  }),

  // Name-or-number lookup for the payment form.
  searchStudents: adminProcedure
    .input(z.object({ term: z.string().trim().min(1).max(80) }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const pattern = likePattern(input.term);
      return db
        .select({
          id: studentProfiles.id,
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
          status: studentProfiles.status,
        })
        .from(studentProfiles)
        .where(
          and(
            isNull(studentProfiles.deletedAt),
            or(
              ilike(studentProfiles.fullName, pattern),
              ilike(studentProfiles.studentNumber, pattern),
              ilike(studentProfiles.email, pattern),
              ilike(studentProfiles.phone, pattern),
            ),
          ),
        )
        .orderBy(asc(studentProfiles.fullName))
        .limit(10);
    }),

  // What a chosen student still owes, and the charges the money can go to.
  studentFees: adminProcedure
    .input(z.object({ studentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select({
          id: studentProfiles.id,
          studentNumber: studentProfiles.studentNumber,
          fullName: studentProfiles.fullName,
        })
        .from(studentProfiles)
        .where(and(eq(studentProfiles.id, input.studentId), isNull(studentProfiles.deletedAt)))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

      const [summary, charges] = await Promise.all([
        studentAccountSummary(db, input.studentId),
        db
          .select({
            id: feeCharges.id,
            description: feeCharges.description,
            feeType: feeCharges.feeType,
            amountDue: feeCharges.amountDue,
            amountPaid: feeCharges.amountPaid,
            dueDate: feeCharges.dueDate,
            status: feeCharges.status,
          })
          .from(feeCharges)
          .where(
            and(
              eq(feeCharges.studentId, input.studentId),
              inArray(feeCharges.status, ["open", "partially_paid"]),
            ),
          )
          .orderBy(asc(feeCharges.dueDate), asc(feeCharges.id)),
      ]);

      return {
        student,
        summary,
        charges: charges.map(charge => ({
          ...charge,
          amountDue: money(charge.amountDue),
          amountPaid: money(charge.amountPaid),
          balance: money(charge.amountDue) - money(charge.amountPaid),
        })),
      };
    }),

  recordStudentPayment: adminProcedure
    .input(
      z.object({
        studentId: z.number().int().positive(),
        feeChargeId: z.number().int().positive().optional(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["cash", "mobile_money", "bank", "card", "online"]),
        transactionReference: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const amountMinor = Math.round(input.amount * 100);

      return db.transaction(async tx => {
        const [payment] = await tx
          .insert(payments)
          .values({
            reference: buildReference("PAY"),
            studentId: input.studentId,
            feeChargeId: input.feeChargeId,
            amount: input.amount.toFixed(2),
            paymentMethod: input.paymentMethod,
            transactionReference: input.transactionReference,
            recordedByUserId: ctx.user.id,
            status: "completed",
          })
          .returning({ id: payments.id });
        if (!payment?.id) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment could not be recorded." });
        }

        // Shared with the finance module rather than reimplemented.
        await allocatePayment(tx, {
          paymentId: payment.id,
          studentId: input.studentId,
          amountMinor,
          preferredFeeChargeId: input.feeChargeId ?? null,
        });

        return { id: payment.id };
      });
    }),

  recordStorePayment: adminProcedure.input(z.object({ orderId: z.number().int().positive(), amount: z.number().positive(), paymentMethod: z.enum(["cash", "mobile_money", "bank", "card", "online"]), transactionReference: z.string().max(120).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [payment] = await db.insert(payments).values({ reference: buildReference("SALE"), storeOrderId: input.orderId, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, transactionReference: input.transactionReference, recordedByUserId: ctx.user.id, status: "completed" }).returning({ id: payments.id });
    await db.update(storeOrders).set({ paymentStatus: "paid" }).where(eq(storeOrders.id, input.orderId));
    return { id: payment?.id };
  }),

  createPaymentPlan: adminProcedure.input(z.object({ studentId: z.number().int().positive(), title: z.string().min(2).max(180), totalAmount: z.number().positive(), installmentAmount: z.number().positive(), nextDueDate: z.coerce.date().optional() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [plan] = await db.insert(paymentPlans).values({ studentId: input.studentId, title: input.title, totalAmount: input.totalAmount.toFixed(2), installmentAmount: input.installmentAmount.toFixed(2), nextDueDate: input.nextDueDate }).returning({ id: paymentPlans.id });
    return { id: plan?.id };
  }),

  uploadMedia: adminProcedure.input(z.object({ purpose: z.enum(["brochure", "gallery", "product", "receipt", "profile", "other"]), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), base64Data: z.string().min(8).max(MAX_UPLOAD_BASE64_LENGTH), altText: z.string().max(255).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    let buffer: Buffer;
    try { buffer = validateDocumentUpload(input.mimeType, input.base64Data); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid upload." }); }
    const stored = await storagePut(`media/${input.purpose}/${Date.now()}-${safeFileName(input.fileName)}`, buffer, input.mimeType);
    const [file] = await db.insert(mediaFiles).values({ ownerUserId: ctx.user.id, purpose: input.purpose, storageKey: stored.key, fileName: safeFileName(input.fileName), mimeType: input.mimeType, sizeBytes: buffer.length, altText: input.altText }).returning({ id: mediaFiles.id });
    return { id: file?.id, url: stored.url };
  }),

  // Academic programmes management.
  courses: permissionProcedure("academics.read")
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          status: z.enum(["all", "active", "inactive"]).optional(),
          category: z.string().max(64).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const conditions: SQL[] = [sql`${courses.deletedAt} is null`];
      if (input?.status === "active") conditions.push(eq(courses.isActive, true));
      if (input?.status === "inactive") conditions.push(eq(courses.isActive, false));
      if (input?.category && input.category !== "all") conditions.push(eq(courses.category, input.category));
      if (input?.search && input.search.trim()) {
        const pattern = `%${input.search.trim()}%`;
        conditions.push(
          or(
            ilike(courses.code, pattern),
            ilike(courses.title, pattern),
            ilike(courses.summary, pattern),
            ilike(courses.certification, pattern)
          )!
        );
      }

      const rows = await db
        .select({
          id: courses.id,
          code: courses.code,
          slug: courses.slug,
          title: courses.title,
          category: courses.category,
          summary: courses.summary,
          description: courses.description,
          durationWeeks: courses.durationWeeks,
          tuition: courses.tuition,
          productFee: courses.productFee,
          schedule: courses.schedule,
          certification: courses.certification,
          requirements: courses.requirements,
          toiletries: courses.toiletries,
          imageKey: courses.imageKey,
          isFeatured: courses.isFeatured,
          isActive: courses.isActive,
          createdAt: courses.createdAt,
          updatedAt: courses.updatedAt,
          activeEnrollments: count(enrollments.id),
        })
        .from(courses)
        .leftJoin(
          enrollments,
          and(eq(enrollments.courseId, courses.id), eq(enrollments.status, "active"))
        )
        .where(and(...conditions))
        .groupBy(courses.id)
        .orderBy(desc(courses.createdAt));

      const outlines = rows.length
        ? await db
            .select({ courseId: courseModules.courseId, title: courseModules.title })
            .from(courseModules)
            .where(
              inArray(
                courseModules.courseId,
                rows.map(row => row.id),
              ),
            )
            .orderBy(asc(courseModules.sequence), asc(courseModules.id))
        : [];

      const outlineByCourse = new Map<number, string[]>();
      for (const item of outlines) {
        const list = outlineByCourse.get(item.courseId);
        if (list) list.push(item.title);
        else outlineByCourse.set(item.courseId, [item.title]);
      }

      return rows.map(row => ({
        ...row,
        tuition: money(row.tuition),
        productFee: row.productFee ? money(row.productFee) : null,
        activeEnrollments: Number(row.activeEnrollments ?? 0),
        outline: outlineByCourse.get(row.id) ?? [],
      }));
    }),

  createCourse: permissionProcedure("academics.write")
    .input(
      z.object({
        code: z.string().trim().min(2).max(32),
        title: z.string().trim().min(2).max(160),
        category: z.string().trim().max(64).optional(),
        summary: z.string().trim().min(2).max(1000),
        description: z.string().trim().min(2).max(5000),
        durationWeeks: z.number().int().min(1).max(200),
        tuition: z.number().min(0).max(1_000_000),
        productFee: z.number().min(0).max(1_000_000).optional(),
        schedule: z.string().trim().max(160).optional(),
        certification: z.string().trim().max(160).optional(),
        requirements: z.string().trim().max(2000).optional(),
        toiletries: z.string().trim().max(2000).optional(),
        isFeatured: z.boolean().default(false),
        isActive: z.boolean().default(true),
        slug: z.string().trim().max(180).optional(),
        outline: outlineInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const code = input.code.toUpperCase();
      const [existing] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.code, code))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A programme with code "${code}" already exists.`,
        });
      }

      const slug = input.slug?.trim() || slugify(input.title);

      return db.transaction(async tx => {
        const [created] = await tx
          .insert(courses)
          .values({
            code,
            slug,
            title: input.title.trim(),
            category: input.category?.trim() || DEFAULT_COURSE_CATEGORY,
            summary: input.summary.trim(),
            description: input.description.trim(),
            durationWeeks: input.durationWeeks,
            tuition: input.tuition.toFixed(2),
            productFee: input.productFee ? input.productFee.toFixed(2) : null,
            schedule: input.schedule?.trim() || null,
            certification: input.certification?.trim() || null,
            requirements: input.requirements?.trim() || null,
            toiletries: input.toiletries?.trim() || null,
            isFeatured: input.isFeatured,
            isActive: input.isActive,
          })
          .returning();

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create programme.",
          });
        }

        if (input.outline) await saveOutline(tx, created.id, input.outline);

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "course",
          entityId: created.id,
          entityLabel: `${created.code} · ${created.title}`,
          newValue: { code, title: created.title, tuition: created.tuition },
          summary: `${ctx.actor.name ?? "Staff"} created programme "${created.title}" (${code})`,
        });

        return { ...created, tuition: money(created.tuition) };
      });
    }),

  updateCourse: permissionProcedure("academics.write")
    .input(
      z.object({
        id: z.number().int().positive(),
        code: z.string().trim().min(2).max(32),
        title: z.string().trim().min(2).max(160),
        category: z.string().trim().max(64).optional(),
        summary: z.string().trim().min(2).max(1000),
        description: z.string().trim().min(2).max(5000),
        durationWeeks: z.number().int().min(1).max(200),
        tuition: z.number().min(0).max(1_000_000),
        productFee: z.number().min(0).max(1_000_000).optional(),
        schedule: z.string().trim().max(160).optional(),
        certification: z.string().trim().max(160).optional(),
        requirements: z.string().trim().max(2000).optional(),
        toiletries: z.string().trim().max(2000).optional(),
        isFeatured: z.boolean().default(false),
        isActive: z.boolean().default(true),
        slug: z.string().trim().max(180).optional(),
        outline: outlineInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const code = input.code.toUpperCase();

      const [existing] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programme not found.",
        });
      }

      if (existing.code !== code) {
        const [conflict] = await db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.code, code))
          .limit(1);
        if (conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A programme with code "${code}" already exists.`,
          });
        }
      }

      const slug = input.slug?.trim() || slugify(input.title);

      return db.transaction(async tx => {
        const [updated] = await tx
          .update(courses)
          .set({
            code,
            slug,
            title: input.title.trim(),
            category: input.category?.trim() || existing.category,
            summary: input.summary.trim(),
            description: input.description.trim(),
            durationWeeks: input.durationWeeks,
            tuition: input.tuition.toFixed(2),
            productFee: input.productFee !== undefined ? (input.productFee ? input.productFee.toFixed(2) : null) : existing.productFee,
            schedule: input.schedule?.trim() || null,
            certification: input.certification?.trim() || null,
            requirements: input.requirements?.trim() || null,
            toiletries: input.toiletries?.trim() || null,
            isFeatured: input.isFeatured,
            isActive: input.isActive,
            updatedAt: new Date(),
          })
          .where(eq(courses.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not update programme.",
          });
        }

        if (input.outline) await saveOutline(tx, updated.id, input.outline);

        await recordAudit(tx, ctx.actor, {
          action: "update",
          entity: "course",
          entityId: updated.id,
          entityLabel: `${updated.code} · ${updated.title}`,
          oldValue: { code: existing.code, title: existing.title, tuition: existing.tuition },
          newValue: { code, title: updated.title, tuition: updated.tuition },
          summary: `${ctx.actor.name ?? "Staff"} updated programme "${updated.title}" (${code})`,
        });

        return { ...updated, tuition: money(updated.tuition) };
      });
    }),

  toggleCourseActive: permissionProcedure("academics.write")
    .input(
      z.object({
        id: z.number().int().positive(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [existing] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programme not found." });
      }

      return db.transaction(async tx => {
        await tx
          .update(courses)
          .set({ isActive: input.isActive, updatedAt: new Date() })
          .where(eq(courses.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: input.isActive ? "activate" : "deactivate",
          entity: "course",
          entityId: existing.id,
          entityLabel: `${existing.code} · ${existing.title}`,
          summary: `${ctx.actor.name ?? "Staff"} ${input.isActive ? "activated" : "deactivated"} programme "${existing.title}"`,
        });

        return { success: true };
      });
    }),

  // Takes a programme off the books.
  deleteCourse: permissionProcedure("academics.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [existing] = await db
        .select()
        .from(courses)
        .where(and(eq(courses.id, input.id), isNull(courses.deletedAt)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programme not found." });
      }

      // Paused counts as still on the programme.
      const [enrolled] = await db
        .select({ total: count() })
        .from(enrollments)
        .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
        .where(
          and(
            eq(enrollments.courseId, input.id),
            inArray(enrollments.status, ["active", "paused"]),
            isNull(studentProfiles.deletedAt),
          ),
        );

      const studying = Number(enrolled?.total ?? 0);
      if (studying > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${studying} student${studying === 1 ? " is" : "s are"} still enrolled on "${existing.title}". Close it to new admissions instead, or move them to another programme first.`,
        });
      }

      return db.transaction(async tx => {
        await tx
          .update(courses)
          // Closed as well as removed.
          .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
          .where(eq(courses.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: "delete",
          entity: "course",
          entityId: existing.id,
          entityLabel: `${existing.code} · ${existing.title}`,
          oldValue: {
            code: existing.code,
            title: existing.title,
            tuition: existing.tuition,
            category: existing.category,
          },
          summary: `${ctx.actor.name ?? "Staff"} removed programme "${existing.title}" (${existing.code})`,
        });

        return { id: existing.id, title: existing.title };
      });
    }),
});
