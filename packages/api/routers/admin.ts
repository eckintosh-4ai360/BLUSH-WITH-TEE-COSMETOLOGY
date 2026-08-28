import { SQL, and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applicationDocuments,
  applications,
  assessments,
  courses,
  enrollments,
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
import { storageGet, storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
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
import { adminProcedure, permissionProcedure, router } from "../trpc";

export const adminNamespaceRouter = router({
  dashboard: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const [[studentCount], [applicationCount], [orderCount], [lowStockCount], recentOrders, recentApplications] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(studentProfiles),
      db.select({ count: sql<number>`count(*)` }).from(applications).where(eq(applications.status, "submitted")),
      db.select({ count: sql<number>`count(*)` }).from(storeOrders).where(eq(storeOrders.fulfillmentStatus, "new")),
      db.select({ count: sql<number>`count(*)` }).from(inventoryItems).where(sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`),
      db.select().from(storeOrders).orderBy(desc(storeOrders.createdAt)).limit(5),
      db.select({ reference: applications.reference, fullName: applications.fullName, status: applications.status, createdAt: applications.createdAt, courseTitle: courses.title }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).orderBy(desc(applications.createdAt)).limit(5),
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
      })
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { page = 1, pageSize = 20, search, status } = input;

      const conditions: SQL[] = [];
      if (status) conditions.push(eq(applications.status, status));
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

      const where = conditions.length ? and(...conditions) : undefined;
      const offset = (page - 1) * pageSize;

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({ application: applications, courseTitle: courses.title })
          .from(applications)
          .innerJoin(courses, eq(applications.courseId, courses.id))
          .where(where)
          .orderBy(desc(applications.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(applications).where(where),
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

  students: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.select({ student: studentProfiles, enrollment: enrollments, courseTitle: courses.title }).from(studentProfiles).leftJoin(enrollments, eq(studentProfiles.id, enrollments.studentId)).leftJoin(courses, eq(enrollments.courseId, courses.id)).orderBy(desc(studentProfiles.createdAt), desc(enrollments.enrolledAt));
    type Row = (typeof rows)[number];
    const byStudent = new Map<number, { student: Row["student"]; enrollments: { enrollment: NonNullable<Row["enrollment"]>; courseTitle: Row["courseTitle"] }[] }>();
    for (const row of rows) {
      const entry = byStudent.get(row.student.id) ?? { student: row.student, enrollments: [] };
      if (row.enrollment) entry.enrollments.push({ enrollment: row.enrollment, courseTitle: row.courseTitle });
      byStudent.set(row.student.id, entry);
    }
    return [...byStudent.values()];
  }),

  createEnrollment: adminProcedure.input(z.object({ studentId: z.number().int().positive(), courseId: z.number().int().positive(), expectedCompletionDate: z.coerce.date().optional() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [enrollment] = await db.insert(enrollments).values({ studentId: input.studentId, courseId: input.courseId, expectedCompletionDate: input.expectedCompletionDate }).returning({ id: enrollments.id });
    return { id: enrollment?.id };
  }),

  createAssessment: adminProcedure.input(z.object({ courseId: z.number().int().positive(), title: z.string().min(2).max(180), assessmentType: z.enum(["theory", "practical", "project", "exam"]), totalScore: z.number().int().min(1).max(1000), dueDate: z.coerce.date().optional() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [assessment] = await db.insert(assessments).values(input).returning({ id: assessments.id });
    return { id: assessment?.id };
  }),

  /**
   * Records an application taken in person.
   *
   * The public form is the usual way one arrives, but a school also takes
   * enquiries at the desk and over the phone, and those had nowhere to go: the
   * only submit procedure lives on the public router, which the dashboard does
   * not mount. This produces the same row, so a walk-in and a web applicant
   * move through review identically.
   *
   * Gated on `admissions.write` rather than owner-only, because taking down an
   * application is the admissions officer's job.
   */
  createApplication: permissionProcedure("admissions.write")
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
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
      const email = input.email.toLowerCase();

      const [course] = await db
        .select({ id: courses.id, title: courses.title, durationWeeks: courses.durationWeeks })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
        .limit(1);
      if (!course) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That programme is unavailable." });
      }

      return db.transaction(async tx => {
        // Same dedup as the public form, so an applicant already known to the
        // school does not become a second person record (§34).
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
            userId: await findStudentAccountForEmail(tx, email),
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

        return { id: created?.id, reference, courseTitle: course.title };
      });
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
      const [app] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, input.applicationId))
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

  reviewApplication: adminProcedure.input(z.object({ applicationId: z.number().int().positive(), status: z.enum(["under_review", "more_information", "approved", "rejected"]), decisionNote: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [application] = await db.select().from(applications).where(eq(applications.id, input.applicationId)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
    await db.update(applications).set({ status: input.status, decisionNote: input.decisionNote, reviewedByUserId: ctx.user.id }).where(eq(applications.id, application.id));
    if (input.status === "approved") {
      const [existing] = await db.select().from(studentProfiles).where(eq(studentProfiles.applicationId, application.id)).limit(1);
      if (!existing) {
        const accountId = application.userId ?? (await findStudentAccountForEmail(db, application.email));
        // Linked to a person like every other route that creates a student.
        // Without it an approved student who later shops becomes a second
        // identity, which is the exact duplication resolvePerson exists to
        // prevent (§34).
        const personId = await resolvePerson(db, {
          fullName: application.fullName,
          email: application.email,
          phone: application.phone,
          whatsapp: application.whatsapp,
          birthDate: application.birthDate,
          gender: application.gender,
          address: application.address,
        });
        const [student] = await db.insert(studentProfiles).values({ applicationId: application.id, personId, userId: accountId, studentNumber: buildReference("STU"), fullName: application.fullName, email: application.email, phone: application.phone }).returning({ id: studentProfiles.id });
        if (student?.id) {
          await db.insert(enrollments).values({ studentId: student.id, courseId: application.courseId, status: "active" });
          await db.insert(feeCharges).values({ studentId: student.id, feeType: "tuition", description: "Program tuition", amountDue: "0.00", status: "open" });
        }
        if (accountId) {
          await grantStudentRole(db, accountId);
          if (!application.userId) await db.update(applications).set({ userId: accountId }).where(eq(applications.id, application.id));
        }
      }
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
    return db.select().from(expenses).orderBy(desc(expenses.expenseDate));
  }),

  addExpense: adminProcedure.input(z.object({ title: z.string().min(2).max(180), category: z.enum(["rent", "utilities", "salaries", "transport", "equipment", "beauty_products", "maintenance", "marketing", "stationery", "cleaning", "other"]), amount: z.number().positive(), expenseDate: z.coerce.date(), vendor: z.string().max(160).optional(), paymentMethod: z.enum(["cash", "mobile_money", "bank", "card", "online"]), note: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [expense] = await db.insert(expenses).values({ ...input, amount: input.amount.toFixed(2), recordedByUserId: ctx.user.id }).returning({ id: expenses.id });
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

  recordStudentPayment: adminProcedure.input(z.object({ studentId: z.number().int().positive(), feeChargeId: z.number().int().positive().optional(), amount: z.number().positive(), paymentMethod: z.enum(["cash", "mobile_money", "bank", "card", "online"]), transactionReference: z.string().max(120).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [payment] = await db.insert(payments).values({ reference: buildReference("PAY"), studentId: input.studentId, feeChargeId: input.feeChargeId, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, transactionReference: input.transactionReference, recordedByUserId: ctx.user.id, status: "completed" }).returning({ id: payments.id });
    if (input.feeChargeId) {
      const [charge] = await db.select().from(feeCharges).where(eq(feeCharges.id, input.feeChargeId)).limit(1);
      if (charge && input.amount >= money(charge.amountDue)) await db.update(feeCharges).set({ status: "paid" }).where(eq(feeCharges.id, charge.id));
      else if (charge) await db.update(feeCharges).set({ status: "partially_paid" }).where(eq(feeCharges.id, charge.id));
    }
    return { id: payment?.id };
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

  /** Academic programmes management. */
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

      return rows.map(row => ({
        ...row,
        tuition: money(row.tuition),
        productFee: row.productFee ? money(row.productFee) : null,
        activeEnrollments: Number(row.activeEnrollments ?? 0),
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
            category: input.category?.trim() || "Full Cosmetology",
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
});
