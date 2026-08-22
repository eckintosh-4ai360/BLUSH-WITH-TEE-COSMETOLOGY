import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments,
  assessmentResults,
  assessments,
  attendanceRecords,
  applications,
  clinicServices,
  courses,
  enrollments,
  inventoryItems,
  inventoryMovements,
  staffProfiles,
  studentProfiles,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { inventoryBalanceAfter, money } from "../platform.utils";
import { router, staffProcedure } from "../trpc";

export const staffRouter = router({
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
    const [result] = await db.insert(assessmentResults).values({ assessmentId: input.assessmentId, studentId: input.studentId, score: input.score.toFixed(2), grade: input.grade, instructorComment: input.instructorComment, gradedByUserId: ctx.user.id }).returning({ id: assessmentResults.id });
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
});
