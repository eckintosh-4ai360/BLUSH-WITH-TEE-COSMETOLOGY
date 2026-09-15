import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
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
  people,
  staffProfiles,
  studentProfiles,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import {
  buildReference,
  inventoryBalanceAfter,
  money,
} from "../platform.utils";
import {
  APPOINTMENT_STATUSES,
  clientMessageFor,
  messageClient,
  type AppointmentStatus,
} from "../services/appointments";
import { recordAudit } from "../services/audit";
import { bestEffort } from "../services/notify";
import { recordOneResult } from "./results";
import {
  permissionProcedure,
  router,
  staffAccessProcedure,
  staffProcedure,
} from "../trpc";
import {
  likePattern,
  listInputSchema,
  paginate,
  paginationBounds,
} from "../services/pagination";

const staffAppointmentInput = z
  .object({
    serviceId: z.number().int().positive().optional(),
    customServiceName: z.string().trim().min(2).max(160).optional(),
    customerName: z.string().min(2).max(160),
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
    if (Boolean(input.serviceId) === Boolean(input.customServiceName)) {
      ctx.addIssue({
        code: "custom",
        path: ["serviceId"],
        message: "Choose a service or enter an other service name.",
      });
    }
    if (input.location === "home" && !input.locationDetails?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["locationDetails"],
        message: "A home-service address is required.",
      });
    }
  });

export const staffRouter = router({
  records: permissionProcedure("staff.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);
      const where = and(
        isNull(staffProfiles.deletedAt),
        input.search
          ? or(
              ilike(users.name, likePattern(input.search)),
              ilike(users.email, likePattern(input.search)),
              ilike(staffProfiles.position, likePattern(input.search)),
              sql`${staffProfiles.department}::text ilike ${likePattern(input.search)}`,
              ilike(staffProfiles.staffNumber, likePattern(input.search))
            )
          : undefined
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({
            worker: staffProfiles,
            name: users.name,
            accountEmail: users.email,
            notes: people.notes,
          })
          .from(staffProfiles)
          .innerJoin(users, eq(staffProfiles.userId, users.id))
          .leftJoin(people, eq(staffProfiles.personId, people.id))
          .where(where)
          .orderBy(asc(users.name), asc(staffProfiles.id))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(staffProfiles)
          .innerJoin(users, eq(staffProfiles.userId, users.id))
          .where(where),
      ]);

      return paginate(
        rows.map(row => ({
          ...row.worker,
          name: row.name ?? "Unnamed worker",
          accountEmail: row.accountEmail,
          notes: row.notes,
          salary: row.worker.salary == null ? null : money(row.worker.salary),
        })),
        Number(total?.total ?? 0),
        input
      );
    }),

  saveRecord: permissionProcedure("staff.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320).optional(),
        phone: z.string().trim().max(40).optional(),
        position: z.string().trim().min(2).max(120),
        department: z.enum(["school", "salon", "shop"]),
        staffNumber: z.string().trim().max(40).optional(),
        employmentDate: z.coerce.date().optional(),
        salary: z.number().min(0).optional(),
        status: z.enum(["active", "inactive", "on_leave"]).default("active"),
        notes: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const email = input.email?.trim().toLowerCase() || null;
      const phone = input.phone?.trim() || null;
      const staffNumber = input.staffNumber?.trim() || null;
      const profileValues = {
        position: input.position.trim(),
        phone,
        email,
        staffNumber,
        department: input.department,
        employmentDate: input.employmentDate ?? null,
        salary: input.salary == null ? null : input.salary.toFixed(2),
        status: input.status,
        updatedAt: new Date(),
      };

      return db.transaction(async tx => {
        if (input.id) {
          const [before] = await tx
            .select()
            .from(staffProfiles)
            .where(
              and(
                eq(staffProfiles.id, input.id),
                isNull(staffProfiles.deletedAt)
              )
            )
            .limit(1);

          if (!before) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That worker record was not found.",
            });
          }

          await tx
            .update(users)
            .set({
              name: input.name.trim(),
              email,
              isActive: input.status === "active",
              updatedAt: new Date(),
            })
            .where(eq(users.id, before.userId));
          await tx
            .update(staffProfiles)
            .set(profileValues)
            .where(eq(staffProfiles.id, input.id));

          if (before.personId) {
            await tx
              .update(people)
              .set({
                fullName: input.name.trim(),
                email,
                phone,
                notes: input.notes?.trim() || null,
                updatedAt: new Date(),
              })
              .where(eq(people.id, before.personId));
          }

          await recordAudit(tx, ctx.actor, {
            action: "update",
            entity: "staffProfile",
            entityId: input.id,
            entityLabel: input.name.trim(),
            newValue: {
              ...profileValues,
              name: input.name.trim(),
              notes: input.notes ?? null,
            },
            summary: `${ctx.actor.name ?? "Staff"} updated the worker record for ${input.name.trim()}`,
          });
          return { id: input.id };
        }

        const [person] = await tx
          .insert(people)
          .values({
            fullName: input.name.trim(),
            email,
            phone,
            notes: input.notes?.trim() || null,
          })
          .returning({ id: people.id });
        if (!person?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Worker person was not created.",
          });
        }

        const [user] = await tx
          .insert(users)
          .values({
            openId: `worker-${randomUUID()}`,
            personId: person.id,
            name: input.name.trim(),
            email,
            loginMethod: "worker_record",
            role: "staff",
            isActive: input.status === "active",
          })
          .returning({ id: users.id });
        if (!user?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Worker account was not created.",
          });
        }

        const [created] = await tx
          .insert(staffProfiles)
          .values({ ...profileValues, userId: user.id, personId: person.id })
          .returning({ id: staffProfiles.id });
        if (!created?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Worker record was not created.",
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "staffProfile",
          entityId: created.id,
          entityLabel: input.name.trim(),
          newValue: {
            ...profileValues,
            name: input.name.trim(),
            notes: input.notes ?? null,
          },
          summary: `${ctx.actor.name ?? "Staff"} added ${input.name.trim()} as a ${input.department} worker`,
        });
        return { id: created.id };
      });
    }),

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
        await tx.insert(inventoryMovements).values({
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
        await tx.insert(inventoryMovements).values({
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
  appointments: permissionProcedure("appointments.read").query(async () => {
    const db = await dbOrThrow();
    const assignee = alias(users, "assignee");
    return db
      .select({
        appointment: appointments,
        serviceName: clinicServices.name,
        durationMinutes: clinicServices.durationMinutes,
        assignedStaffName: assignee.name,
      })
      .from(appointments)
      .innerJoin(clinicServices, eq(appointments.serviceId, clinicServices.id))
      .leftJoin(assignee, eq(appointments.assignedStaffUserId, assignee.id))
      .orderBy(desc(appointments.startsAt));
  }),
  createAppointment: staffAccessProcedure
    .input(staffAppointmentInput)
    .mutation(async ({ input, ctx }) => {
      ctx.access.assert("appointments.write");

      return ctx.db.transaction(async tx => {
        let serviceId: number;
        if (input.customServiceName) {
          const customServiceName = input.customServiceName.trim();
          const [existing] = await tx
            .select({ id: clinicServices.id })
            .from(clinicServices)
            .where(
              and(
                eq(clinicServices.name, customServiceName),
                eq(clinicServices.isActive, true)
              )
            )
            .limit(1);

          if (existing) {
            serviceId = existing.id;
          } else {
            const [createdService] = await tx
              .insert(clinicServices)
              .values({
                name: customServiceName,
                description: "Added from an appointment.",
                durationMinutes: 60,
                price: "0.00",
                isActive: true,
                isBookable: false,
              })
              .returning({ id: clinicServices.id });
            serviceId = createdService.id;
          }
        } else {
          const [service] = await tx
            .select({ id: clinicServices.id })
            .from(clinicServices)
            .where(
              and(
                eq(clinicServices.id, input.serviceId!),
                eq(clinicServices.isActive, true),
                eq(clinicServices.isBookable, true)
              )
            )
            .limit(1);
          if (!service) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That service is no longer available.",
            });
          }
          serviceId = service.id;
        }

        const reference = buildReference("CLN");
        const [created] = await tx
          .insert(appointments)
          .values({
            reference,
            serviceId,
            customerName: input.customerName.trim(),
            customerPhone: input.customerPhone.trim(),
            startsAt: input.startsAt,
            location: input.location,
            locationDetails: input.locationDetails?.trim() || null,
            note: input.note?.trim() || null,
            status: input.status,
          })
          .returning({ id: appointments.id });

        return { id: created?.id, reference, status: input.status };
      });
    }),
  // Moves a booking on, or hands it to someone. Only what is sent changes: setting a status
  // no longer quietly assigns the booking to whoever clicked.
  updateAppointment: permissionProcedure("appointments.write")
    .input(
      z
        .object({
          appointmentId: z.number().int().positive(),
          status: z.enum(APPOINTMENT_STATUSES).optional(),
          // Null takes the booking off whoever had it.
          assignedStaffUserId: z.number().int().positive().nullable().optional(),
        })
        .refine(
          input => input.status !== undefined || input.assignedStaffUserId !== undefined,
          { message: "Nothing to change." }
        )
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [existing] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found." });
      }

      if (input.assignedStaffUserId) {
        const [member] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, input.assignedStaffUserId),
              eq(users.isActive, true),
              or(eq(users.role, "staff"), eq(users.role, "admin"))
            )
          )
          .limit(1);
        if (!member) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Bookings can only be assigned to an active staff account.",
          });
        }
      }

      const from = existing.status as AppointmentStatus;
      const to = input.status ?? from;

      await db
        .update(appointments)
        .set({
          status: to,
          ...(input.assignedStaffUserId !== undefined
            ? { assignedStaffUserId: input.assignedStaffUserId }
            : {}),
        })
        .where(eq(appointments.id, existing.id));

      await recordAudit(db, ctx.actor, {
        action: "update_appointment",
        entity: "appointment",
        entityId: existing.id,
        entityLabel: existing.reference,
        oldValue: {
          status: from,
          assignedStaffUserId: existing.assignedStaffUserId,
        },
        newValue: {
          status: to,
          assignedStaffUserId:
            input.assignedStaffUserId !== undefined
              ? input.assignedStaffUserId
              : existing.assignedStaffUserId,
        },
        summary:
          from !== to
            ? `${ctx.actor.name ?? "Staff"} moved booking ${existing.reference} (${existing.customerName}) from ${from} to ${to}`
            : `${ctx.actor.name ?? "Staff"} changed who handles booking ${existing.reference} (${existing.customerName})`,
      });

      const message = clientMessageFor(from, to);
      if (message) {
        await bestEffort("booking status message", () =>
          messageClient(db, existing.id, message)
        );
      }

      return { success: true, status: to, clientMessaged: Boolean(message) };
    }),
});
