import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
import { buildReference, inventoryBalanceAfter, money } from "../platform.utils";
import { recordOneResult } from "./results";
import { router, staffAccessProcedure, staffProcedure } from "../trpc";

const staffAppointmentInput = z
  .object({
    serviceId: z.number().int().positive(),
    customerName: z.string().min(2).max(160),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(7).max(40),
    startsAt: z.coerce.date(),
    location: z.enum(["salon", "home"]).default("salon"),
    locationDetails: z.string().max(500).optional(),
    note: z.string().max(1200).optional(),
    status: z
      .enum(["requested", "confirmed", "completed", "cancelled", "no_show"])
      .default("confirmed"),
  })
  .superRefine((input, ctx) => {
    if (input.location === "home" && !input.locationDetails?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["locationDetails"],
        message: "A home-service address is required.",
      });
    }
  });

export const staffRouter = router({
  overview: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    const [lowStock] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(
        sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`
      );
    const [pendingAppointments] = await db
      .select({ count: sql<number>`count(*)` })
      .from(appointments)
      .where(eq(appointments.status, "requested"));
    return {
      lowStock: Number(lowStock?.count ?? 0),
      pendingAppointments: Number(pendingAppointments?.count ?? 0),
    };
  }),
  consumeInventory: staffProcedure
    .input(
      z.object({
        inventoryItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(1000),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const [item] = await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, input.inventoryItemId))
          .limit(1);
        if (!item)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory item was not found.",
          });
        try {
          inventoryBalanceAfter(item.quantityOnHand, -input.quantity);
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient shared inventory is available.",
          });
        }
        await tx
          .update(inventoryItems)
          .set({
            quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${input.quantity}`,
          })
          .where(eq(inventoryItems.id, input.inventoryItemId));
        await tx
          .insert(inventoryMovements)
          .values({
            inventoryItemId: item.id,
            movementType: "classroom_use",
            quantityDelta: -input.quantity,
            referenceType: "classroom",
            note: input.note,
            performedByUserId: ctx.user.id,
          });
        return { remaining: item.quantityOnHand - input.quantity };
      });
    }),
  recordAttendance: staffProcedure
    .input(
      z.object({
        enrollmentId: z.number().int().positive(),
        classDate: z.coerce.date(),
        status: z.enum(["present", "late", "absent", "excused"]),
        note: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      // Upserts: (enrollmentId, classDate) is unique, so correcting a mark or marking a latecomer.
      await db
        .insert(attendanceRecords)
        .values({ ...input, recordedByUserId: ctx.user.id })
        .onConflictDoUpdate({
          target: [attendanceRecords.enrollmentId, attendanceRecords.classDate],
          set: {
            status: sql`excluded.status`,
            note: sql`excluded.note`,
            recordedByUserId: sql`excluded."recordedByUserId"`,
          },
        });
      return { success: true };
    }),
  adjustInventory: staffProcedure
    .input(
      z.object({
        inventoryItemId: z.number().int().positive(),
        movementType: z.enum(["received", "adjustment", "damaged", "return"]),
        quantityDelta: z
          .number()
          .int()
          .min(-1000)
          .max(1000)
          .refine(value => value !== 0),
        note: z.string().min(2).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const [item] = await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, input.inventoryItemId))
          .limit(1);
        if (!item)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory item was not found.",
          });
        let remaining: number;
        try {
          remaining = inventoryBalanceAfter(
            item.quantityOnHand,
            input.quantityDelta
          );
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This adjustment would take stock below zero.",
          });
        }
        await tx
          .update(inventoryItems)
          .set({
            quantityOnHand: sql`${inventoryItems.quantityOnHand} + ${input.quantityDelta}`,
          })
          .where(eq(inventoryItems.id, item.id));
        await tx
          .insert(inventoryMovements)
          .values({
            inventoryItemId: item.id,
            movementType: input.movementType,
            quantityDelta: input.quantityDelta,
            referenceType: "staff_adjustment",
            note: input.note,
            performedByUserId: ctx.user.id,
          });
        return { remaining };
      });
    }),
  inventory: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    const items = await db
      .select()
      .from(inventoryItems)
      .orderBy(inventoryItems.name);
    return items.map(item => ({
      ...item,
      sellingPrice: money(item.sellingPrice),
      unitCost: money(item.unitCost),
    }));
  }),
  enrollments: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    // A student removed from the register takes their enrolments with them.
    return db
      .select({
        enrollment: enrollments,
        studentName: studentProfiles.fullName,
        courseTitle: courses.title,
      })
      .from(enrollments)
      .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(
        and(eq(enrollments.status, "active"), isNull(studentProfiles.deletedAt))
      );
  }),
  assessments: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select()
      .from(assessments)
      .where(isNull(assessments.deletedAt))
      .orderBy(desc(assessments.createdAt));
  }),
  team: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({
        id: staffProfiles.id,
        userId: staffProfiles.userId,
        position: staffProfiles.position,
        fullName: users.name,
      })
      .from(staffProfiles)
      .innerJoin(users, eq(staffProfiles.userId, users.id))
      .where(eq(staffProfiles.status, "active"));
  }),
  applications: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({ application: applications, courseTitle: courses.title })
      .from(applications)
      .innerJoin(courses, eq(applications.courseId, courses.id))
      .where(
        and(
          eq(applications.status, "submitted"),
          isNull(applications.deletedAt)
        )
      )
      .orderBy(desc(applications.createdAt));
  }),
  reviewApplication: staffProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        status: z.enum(["under_review", "more_information"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db
        .update(applications)
        .set({ status: input.status, reviewedByUserId: ctx.user.id })
        .where(eq(applications.id, input.applicationId));
      return { success: true };
    }),
  // One mark, for the single-student form on this screen.
  recordResult: staffProcedure
    .input(
      z.object({
        assessmentId: z.number().int().positive(),
        studentId: z.number().int().positive(),
        score: z.number().min(0),
        instructorComment: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      return recordOneResult(db, { ...input, gradedByUserId: ctx.user.id });
    }),
  appointments: staffProcedure.query(async () => {
    const db = await dbOrThrow();
    return db
      .select({
        appointment: appointments,
        serviceName: clinicServices.name,
        durationMinutes: clinicServices.durationMinutes,
      })
      .from(appointments)
      .innerJoin(clinicServices, eq(appointments.serviceId, clinicServices.id))
      .orderBy(desc(appointments.startsAt));
  }),
  createAppointment: staffAccessProcedure
    .input(staffAppointmentInput)
    .mutation(async ({ input, ctx }) => {
      ctx.access.assert("appointments.write");

      const [service] = await ctx.db
        .select()
        .from(clinicServices)
        .where(
          and(
            eq(clinicServices.id, input.serviceId),
            eq(clinicServices.isActive, true),
          ),
        )
        .limit(1);
      if (!service) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That service is no longer available.",
        });
      }

      const reference = buildReference("CLN");
      const [created] = await ctx.db
        .insert(appointments)
        .values({
          reference,
          serviceId: input.serviceId,
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail.trim(),
          customerPhone: input.customerPhone.trim(),
          startsAt: input.startsAt,
          location: input.location,
          locationDetails: input.locationDetails?.trim() || null,
          note: input.note?.trim() || null,
          status: input.status,
        })
        .returning({ id: appointments.id });

      return { id: created?.id, reference, status: input.status };
    }),
  updateAppointment: staffProcedure
    .input(
      z.object({
        appointmentId: z.number().int().positive(),
        status: z.enum([
          "requested",
          "confirmed",
          "completed",
          "cancelled",
          "no_show",
        ]),
        assignedStaffUserId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db
        .update(appointments)
        .set({
          ...input,
          assignedStaffUserId: input.assignedStaffUserId ?? ctx.user.id,
        })
        .where(eq(appointments.id, input.appointmentId));
      return { success: true };
    }),
});
