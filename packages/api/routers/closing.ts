import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { dailyClosings, expenses, payments, users } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import { dayBounds, isFutureDay, isoDay, toDayKey } from "../services/closing";
import { money, toAmountString, toMinor } from "../services/money";
import { permissionProcedure, router } from "../trpc";

// End-of-day closing.

export type DaySummary = Awaited<ReturnType<typeof summariseDay>>;

// What the books say about one day, computed fresh from the transactions.
async function summariseDay(db: Awaited<ReturnType<typeof dbOrThrow>>, date: Date) {
  const { start, end } = dayBounds(date);

  const takings = await db
    .select({
      method: payments.paymentMethod,
      net: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)`,
    })
    .from(payments)
    .where(
      and(
        gte(payments.paidAt, start),
        lt(payments.paidAt, end),
        ne(payments.status, "failed"),
        ne(payments.status, "pending"),
      ),
    )
    .groupBy(payments.paymentMethod);

  const byMethod = new Map(takings.map(row => [row.method, toMinor(row.net)]));
  const at = (method: string) => byMethod.get(method as never) ?? 0;

  const cash = at("cash");
  const momo = at("mobile_money");
  const card = at("card");
  const bank = at("bank");
  const online = at("online");
  const totalSales = cash + momo + card + bank + online;

  // Counted the way the ledger counts them: a rejected expense never happened.
  const spend = await db
    .select({
      method: expenses.paymentMethod,
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        gte(expenses.expenseDate, start),
        lt(expenses.expenseDate, end),
        ne(expenses.approvalStatus, "rejected"),
        sql`${expenses.deletedAt} is null`,
      ),
    )
    .groupBy(expenses.paymentMethod);

  const totalExpenses = spend.reduce((sum, row) => sum + toMinor(row.total), 0);
  const cashExpenses = spend
    .filter(row => row.method === "cash")
    .reduce((sum, row) => sum + toMinor(row.total), 0);

  // One person paying twice is one customer.
  const [served] = await db
    .select({
      count: sql<number>`count(distinct coalesce(
        'student:' || ${payments.studentId},
        'order:' || ${payments.storeOrderId},
        'payment:' || ${payments.id}
      ))`,
    })
    .from(payments)
    .where(
      and(
        gte(payments.paidAt, start),
        lt(payments.paidAt, end),
        ne(payments.status, "failed"),
        ne(payments.status, "pending"),
      ),
    );

  return {
    date: isoDay(date),
    customersServed: Number(served?.count ?? 0),
    cashSales: cash / 100,
    momoSales: momo / 100,
    cardSales: card / 100,
    bankSales: bank / 100,
    onlineSales: online / 100,
    totalSales: totalSales / 100,
    totalExpenses: totalExpenses / 100,
    cashExpenses: cashExpenses / 100,
    // Cash in, less cash paid out.
    expectedCash: (cash - cashExpenses) / 100,
  };
}

export const closingRouter = router({
  // The day as it stands.
  day: permissionProcedure("closing.read")
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const live = await summariseDay(db, input.date);

      const [closing] = await db
        .select({
          id: dailyClosings.id,
          closingDate: dailyClosings.closingDate,
          customersServed: dailyClosings.customersServed,
          cashSales: dailyClosings.cashSales,
          momoSales: dailyClosings.momoSales,
          cardSales: dailyClosings.cardSales,
          bankSales: dailyClosings.bankSales,
          onlineSales: dailyClosings.onlineSales,
          totalSales: dailyClosings.totalSales,
          totalExpenses: dailyClosings.totalExpenses,
          cashExpenses: dailyClosings.cashExpenses,
          expectedCash: dailyClosings.expectedCash,
          countedCash: dailyClosings.countedCash,
          discrepancy: dailyClosings.discrepancy,
          notes: dailyClosings.notes,
          closedAt: dailyClosings.closedAt,
          closedByName: users.name,
        })
        .from(dailyClosings)
        .leftJoin(users, eq(dailyClosings.closedByUserId, users.id))
        .where(
          and(
            eq(dailyClosings.closingDate, toDayKey(input.date)),
            sql`${dailyClosings.reopenedAt} is null`,
          ),
        )
        .limit(1);

      const snapshot = closing
        ? {
            ...closing,
            cashSales: money(closing.cashSales),
            momoSales: money(closing.momoSales),
            cardSales: money(closing.cardSales),
            bankSales: money(closing.bankSales),
            onlineSales: money(closing.onlineSales),
            totalSales: money(closing.totalSales),
            totalExpenses: money(closing.totalExpenses),
            cashExpenses: money(closing.cashExpenses),
            expectedCash: money(closing.expectedCash),
            countedCash: money(closing.countedCash),
            discrepancy: money(closing.discrepancy),
          }
        : null;

      return {
        live,
        closing: snapshot,
        isClosed: Boolean(snapshot),
        // True when the books moved after the day was signed off.
        hasDrifted: snapshot
          ? snapshot.totalSales !== live.totalSales ||
            snapshot.expectedCash !== live.expectedCash
          : false,
        // Tomorrow cannot be closed; today can, once trading has finished.
        isFuture: isFutureDay(input.date),
      };
    }),

  // Locks the day.
  close: permissionProcedure("closing.write")
    .input(
      z.object({
        date: z.coerce.date(),
        countedCash: z.number().min(0).max(10_000_000),
        notes: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const dayKey = toDayKey(input.date);

      if (isFutureDay(input.date)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A day cannot be closed before it has happened.",
        });
      }

      const [existing] = await db
        .select({ id: dailyClosings.id, reopenedAt: dailyClosings.reopenedAt })
        .from(dailyClosings)
        .where(eq(dailyClosings.closingDate, dayKey))
        .limit(1);

      if (existing && !existing.reopenedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${isoDay(input.date)} is already closed. Reopen it first if it needs correcting.`,
        });
      }

      const live = await summariseDay(db, input.date);
      const discrepancy = input.countedCash - live.expectedCash;

      const values = {
        closingDate: dayKey,
        customersServed: live.customersServed,
        cashSales: toAmountString(toMinor(live.cashSales)),
        momoSales: toAmountString(toMinor(live.momoSales)),
        cardSales: toAmountString(toMinor(live.cardSales)),
        bankSales: toAmountString(toMinor(live.bankSales)),
        onlineSales: toAmountString(toMinor(live.onlineSales)),
        totalSales: toAmountString(toMinor(live.totalSales)),
        totalExpenses: toAmountString(toMinor(live.totalExpenses)),
        cashExpenses: toAmountString(toMinor(live.cashExpenses)),
        expectedCash: toAmountString(toMinor(live.expectedCash)),
        countedCash: toAmountString(toMinor(input.countedCash)),
        discrepancy: toAmountString(toMinor(discrepancy)),
        notes: input.notes || null,
        closedByUserId: ctx.user.id,
        closedAt: new Date(),
        // Closing again clears the reopening, so the row reads as closed.
        reopenedAt: null,
        reopenedByUserId: null,
        reopenReason: null,
      };

      return db.transaction(async tx => {
        // The unique date makes this the whole concurrency story.
        const [saved] = await tx
          .insert(dailyClosings)
          .values(values)
          .onConflictDoUpdate({ target: dailyClosings.closingDate, set: values })
          .returning({ id: dailyClosings.id });

        await recordAudit(tx, ctx.actor, {
          action: "close_day",
          entity: "dailyClosing",
          entityId: saved?.id,
          entityLabel: isoDay(input.date),
          newValue: {
            totalSales: live.totalSales,
            expectedCash: live.expectedCash,
            countedCash: input.countedCash,
            discrepancy,
          },
          summary: `${ctx.actor.name ?? "Staff"} closed ${isoDay(input.date)}: counted GHS ${input.countedCash.toFixed(2)} against GHS ${live.expectedCash.toFixed(2)} expected`,
        });

        return { id: saved?.id, discrepancy, expectedCash: live.expectedCash };
      });
    }),

  // Unlocks a closed day so it can be counted again.
  reopen: permissionProcedure("closing.reopen")
    .input(
      z.object({
        date: z.coerce.date(),
        reason: z.string().trim().min(4).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const dayKey = toDayKey(input.date);

      const [existing] = await db
        .select()
        .from(dailyClosings)
        .where(eq(dailyClosings.closingDate, dayKey))
        .limit(1);

      if (!existing || existing.reopenedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `${isoDay(input.date)} is not closed.`,
        });
      }

      return db.transaction(async tx => {
        await tx
          .update(dailyClosings)
          .set({
            reopenedAt: new Date(),
            reopenedByUserId: ctx.user.id,
            reopenReason: input.reason,
          })
          .where(eq(dailyClosings.id, existing.id));

        await recordAudit(tx, ctx.actor, {
          action: "reopen_day",
          entity: "dailyClosing",
          entityId: existing.id,
          entityLabel: isoDay(input.date),
          oldValue: {
            countedCash: money(existing.countedCash),
            discrepancy: money(existing.discrepancy),
          },
          newValue: { reason: input.reason },
          summary: `${ctx.actor.name ?? "Staff"} reopened ${isoDay(input.date)}: ${input.reason}`,
        });

        return { success: true };
      });
    }),

  // The archive, newest first.
  history: permissionProcedure("closing.read")
    .input(z.object({ limit: z.number().int().min(1).max(200).default(60) }).optional())
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const rows = await db
        .select({
          id: dailyClosings.id,
          closingDate: dailyClosings.closingDate,
          customersServed: dailyClosings.customersServed,
          totalSales: dailyClosings.totalSales,
          totalExpenses: dailyClosings.totalExpenses,
          expectedCash: dailyClosings.expectedCash,
          countedCash: dailyClosings.countedCash,
          discrepancy: dailyClosings.discrepancy,
          notes: dailyClosings.notes,
          closedAt: dailyClosings.closedAt,
          reopenedAt: dailyClosings.reopenedAt,
          closedByName: users.name,
        })
        .from(dailyClosings)
        .leftJoin(users, eq(dailyClosings.closedByUserId, users.id))
        .orderBy(desc(dailyClosings.closingDate))
        .limit(input?.limit ?? 60);

      return rows.map(row => ({
        ...row,
        totalSales: money(row.totalSales),
        totalExpenses: money(row.totalExpenses),
        expectedCash: money(row.expectedCash),
        countedCash: money(row.countedCash),
        discrepancy: money(row.discrepancy),
        isReopened: Boolean(row.reopenedAt),
      }));
    }),

  // How the till has been running lately.
  variance: permissionProcedure("closing.read")
    .input(z.object({ days: z.number().int().min(7).max(180).default(30) }).optional())
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - (input?.days ?? 30));

      const [row] = await db
        .select({
          daysClosed: sql<number>`count(*)`,
          net: sql<string>`coalesce(sum(${dailyClosings.discrepancy}), 0)`,
          shortDays: sql<number>`count(*) filter (where ${dailyClosings.discrepancy} < 0)`,
          overDays: sql<number>`count(*) filter (where ${dailyClosings.discrepancy} > 0)`,
        })
        .from(dailyClosings)
        .where(
          and(gte(dailyClosings.closingDate, toDayKey(since)), sql`${dailyClosings.reopenedAt} is null`),
        );

      return {
        daysClosed: Number(row?.daysClosed ?? 0),
        netVariance: money(row?.net),
        shortDays: Number(row?.shortDays ?? 0),
        overDays: Number(row?.overDays ?? 0),
      };
    }),
});
