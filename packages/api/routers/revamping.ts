import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { revampingRecords } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { money, toAmountString, toMinor } from "../services/money";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { permissionProcedure, router } from "../trpc";

// The salon revamping register: Date, Name, Quantity, Style, Total amount,
// Amount paid, Amount left, Paid type. Kept the way the paper book keeps it.

const PAYMENT_METHODS = ["cash", "mobile_money", "bank", "card", "memo"] as const;

// A calendar day, taken as YYYY-MM-DD text.
const revampDateInput = z
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

const saveInput = z
  .object({
    id: z.number().int().positive().optional(),
    revampDate: revampDateInput,
    clientName: z.string().trim().min(2).max(160),
    quantity: z.number().int().min(1).max(1000),
    style: z.string().trim().min(2).max(160),
    totalAmount: z.number().min(0),
    amountPaid: z.number().min(0),
    paymentMethod: z.enum(PAYMENT_METHODS),
  })
  .superRefine((input, ctx) => {
    if (input.amountPaid > input.totalAmount) {
      ctx.addIssue({
        code: "custom",
        path: ["amountPaid"],
        message: "Amount paid cannot be more than the total amount.",
      });
    }
  });

const asRow = (row: typeof revampingRecords.$inferSelect) => ({
  id: row.id,
  revampDate: row.revampDate,
  clientName: row.clientName,
  quantity: row.quantity,
  style: row.style,
  totalAmount: money(row.totalAmount),
  amountPaid: money(row.amountPaid),
  amountLeft: money(row.amountLeft),
  paymentMethod: row.paymentMethod,
  recordedByUserId: row.recordedByUserId,
  createdAt: row.createdAt,
});

export const revampingRouter = router({
  // The register itself, newest first, with the totals for whatever is being asked about.
  list: permissionProcedure("revamping.read")
    .input(
      listInputSchema.extend({
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        paymentMethod: z.enum(PAYMENT_METHODS).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(revampingRecords.deletedAt),
        input.dateFrom ? gte(revampingRecords.revampDate, input.dateFrom) : undefined,
        input.dateTo ? lte(revampingRecords.revampDate, input.dateTo) : undefined,
        input.paymentMethod ? eq(revampingRecords.paymentMethod, input.paymentMethod) : undefined,
        input.search
          ? or(
              ilike(revampingRecords.clientName, likePattern(input.search)),
              ilike(revampingRecords.style, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], totals] = await Promise.all([
        db
          .select()
          .from(revampingRecords)
          .where(where)
          .orderBy(desc(revampingRecords.revampDate), desc(revampingRecords.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(revampingRecords).where(where),
        db
          .select({
            totalAmount: sql<string>`coalesce(sum(${revampingRecords.totalAmount}), 0)`,
            amountPaid: sql<string>`coalesce(sum(${revampingRecords.amountPaid}), 0)`,
            amountLeft: sql<string>`coalesce(sum(${revampingRecords.amountLeft}), 0)`,
          })
          .from(revampingRecords)
          .where(where),
      ]);

      return {
        ...paginate(rows.map(asRow), Number(total?.total ?? 0), input),
        filteredTotal: money(totals[0]?.totalAmount),
        filteredPaid: money(totals[0]?.amountPaid),
        filteredLeft: money(totals[0]?.amountLeft),
      };
    }),

  // Records a revamping job, or corrects one already recorded.
  save: permissionProcedure("revamping.write")
    .input(saveInput)
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const totalMinor = toMinor(input.totalAmount);
      const paidMinor = toMinor(input.amountPaid);
      const leftMinor = Math.max(totalMinor - paidMinor, 0);

      const values = {
        revampDate: input.revampDate,
        clientName: input.clientName,
        quantity: input.quantity,
        style: input.style,
        totalAmount: toAmountString(totalMinor),
        amountPaid: toAmountString(paidMinor),
        amountLeft: toAmountString(leftMinor),
        paymentMethod: input.paymentMethod,
      };

      const describe = `${input.style} for ${input.clientName}`;

      return db.transaction(async tx => {
        if (input.id) {
          const [before] = await tx
            .select()
            .from(revampingRecords)
            .where(and(eq(revampingRecords.id, input.id), isNull(revampingRecords.deletedAt)))
            .limit(1);

          if (!before) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That revamping record is no longer on file.",
            });
          }

          await tx.update(revampingRecords).set(values).where(eq(revampingRecords.id, input.id));

          await recordAudit(tx, ctx.actor, {
            action: "update",
            entity: "revampingRecord",
            entityId: before.id,
            entityLabel: describe,
            oldValue: {
              revampDate: before.revampDate,
              clientName: before.clientName,
              quantity: before.quantity,
              style: before.style,
              totalAmount: money(before.totalAmount),
              amountPaid: money(before.amountPaid),
              amountLeft: money(before.amountLeft),
              paymentMethod: before.paymentMethod,
            },
            newValue: {
              ...values,
              totalAmount: input.totalAmount,
              amountPaid: input.amountPaid,
              amountLeft: money(leftMinor),
            },
            summary: `${ctx.actor.name ?? "Staff"} corrected the revamping record "${describe}"`,
          });

          return { id: before.id, title: describe };
        }

        const [created] = await tx
          .insert(revampingRecords)
          .values({ ...values, recordedByUserId: ctx.user.id })
          .returning({ id: revampingRecords.id });

        if (!created?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The revamping record could not be saved.",
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "revampingRecord",
          entityId: created.id,
          entityLabel: describe,
          newValue: {
            ...values,
            totalAmount: input.totalAmount,
            amountPaid: input.amountPaid,
            amountLeft: money(leftMinor),
          },
          summary: `${ctx.actor.name ?? "Staff"} recorded GHS ${input.totalAmount.toFixed(2)} for ${describe}`,
        });

        return { id: created.id, title: describe };
      });
    }),

  // Takes a record off the register.
  remove: permissionProcedure("revamping.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const isAdministrator =
        ctx.user.role === "admin" ||
        ctx.access.roles.includes("super_admin") ||
        ctx.access.roles.includes("administrator");
      if (!isAdministrator) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators can remove revamping records.",
        });
      }

      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [before] = await tx
          .select()
          .from(revampingRecords)
          .where(and(eq(revampingRecords.id, input.id), isNull(revampingRecords.deletedAt)))
          .limit(1);

        if (!before) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That revamping record is no longer on file." });
        }

        const describe = `${before.style} for ${before.clientName}`;

        await tx
          .update(revampingRecords)
          .set({ deletedAt: new Date() })
          .where(eq(revampingRecords.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: "delete",
          entity: "revampingRecord",
          entityId: before.id,
          entityLabel: describe,
          oldValue: {
            revampDate: before.revampDate,
            clientName: before.clientName,
            quantity: before.quantity,
            style: before.style,
            totalAmount: money(before.totalAmount),
            amountPaid: money(before.amountPaid),
            amountLeft: money(before.amountLeft),
            paymentMethod: before.paymentMethod,
          },
          summary: `${ctx.actor.name ?? "Staff"} removed the revamping record "${describe}"`,
        });

        return { id: before.id, title: describe };
      });
    }),
});
