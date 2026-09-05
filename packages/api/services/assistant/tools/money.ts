import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  expenseCategories,
  expenses,
  feeCharges,
  payments,
  revenueTransactions,
  serviceSales,
  studentProfiles,
} from "@blush/db/schema";
import { expensesByCategory, financeMetrics, revenueByMonth } from "../../analytics";
import { fromMinor, toMinor } from "../../money";
import { defineTool } from "../types";
import { isoDay, likeTerm, since } from "./shared";

export const financeTools = [
  defineTool({
    name: "finance_summary",
    description:
      "Income today and this month, expenses, profit and outstanding fees. Start here for money questions.",
    permissions: ["finance.read"],
    input: z.object({}),
    async run(_args, ctx) {
      const metrics = await financeMetrics(ctx.db);
      return { currency: "GHS", ...metrics };
    },
  }),

  defineTool({
    name: "revenue_trend",
    description:
      "Income and expenses month by month, for trends and comparisons.",
    permissions: ["finance.read"],
    input: z.object({
      months: z.number().int().min(2).max(24).default(12),
    }),
    async run(args, ctx) {
      const [revenue, expenseSplit] = await Promise.all([
        revenueByMonth(ctx.db, args.months),
        expensesByCategory(ctx.db, args.months),
      ]);

      return { currency: "GHS", months: args.months, byMonth: revenue, expensesByCategory: expenseSplit };
    },
  }),

  defineTool({
    name: "list_payments",
    description:
      "Payments received, newest first: fees, orders and services. Use for what was paid, by whom, how.",
    permissions: ["payments.read"],
    input: z.object({
      days: z.number().int().min(1).max(365).default(30),
      method: z.enum(["cash", "mobile_money", "bank", "card", "online"]).optional(),
      search: z.string().optional().describe("Payment reference or student name."),
      limit: z.number().int().min(1).max(40).default(15),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);
      const filters = [gte(payments.createdAt, from), eq(payments.status, "completed")];
      if (args.method) filters.push(eq(payments.paymentMethod, args.method));
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(ilike(payments.reference, term), ilike(studentProfiles.fullName, term))!,
        );
      }

      const [rows, totals] = await Promise.all([
        ctx.db
          .select({
            reference: payments.reference,
            student: studentProfiles.fullName,
            amount: payments.amount,
            refunded: payments.refundedAmount,
            feeType: payments.feeType,
            method: payments.paymentMethod,
            paidAt: payments.paidAt,
            note: payments.note,
          })
          .from(payments)
          .leftJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
          .where(and(...filters))
          .orderBy(desc(payments.createdAt))
          .limit(args.limit),
        ctx.db
          .select({
            method: payments.paymentMethod,
            total: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)`,
          })
          .from(payments)
          .where(and(gte(payments.createdAt, from), eq(payments.status, "completed")))
          .groupBy(payments.paymentMethod),
      ]);

      return {
        currency: "GHS",
        window: { days: args.days, from: isoDay(from) },
        shown: rows.length,
        payments: rows,
        windowTotalsByMethod: totals.map(row => ({
          method: row.method,
          total: fromMinor(toMinor(row.total)),
        })),
      };
    },
  }),

  defineTool({
    name: "fee_arrears",
    description:
      "Students who still owe money, largest debt first. Use for arrears, debtors, who has not paid.",
    permissions: ["fees.read"],
    input: z.object({
      limit: z.number().int().min(1).max(40).default(15),
    }),
    async run(args, ctx) {
      // Outstanding is billed minus paid on the charge itself, which is the
      // figure the fees screen shows and is maintained by allocation.
      const rows = await ctx.db
        .select({
          studentNumber: studentProfiles.studentNumber,
          student: studentProfiles.fullName,
          phone: studentProfiles.phone,
          email: studentProfiles.email,
          outstanding: sql<string>`sum(${feeCharges.amountDue} - ${feeCharges.amountPaid})`,
          openCharges: sql<number>`count(*)`,
          earliestDue: sql<string | null>`min(${feeCharges.dueDate})`,
        })
        .from(feeCharges)
        .innerJoin(studentProfiles, eq(feeCharges.studentId, studentProfiles.id))
        .where(
          and(
            isNull(studentProfiles.deletedAt),
            sql`${feeCharges.status} in ('open', 'partially_paid')`,
          ),
        )
        .groupBy(
          studentProfiles.id,
          studentProfiles.studentNumber,
          studentProfiles.fullName,
          studentProfiles.phone,
          studentProfiles.email,
        )
        .having(sql`sum(${feeCharges.amountDue} - ${feeCharges.amountPaid}) > 0`)
        .orderBy(desc(sql`sum(${feeCharges.amountDue} - ${feeCharges.amountPaid})`))
        .limit(args.limit);

      const totalOwed = rows.reduce((sum, row) => sum + toMinor(row.outstanding), 0);

      return {
        currency: "GHS",
        studentsShown: rows.length,
        totalOwedByThoseShown: fromMinor(totalOwed),
        students: rows.map(row => ({
          ...row,
          outstanding: fromMinor(toMinor(row.outstanding)),
          openCharges: Number(row.openCharges),
        })),
      };
    },
  }),

  defineTool({
    name: "list_expenses",
    description:
      "Money spent, newest first, by category and approval state. Use for costs and spending.",
    permissions: ["expenses.read"],
    input: z.object({
      days: z.number().int().min(1).max(365).default(30),
      scope: z.enum(["school", "store"]).optional(),
      approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      limit: z.number().int().min(1).max(40).default(15),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);
      const filters = [isNull(expenses.deletedAt), gte(expenses.expenseDate, from)];
      if (args.scope) filters.push(eq(expenses.scope, args.scope));
      if (args.approvalStatus) filters.push(eq(expenses.approvalStatus, args.approvalStatus));

      const [rows, byCategory] = await Promise.all([
        ctx.db
          .select({
            title: expenses.title,
            category: expenseCategories.name,
            scope: expenses.scope,
            amount: expenses.amount,
            vendor: expenses.vendor,
            expenseDate: expenses.expenseDate,
            approvalStatus: expenses.approvalStatus,
            method: expenses.paymentMethod,
          })
          .from(expenses)
          .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
          .where(and(...filters))
          .orderBy(desc(expenses.expenseDate))
          .limit(args.limit),
        ctx.db
          .select({
            category: expenseCategories.name,
            total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
          })
          .from(expenses)
          .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
          .where(and(isNull(expenses.deletedAt), gte(expenses.expenseDate, from)))
          .groupBy(expenseCategories.name),
      ]);

      return {
        currency: "GHS",
        window: { days: args.days, from: isoDay(from) },
        shown: rows.length,
        expenses: rows,
        windowTotalsByCategory: byCategory.map(row => ({
          category: row.category ?? "Uncategorised",
          total: fromMinor(toMinor(row.total)),
        })),
      };
    },
  }),

  defineTool({
    name: "services_log",
    description:
      "Salon and clinic work done, what was charged and by whom. Use for daily service takings.",
    permissions: ["services.read"],
    input: z.object({
      days: z.number().int().min(1).max(180).default(14),
      limit: z.number().int().min(1).max(40).default(20),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);
      const filters = [isNull(serviceSales.deletedAt), gte(serviceSales.serviceDate, from)];

      const [rows, totals] = await Promise.all([
        ctx.db
          .select({
            serviceDate: serviceSales.serviceDate,
            service: serviceSales.serviceName,
            client: serviceSales.clientName,
            amount: serviceSales.amount,
            method: serviceSales.paymentMethod,
            worker: serviceSales.workerName,
          })
          .from(serviceSales)
          .where(and(...filters))
          .orderBy(desc(serviceSales.serviceDate))
          .limit(args.limit),
        ctx.db
          .select({
            service: serviceSales.serviceName,
            jobs: sql<number>`count(*)`,
            total: sql<string>`coalesce(sum(${serviceSales.amount}), 0)`,
          })
          .from(serviceSales)
          .where(and(...filters))
          .groupBy(serviceSales.serviceName)
          .orderBy(desc(sql`sum(${serviceSales.amount})`))
          .limit(12),
      ]);

      return {
        currency: "GHS",
        window: { days: args.days, from: isoDay(from) },
        services: rows,
        totalsByService: totals.map(row => ({
          service: row.service,
          jobs: Number(row.jobs),
          total: fromMinor(toMinor(row.total)),
        })),
      };
    },
  }),

  defineTool({
    name: "income_sources",
    description:
      "Income broken down by source: fees, product sales, services and the rest.",
    permissions: ["finance.read"],
    input: z.object({
      days: z.number().int().min(1).max(365).default(30),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);

      const rows = await ctx.db
        .select({
          source: revenueTransactions.source,
          entries: sql<number>`count(*)`,
          total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)`,
        })
        .from(revenueTransactions)
        .where(gte(revenueTransactions.occurredAt, from))
        .groupBy(revenueTransactions.source)
        .orderBy(desc(sql`sum(${revenueTransactions.amount})`));

      const total = rows.reduce((sum, row) => sum + toMinor(row.total), 0);

      return {
        currency: "GHS",
        window: { days: args.days, from: isoDay(from) },
        total: fromMinor(total),
        bySource: rows.map(row => ({
          source: row.source,
          entries: Number(row.entries),
          total: fromMinor(toMinor(row.total)),
        })),
      };
    },
  }),
];
