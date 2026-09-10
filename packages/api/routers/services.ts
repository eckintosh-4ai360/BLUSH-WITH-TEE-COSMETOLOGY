import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  clinicServices,
  serviceSales,
  staffProfiles,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { money, toAmountString, toMinor } from "../services/money";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { recordRevenue, reverseRevenue } from "../services/revenue";
import { permissionProcedure, router } from "../trpc";

// The daily services log.

const PAYMENT_METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;

// A calendar day, taken as YYYY-MM-DD text.
const serviceDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date written as YYYY-MM-DD.")
  .transform((value, ctx) => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      ctx.addIssue({ code: "custom", message: "That is not a real date." });
      return z.NEVER;
    }
    return date;
  });

const saveInput = z.object({
  id: z.number().int().positive().optional(),
  serviceDate: serviceDateInput,
  // Links the catalogue row when one was picked; the name is kept regardless.
  serviceId: z.number().int().positive().nullable().optional(),
  serviceName: z.string().trim().min(2).max(160),
  clientName: z.string().trim().min(2).max(160),
  amount: z.number().min(0),
  paymentMethod: z.enum(PAYMENT_METHODS),
  workerUserId: z.number().int().positive().nullable().optional(),
  workerName: z.string().trim().min(2).max(160),
  note: z.string().trim().max(2000).optional(),
});

export const servicesRouter = router({
  // The service catalogue, for the picker.
  catalogue: permissionProcedure("services.read").query(async () => {
    const db = await dbOrThrow();
    return db
      .select({
        id: clinicServices.id,
        name: clinicServices.name,
        price: clinicServices.price,
        durationMinutes: clinicServices.durationMinutes,
      })
      .from(clinicServices)
      .where(eq(clinicServices.isActive, true))
      .orderBy(asc(clinicServices.name));
  }),

  // Staff who can be named as the worker in charge.
  workers: permissionProcedure("services.read").query(async () => {
    const db = await dbOrThrow();
    return db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        position: staffProfiles.position,
      })
      .from(staffProfiles)
      .innerJoin(users, eq(staffProfiles.userId, users.id))
      .where(and(eq(staffProfiles.status, "active"), eq(users.isActive, true)))
      .orderBy(asc(users.name));
  }),

  // The log itself, newest first, with the totals for whatever is being asked about.
  list: permissionProcedure("services.read")
    .input(
      listInputSchema.extend({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        paymentMethod: z.enum(PAYMENT_METHODS).optional(),
        workerUserId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(serviceSales.deletedAt),
        input.dateFrom ? gte(serviceSales.serviceDate, input.dateFrom) : undefined,
        input.dateTo ? lte(serviceSales.serviceDate, input.dateTo) : undefined,
        input.paymentMethod ? eq(serviceSales.paymentMethod, input.paymentMethod) : undefined,
        input.workerUserId ? eq(serviceSales.workerUserId, input.workerUserId) : undefined,
        input.search
          ? or(
              ilike(serviceSales.clientName, likePattern(input.search)),
              ilike(serviceSales.serviceName, likePattern(input.search)),
              ilike(serviceSales.workerName, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], [sum], byMethod] = await Promise.all([
        db
          .select()
          .from(serviceSales)
          .where(where)
          .orderBy(desc(serviceSales.serviceDate), desc(serviceSales.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(serviceSales).where(where),
        db
          .select({ total: sql<string>`coalesce(sum(${serviceSales.amount}), 0)` })
          .from(serviceSales)
          .where(where),
        db
          .select({
            paymentMethod: serviceSales.paymentMethod,
            total: sql<string>`coalesce(sum(${serviceSales.amount}), 0)`,
          })
          .from(serviceSales)
          .where(where)
          .groupBy(serviceSales.paymentMethod),
      ]);

      return {
        ...paginate(
          rows.map(row => ({ ...row, amount: money(row.amount) })),
          Number(total?.total ?? 0),
          input,
        ),
        filteredTotal: money(sum?.total),
        byPaymentMethod: byMethod.map(row => ({
          paymentMethod: row.paymentMethod,
          total: money(row.total),
        })),
      };
    }),

  // Records a service, or corrects one already recorded.
  save: permissionProcedure("services.write")
    .input(saveInput)
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const amountMinor = toMinor(input.amount);

      const values = {
        serviceDate: input.serviceDate,
        serviceId: input.serviceId ?? null,
        serviceName: input.serviceName,
        clientName: input.clientName,
        amount: toAmountString(amountMinor),
        paymentMethod: input.paymentMethod,
        workerUserId: input.workerUserId ?? null,
        workerName: input.workerName,
        note: input.note || null,
      };

      const describe = `${input.serviceName} for ${input.clientName}`;

      return db.transaction(async tx => {
        if (input.id) {
          const [before] = await tx
            .select()
            .from(serviceSales)
            .where(and(eq(serviceSales.id, input.id), isNull(serviceSales.deletedAt)))
            .limit(1);

          if (!before) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That service is no longer on file.",
            });
          }

          // Only when the figure moved.
          let revenueTransactionId = before.revenueTransactionId;
          if (toMinor(before.amount) !== amountMinor) {
            if (before.revenueTransactionId) {
              await reverseRevenue(tx, {
                revenueTransactionId: before.revenueTransactionId,
                reason: `Corrected: ${describe}`,
                recordedByUserId: ctx.user.id,
              });
            }
            revenueTransactionId =
              (await recordRevenue(tx, {
                source: "service",
                sourceType: "service_sale",
                sourceId: before.id,
                amountMinor,
                description: describe,
                occurredAt: input.serviceDate,
                recordedByUserId: ctx.user.id,
              })) ?? null;
          }

          await tx
            .update(serviceSales)
            .set({ ...values, revenueTransactionId })
            .where(eq(serviceSales.id, input.id));

          await recordAudit(tx, ctx.actor, {
            action: "update",
            entity: "serviceSale",
            entityId: before.id,
            entityLabel: describe,
            oldValue: {
              serviceName: before.serviceName,
              clientName: before.clientName,
              amount: money(before.amount),
              paymentMethod: before.paymentMethod,
              workerName: before.workerName,
            },
            newValue: { ...values, amount: input.amount },
            summary: `${ctx.actor.name ?? "Staff"} corrected the GHS ${input.amount.toFixed(2)} service "${describe}"`,
          });

          return { id: before.id, title: describe };
        }

        const [created] = await tx
          .insert(serviceSales)
          .values({ ...values, recordedByUserId: ctx.user.id })
          .returning({ id: serviceSales.id });

        if (!created?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The service could not be recorded.",
          });
        }

        const revenueTransactionId = await recordRevenue(tx, {
          source: "service",
          sourceType: "service_sale",
          sourceId: created.id,
          amountMinor,
          description: describe,
          occurredAt: input.serviceDate,
          recordedByUserId: ctx.user.id,
        });

        if (revenueTransactionId) {
          await tx
            .update(serviceSales)
            .set({ revenueTransactionId })
            .where(eq(serviceSales.id, created.id));
        }

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "serviceSale",
          entityId: created.id,
          entityLabel: describe,
          newValue: { ...values, amount: input.amount },
          summary: `${ctx.actor.name ?? "Staff"} recorded GHS ${input.amount.toFixed(2)} for ${describe}`,
        });

        return { id: created.id, title: describe };
      });
    }),

  // Takes a service off the log.
  remove: permissionProcedure("services.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const isAdministrator =
        ctx.user.role === "admin" ||
        ctx.access.roles.includes("super_admin") ||
        ctx.access.roles.includes("administrator");
      if (!isAdministrator) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators can remove recorded salon services and reverse revenue.",
        });
      }

      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [before] = await tx
          .select()
          .from(serviceSales)
          .where(and(eq(serviceSales.id, input.id), isNull(serviceSales.deletedAt)))
          .limit(1);

        if (!before) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That service is no longer on file." });
        }

        const describe = `${before.serviceName} for ${before.clientName}`;

        if (before.revenueTransactionId) {
          await reverseRevenue(tx, {
            revenueTransactionId: before.revenueTransactionId,
            reason: `Removed: ${describe}`,
            recordedByUserId: ctx.user.id,
          });
        }

        await tx
          .update(serviceSales)
          .set({ deletedAt: new Date() })
          .where(eq(serviceSales.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: "delete",
          entity: "serviceSale",
          entityId: before.id,
          entityLabel: describe,
          oldValue: {
            serviceName: before.serviceName,
            clientName: before.clientName,
            amount: money(before.amount),
            paymentMethod: before.paymentMethod,
            workerName: before.workerName,
          },
          summary: `${ctx.actor.name ?? "Staff"} removed the GHS ${money(before.amount).toFixed(2)} service "${describe}"`,
        });

        return { id: before.id, title: describe };
      });
    }),
});
