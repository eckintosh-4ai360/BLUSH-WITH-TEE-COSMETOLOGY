import { and, desc, eq, sql } from "drizzle-orm";
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
import { initializeFoundationData } from "@blush/db";
import { storageGet, storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { findStudentAccountForEmail, grantStudentRole } from "../services/people";
import { buildReference, money, safeFileName, validateDocumentUpload } from "../platform.utils";
import { adminProcedure, router } from "../trpc";

export const adminNamespaceRouter = router({
  dashboard: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    await initializeFoundationData(db);
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
  applications: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select({ application: applications, courseTitle: courses.title }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).orderBy(desc(applications.createdAt));
  }),
  applicationDocuments: adminProcedure.input(z.object({ applicationId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const documents = await db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, input.applicationId));
    return Promise.all(documents.map(async document => ({ ...document, url: (await storageGet(document.storageKey)).url })));
  }),
  students: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select({ student: studentProfiles, enrollment: enrollments, courseTitle: courses.title }).from(studentProfiles).leftJoin(enrollments, eq(studentProfiles.id, enrollments.studentId)).leftJoin(courses, eq(enrollments.courseId, courses.id)).orderBy(desc(studentProfiles.createdAt));
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
  reviewApplication: adminProcedure.input(z.object({ applicationId: z.number().int().positive(), status: z.enum(["under_review", "more_information", "approved", "rejected"]), decisionNote: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [application] = await db.select().from(applications).where(eq(applications.id, input.applicationId)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
    await db.update(applications).set({ status: input.status, decisionNote: input.decisionNote, reviewedByUserId: ctx.user.id }).where(eq(applications.id, application.id));
    if (input.status === "approved") {
      const [existing] = await db.select().from(studentProfiles).where(eq(studentProfiles.applicationId, application.id)).limit(1);
      if (!existing) {
        // Applying does not require signing in, so an application often carries
        // no account. Falling back to the email the applicant gave keeps the
        // new record reachable - a profile with no userId can never be opened
        // in the portal, and nothing in the dashboard can repair it.
        const accountId = application.userId ?? (await findStudentAccountForEmail(db, application.email));
        const [student] = await db.insert(studentProfiles).values({ applicationId: application.id, userId: accountId, studentNumber: buildReference("STU"), fullName: application.fullName, email: application.email, phone: application.phone }).returning({ id: studentProfiles.id });
        if (student?.id) {
          await db.insert(enrollments).values({ studentId: student.id, courseId: application.courseId, status: "active" });
          await db.insert(feeCharges).values({ studentId: student.id, feeType: "tuition", description: "Program tuition", amountDue: "0.00", status: "open" });
        }
        if (accountId) {
          await grantStudentRole(db, accountId);
          // Record the account on the application too, so the admissions trail
          // and the student record agree on who this is.
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
  uploadMedia: adminProcedure.input(z.object({ purpose: z.enum(["brochure", "gallery", "product", "receipt", "profile", "other"]), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), base64Data: z.string().min(8), altText: z.string().max(255).optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    let buffer: Buffer;
    try { buffer = validateDocumentUpload(input.mimeType, input.base64Data); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid upload." }); }
    const stored = await storagePut(`media/${input.purpose}/${Date.now()}-${safeFileName(input.fileName)}`, buffer, input.mimeType);
    const [file] = await db.insert(mediaFiles).values({ ownerUserId: ctx.user.id, purpose: input.purpose, storageKey: stored.key, fileName: safeFileName(input.fileName), mimeType: input.mimeType, sizeBytes: buffer.length, altText: input.altText }).returning({ id: mediaFiles.id });
    return { id: file?.id, url: stored.url };
  }),
});
