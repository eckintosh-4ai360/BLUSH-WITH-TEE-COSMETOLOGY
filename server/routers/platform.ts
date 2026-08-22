import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applicationDocuments,
  applications,
  appointments,
  assessmentResults,
  assessments,
  attendanceRecords,
  cartItems,
  carts,
  clinicServices,
  courses,
  enrollments,
  expenses,
  feeCharges,
  inventoryItems,
  inventoryMovements,
  mediaFiles,
  orderItems,
  payments,
  paymentPlans,
  storeOrders,
  staffProfiles,
  studentProfiles,
  users,
} from "../../drizzle/schema";
import { getDb, initializeFoundationData } from "../db";
import { storageGet, storagePut } from "../storage";
import { adminProcedure, protectedProcedure, publicProcedure, router, staffProcedure, studentProcedure } from "../_core/trpc";
import { buildReference, calculateOrderTotal, checkoutStockDeductions, inventoryBalanceAfter, money, safeFileName, validateDocumentUpload } from "../platform.utils";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
  return db;
}

const applicationInput = z.object({
  fullName: z.string().min(2).max(160),
  email: z.string().email(),
  phone: z.string().min(7).max(40),
  whatsapp: z.string().max(40).optional(),
  birthDate: z.coerce.date().optional(),
  gender: z.string().max(32).optional(),
  address: z.string().max(1500).optional(),
  emergencyContact: z.string().max(180).optional(),
  education: z.string().max(1800).optional(),
  courseId: z.number().int().positive(),
  statement: z.string().max(3000).optional(),
});

export const platformRouter = router({
  content: router({
    courses: publicProcedure.query(async () => {
      const db = await dbOrThrow();
      await initializeFoundationData(db);
      return db.select().from(courses).where(eq(courses.isActive, true));
    }),
    clinicServices: publicProcedure.query(async () => {
      const db = await dbOrThrow();
      await initializeFoundationData(db);
      return db.select().from(clinicServices).where(eq(clinicServices.isActive, true));
    }),
  }),

  admissions: router({
    submit: publicProcedure.input(applicationInput).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [course] = await db.select().from(courses).where(and(eq(courses.id, input.courseId), eq(courses.isActive, true))).limit(1);
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "The selected program is unavailable." });

      const reference = buildReference("APP");
      const inserted = await db.insert(applications).values({
        reference,
        userId: ctx.user?.id,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        whatsapp: input.whatsapp,
        birthDate: input.birthDate,
        gender: input.gender,
        address: input.address,
        emergencyContact: input.emergencyContact,
        education: input.education,
        courseId: input.courseId,
        statement: input.statement,
        status: "submitted",
        submittedAt: new Date(),
      }).$returningId();

      return { applicationId: inserted[0]?.id, reference };
    }),
    uploadDocument: publicProcedure.input(z.object({
      reference: z.string().min(6).max(32),
      email: z.string().email(),
      documentType: z.enum(["transcript", "government_id", "passport_photo", "certificate", "other"]),
      fileName: z.string().min(1).max(255),
      mimeType: z.string().min(3).max(120),
      base64Data: z.string().min(8),
    })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [application] = await db.select().from(applications).where(and(
        eq(applications.reference, input.reference),
        eq(applications.email, input.email.toLowerCase()),
      )).limit(1);
      if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Application could not be verified." });

      let buffer: Buffer;
      try {
        buffer = validateDocumentUpload(input.mimeType, input.base64Data);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid document." });
      }

      const storageKey = `applications/${application.id}/${Date.now()}-${safeFileName(input.fileName)}`;
      const stored = await storagePut(storageKey, buffer, input.mimeType);
      const inserted = await db.insert(applicationDocuments).values({
        applicationId: application.id,
        documentType: input.documentType,
        storageKey: stored.key,
        fileName: safeFileName(input.fileName),
        mimeType: input.mimeType,
        sizeBytes: buffer.length,
        uploadedByUserId: ctx.user?.id,
      }).$returningId();
      return { documentId: inserted[0]?.id, url: stored.url };
    }),
    lookup: publicProcedure.input(z.object({ reference: z.string().min(6), email: z.string().email() })).query(async ({ input }) => {
      const db = await dbOrThrow();
      const rows = await db.select({
        reference: applications.reference,
        status: applications.status,
        createdAt: applications.createdAt,
        submittedAt: applications.submittedAt,
        decisionNote: applications.decisionNote,
        courseTitle: courses.title,
      }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).where(and(
        eq(applications.reference, input.reference),
        eq(applications.email, input.email.toLowerCase()),
      )).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No application matches that reference and email." });
      return rows[0];
    }),
  }),

  store: router({
    products: publicProcedure.query(async () => {
      const db = await dbOrThrow();
      await initializeFoundationData(db);
      const rows = await db.select().from(inventoryItems).where(and(eq(inventoryItems.isSellable, true), eq(inventoryItems.isActive, true)));
      return rows.map(item => ({ ...item, unitCost: money(item.unitCost), sellingPrice: money(item.sellingPrice) }));
    }),
    lookupOrder: publicProcedure.input(z.object({ orderNumber: z.string().min(6).max(40), email: z.string().email() })).query(async ({ input }) => {
      const db = await dbOrThrow();
      const [order] = await db.select().from(storeOrders).where(and(
        eq(storeOrders.orderNumber, input.orderNumber),
        eq(storeOrders.customerEmail, input.email.toLowerCase()),
      )).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "No order matches that reference and email." });
      const items = await db.select({ itemName: orderItems.itemName, quantity: orderItems.quantity, lineTotal: orderItems.lineTotal }).from(orderItems).where(eq(orderItems.orderId, order.id));
      return { ...order, total: money(order.total), items: items.map(item => ({ ...item, lineTotal: money(item.lineTotal) })) };
    }),
    cart: publicProcedure.input(z.object({ sessionToken: z.string().min(16).max(96) })).query(async ({ input }) => {
      const db = await dbOrThrow();
      const [cart] = await db.select().from(carts).where(and(eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
      if (!cart) return { cartId: null, items: [], subtotal: 0 };
      const rows = await db.select({
        cartItemId: cartItems.id,
        quantity: cartItems.quantity,
        productId: inventoryItems.id,
        name: inventoryItems.name,
        imageKey: inventoryItems.imageKey,
        sellingPrice: inventoryItems.sellingPrice,
        quantityOnHand: inventoryItems.quantityOnHand,
      }).from(cartItems).innerJoin(inventoryItems, eq(cartItems.inventoryItemId, inventoryItems.id)).where(eq(cartItems.cartId, cart.id));
      const items = rows.map(row => ({ ...row, sellingPrice: money(row.sellingPrice), lineTotal: money(row.sellingPrice) * row.quantity }));
      return { cartId: cart.id, items, subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0) };
    }),
    addItem: publicProcedure.input(z.object({ sessionToken: z.string().min(16).max(96), inventoryItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [product] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, input.inventoryItemId), eq(inventoryItems.isSellable, true), eq(inventoryItems.isActive, true))).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "This product is unavailable." });
      if (product.quantityOnHand < input.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient stock is available." });

      const [activeCart] = await db.select().from(carts).where(and(eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
      const cartId = activeCart?.id ?? (await db.insert(carts).values({ sessionToken: input.sessionToken, userId: ctx.user?.id }).$returningId())[0]?.id;
      if (!cartId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cart could not be created." });
      const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.inventoryItemId, input.inventoryItemId))).limit(1);
      if (existing) {
        if (existing.quantity + input.quantity > product.quantityOnHand) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested quantity exceeds stock." });
        await db.update(cartItems).set({ quantity: existing.quantity + input.quantity }).where(eq(cartItems.id, existing.id));
      } else {
        await db.insert(cartItems).values({ cartId, inventoryItemId: input.inventoryItemId, quantity: input.quantity });
      }
      return { cartId };
    }),
    updateItem: publicProcedure.input(z.object({ sessionToken: z.string().min(16).max(96), cartItemId: z.number().int().positive(), quantity: z.number().int().min(0).max(20) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const [row] = await db.select({ cartItemId: cartItems.id, cartId: carts.id, productId: inventoryItems.id, quantityOnHand: inventoryItems.quantityOnHand })
        .from(cartItems).innerJoin(carts, eq(cartItems.cartId, carts.id)).innerJoin(inventoryItems, eq(cartItems.inventoryItemId, inventoryItems.id))
        .where(and(eq(cartItems.id, input.cartItemId), eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cart item was not found." });
      if (input.quantity > row.quantityOnHand) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested quantity exceeds stock." });
      if (input.quantity === 0) await db.delete(cartItems).where(eq(cartItems.id, row.cartItemId));
      else await db.update(cartItems).set({ quantity: input.quantity }).where(eq(cartItems.id, row.cartItemId));
      return { success: true };
    }),
    checkout: publicProcedure.input(z.object({
      sessionToken: z.string().min(16).max(96),
      customerName: z.string().min(2).max(160),
      customerEmail: z.string().email(),
      customerPhone: z.string().min(7).max(40),
      deliveryAddress: z.string().max(1500).optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [cart] = await db.select().from(carts).where(and(eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
      if (!cart) throw new TRPCError({ code: "BAD_REQUEST", message: "Your cart has expired." });

      return db.transaction(async tx => {
        const items = await tx.select({
          inventoryItemId: inventoryItems.id,
          itemName: inventoryItems.name,
          sellingPrice: inventoryItems.sellingPrice,
          quantityOnHand: inventoryItems.quantityOnHand,
          quantity: cartItems.quantity,
        }).from(cartItems).innerJoin(inventoryItems, eq(cartItems.inventoryItemId, inventoryItems.id)).where(eq(cartItems.cartId, cart.id));
        if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Your cart is empty." });
        try { checkoutStockDeductions(items.map(item => ({ inventoryItemId: item.inventoryItemId, quantityOnHand: item.quantityOnHand, quantity: item.quantity }))); }
        catch { throw new TRPCError({ code: "BAD_REQUEST", message: "One or more cart items no longer has sufficient shared inventory." }); }

        const total = calculateOrderTotal(items);
        const orderNumber = buildReference("ORD");
        const [order] = await tx.insert(storeOrders).values({
          orderNumber,
          userId: ctx.user?.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail.toLowerCase(),
          customerPhone: input.customerPhone,
          deliveryAddress: input.deliveryAddress,
          subtotal: total.toFixed(2),
          total: total.toFixed(2),
          paymentStatus: "pending",
          fulfillmentStatus: "new",
        }).$returningId();
        if (!order?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Order could not be created." });

        await tx.insert(orderItems).values(items.map(item => ({
          orderId: order.id,
          inventoryItemId: item.inventoryItemId,
          itemName: item.itemName,
          unitPrice: money(item.sellingPrice).toFixed(2),
          quantity: item.quantity,
          lineTotal: (money(item.sellingPrice) * item.quantity).toFixed(2),
        })));
        for (const item of items) {
          await tx.update(inventoryItems).set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${item.quantity}` }).where(eq(inventoryItems.id, item.inventoryItemId));
          await tx.insert(inventoryMovements).values({
            inventoryItemId: item.inventoryItemId,
            movementType: "retail_sale",
            quantityDelta: -item.quantity,
            referenceType: "store_order",
            referenceId: order.id,
            performedByUserId: ctx.user?.id,
            note: `Reserved for ${orderNumber}`,
          });
        }
        await tx.update(carts).set({ status: "converted" }).where(eq(carts.id, cart.id));
        return { orderNumber, total, paymentStatus: "pending" as const };
      });
    }),
  }),

  appointments: router({
    book: publicProcedure.input(z.object({
      serviceId: z.number().int().positive(),
      customerName: z.string().min(2).max(160),
      customerEmail: z.string().email(),
      customerPhone: z.string().min(7).max(40),
      startsAt: z.coerce.date(),
      note: z.string().max(1200).optional(),
    })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const [service] = await db.select().from(clinicServices).where(and(eq(clinicServices.id, input.serviceId), eq(clinicServices.isActive, true))).limit(1);
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Clinic service is unavailable." });
      const reference = buildReference("CLN");
      await db.insert(appointments).values({ ...input, reference, status: "requested" });
      return { reference, status: "requested" as const };
    }),
  }),

  portal: router({
    mine: studentProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, ctx.user.id)).limit(1);
      if (!profile) return { role: ctx.user.role, profile: null, enrollment: [], balances: [], attendance: [], results: [], application: null, documents: [], orders: [] };
      const enrolled = await db.select({ enrollment: enrollments, courseTitle: courses.title }).from(enrollments).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.studentId, profile.id));
      const balances = await db.select().from(feeCharges).where(eq(feeCharges.studentId, profile.id));
      const attendance = await db.select({ attendance: attendanceRecords, courseTitle: courses.title }).from(attendanceRecords).innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id)).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.studentId, profile.id)).orderBy(desc(attendanceRecords.classDate)).limit(12);
      const results = await db.select({ result: assessmentResults, title: assessments.title, assessmentType: assessments.assessmentType, totalScore: assessments.totalScore }).from(assessmentResults).innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id)).where(eq(assessmentResults.studentId, profile.id)).orderBy(desc(assessmentResults.createdAt));
      const orders = await db.select().from(storeOrders).where(eq(storeOrders.userId, ctx.user.id)).orderBy(desc(storeOrders.createdAt));
      const [application] = profile.applicationId ? await db.select().from(applications).where(eq(applications.id, profile.applicationId)).limit(1) : [undefined];
      const documents = profile.applicationId ? await db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, profile.applicationId)) : [];
      const paymentHistory = await db.select().from(payments).where(eq(payments.studentId, profile.id)).orderBy(desc(payments.paidAt));
      return {
        role: ctx.user.role,
        profile,
        enrollment: enrolled,
        balances,
        attendance,
        results,
        application,
        documents: await Promise.all(documents.map(async document => ({ ...document, url: (await storageGet(document.storageKey)).url }))),
        payments: paymentHistory.map(payment => ({ ...payment, amount: money(payment.amount) })),
        orders: orders.map(order => ({ ...order, total: money(order.total) })),
      };
    }),
  }),

  staff: router({
    overview: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      const [lowStock] = await db.select({ count: sql<number>`count(*)` }).from(inventoryItems).where(sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`);
      const [pendingAppointments] = await db.select({ count: sql<number>`count(*)` }).from(appointments).where(eq(appointments.status, "requested"));
      return { lowStock: Number(lowStock?.count ?? 0), pendingAppointments: Number(pendingAppointments?.count ?? 0) };
    }),
    consumeInventory: staffProcedure.input(z.object({ inventoryItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(1000), note: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.inventoryItemId)).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item was not found." });
        try { inventoryBalanceAfter(item.quantityOnHand, -input.quantity); }
        catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient shared inventory is available." }); }
        await tx.update(inventoryItems).set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${input.quantity}` }).where(eq(inventoryItems.id, input.inventoryItemId));
        await tx.insert(inventoryMovements).values({ inventoryItemId: item.id, movementType: "classroom_use", quantityDelta: -input.quantity, referenceType: "classroom", note: input.note, performedByUserId: ctx.user.id });
        return { remaining: item.quantityOnHand - input.quantity };
      });
    }),
    recordAttendance: staffProcedure.input(z.object({ enrollmentId: z.number().int().positive(), classDate: z.coerce.date(), status: z.enum(["present", "late", "absent", "excused"]), note: z.string().max(255).optional() })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db.insert(attendanceRecords).values({ ...input, recordedByUserId: ctx.user.id });
      return { success: true };
    }),
    adjustInventory: staffProcedure.input(z.object({ inventoryItemId: z.number().int().positive(), movementType: z.enum(["received", "adjustment", "damaged", "return"]), quantityDelta: z.number().int().min(-1000).max(1000).refine(value => value !== 0), note: z.string().min(2).max(500) })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.inventoryItemId)).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item was not found." });
        let remaining: number;
        try { remaining = inventoryBalanceAfter(item.quantityOnHand, input.quantityDelta); }
        catch { throw new TRPCError({ code: "BAD_REQUEST", message: "This adjustment would take stock below zero." }); }
        await tx.update(inventoryItems).set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} + ${input.quantityDelta}` }).where(eq(inventoryItems.id, item.id));
        await tx.insert(inventoryMovements).values({ inventoryItemId: item.id, movementType: input.movementType, quantityDelta: input.quantityDelta, referenceType: "staff_adjustment", note: input.note, performedByUserId: ctx.user.id });
        return { remaining };
      });
    }),
    inventory: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      const items = await db.select().from(inventoryItems).orderBy(inventoryItems.name);
      return items.map(item => ({ ...item, sellingPrice: money(item.sellingPrice), unitCost: money(item.unitCost) }));
    }),
    enrollments: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      return db.select({ enrollment: enrollments, studentName: studentProfiles.fullName, courseTitle: courses.title }).from(enrollments).innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id)).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.status, "active"));
    }),
    assessments: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      return db.select().from(assessments).orderBy(desc(assessments.createdAt));
    }),
    team: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      return db.select({ id: staffProfiles.id, userId: staffProfiles.userId, position: staffProfiles.position, fullName: users.name }).from(staffProfiles).innerJoin(users, eq(staffProfiles.userId, users.id)).where(eq(staffProfiles.status, "active"));
    }),
    applications: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      return db.select({ application: applications, courseTitle: courses.title }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).where(eq(applications.status, "submitted")).orderBy(desc(applications.createdAt));
    }),
    reviewApplication: staffProcedure.input(z.object({ applicationId: z.number().int().positive(), status: z.enum(["under_review", "more_information"]) })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db.update(applications).set({ status: input.status, reviewedByUserId: ctx.user.id }).where(eq(applications.id, input.applicationId));
      return { success: true };
    }),
    recordResult: staffProcedure.input(z.object({ assessmentId: z.number().int().positive(), studentId: z.number().int().positive(), score: z.number().min(0), grade: z.string().max(8).optional(), instructorComment: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [result] = await db.insert(assessmentResults).values({ assessmentId: input.assessmentId, studentId: input.studentId, score: input.score.toFixed(2), grade: input.grade, instructorComment: input.instructorComment, gradedByUserId: ctx.user.id }).$returningId();
      return { id: result?.id };
    }),
    appointments: staffProcedure.query(async () => {
      const db = await dbOrThrow();
      return db.select({ appointment: appointments, serviceName: clinicServices.name }).from(appointments).innerJoin(clinicServices, eq(appointments.serviceId, clinicServices.id)).orderBy(desc(appointments.startsAt));
    }),
    updateAppointment: staffProcedure.input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["requested", "confirmed", "completed", "cancelled", "no_show"]), assignedStaffUserId: z.number().int().positive().optional() })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db.update(appointments).set({ ...input, assignedStaffUserId: input.assignedStaffUserId ?? ctx.user.id }).where(eq(appointments.id, input.appointmentId));
      return { success: true };
    }),
  }),

  admin: router({
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
      const [enrollment] = await db.insert(enrollments).values({ studentId: input.studentId, courseId: input.courseId, expectedCompletionDate: input.expectedCompletionDate }).$returningId();
      return { id: enrollment?.id };
    }),
    createAssessment: adminProcedure.input(z.object({ courseId: z.number().int().positive(), title: z.string().min(2).max(180), assessmentType: z.enum(["theory", "practical", "project", "exam"]), totalScore: z.number().int().min(1).max(1000), dueDate: z.coerce.date().optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const [assessment] = await db.insert(assessments).values(input).$returningId();
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
          const [student] = await db.insert(studentProfiles).values({ applicationId: application.id, userId: application.userId, studentNumber: buildReference("STU"), fullName: application.fullName, email: application.email, phone: application.phone }).$returningId();
          if (student?.id) {
            await db.insert(enrollments).values({ studentId: student.id, courseId: application.courseId, status: "active" });
            await db.insert(feeCharges).values({ studentId: student.id, feeType: "tuition", description: "Program tuition", amountDue: "0.00", status: "open" });
          }
          if (application.userId) await db.update(users).set({ role: "student" }).where(eq(users.id, application.userId));
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
      const [item] = await db.insert(inventoryItems).values({ ...input, unitCost: input.unitCost.toFixed(2), sellingPrice: input.sellingPrice.toFixed(2) }).$returningId();
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
      const [expense] = await db.insert(expenses).values({ ...input, amount: input.amount.toFixed(2), recordedByUserId: ctx.user.id }).$returningId();
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
      const [payment] = await db.insert(payments).values({ reference: buildReference("PAY"), studentId: input.studentId, feeChargeId: input.feeChargeId, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, transactionReference: input.transactionReference, recordedByUserId: ctx.user.id, status: "completed" }).$returningId();
      if (input.feeChargeId) {
        const [charge] = await db.select().from(feeCharges).where(eq(feeCharges.id, input.feeChargeId)).limit(1);
        if (charge && input.amount >= money(charge.amountDue)) await db.update(feeCharges).set({ status: "paid" }).where(eq(feeCharges.id, charge.id));
        else if (charge) await db.update(feeCharges).set({ status: "partially_paid" }).where(eq(feeCharges.id, charge.id));
      }
      return { id: payment?.id };
    }),
    recordStorePayment: adminProcedure.input(z.object({ orderId: z.number().int().positive(), amount: z.number().positive(), paymentMethod: z.enum(["cash", "mobile_money", "bank", "card", "online"]), transactionReference: z.string().max(120).optional() })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [payment] = await db.insert(payments).values({ reference: buildReference("SALE"), storeOrderId: input.orderId, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, transactionReference: input.transactionReference, recordedByUserId: ctx.user.id, status: "completed" }).$returningId();
      await db.update(storeOrders).set({ paymentStatus: "paid" }).where(eq(storeOrders.id, input.orderId));
      return { id: payment?.id };
    }),
    createPaymentPlan: adminProcedure.input(z.object({ studentId: z.number().int().positive(), title: z.string().min(2).max(180), totalAmount: z.number().positive(), installmentAmount: z.number().positive(), nextDueDate: z.coerce.date().optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const [plan] = await db.insert(paymentPlans).values({ studentId: input.studentId, title: input.title, totalAmount: input.totalAmount.toFixed(2), installmentAmount: input.installmentAmount.toFixed(2), nextDueDate: input.nextDueDate }).$returningId();
      return { id: plan?.id };
    }),
    uploadMedia: adminProcedure.input(z.object({ purpose: z.enum(["brochure", "gallery", "product", "receipt", "profile", "other"]), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), base64Data: z.string().min(8), altText: z.string().max(255).optional() })).mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      let buffer: Buffer;
      try { buffer = validateDocumentUpload(input.mimeType, input.base64Data); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid upload." }); }
      const stored = await storagePut(`media/${input.purpose}/${Date.now()}-${safeFileName(input.fileName)}`, buffer, input.mimeType);
      const [file] = await db.insert(mediaFiles).values({ ownerUserId: ctx.user.id, purpose: input.purpose, storageKey: stored.key, fileName: safeFileName(input.fileName), mimeType: input.mimeType, sizeBytes: buffer.length, altText: input.altText }).$returningId();
      return { id: file?.id, url: stored.url };
    }),
  }),
});
