import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  courses,
  expenseCategories,
  expenses,
  feeAdjustments,
  feeCharges,
  feeStructures,
  payments,
  revenueTransactions,
  studentProfiles,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { recordAudit } from "../services/audit";
import { allocatePayment, assertRefundable, studentAccountSummary } from "../services/fees";
import { fromMinor, money, toAmountString, toMinor } from "../services/money";
import { notify, staffRecipients } from "../services/notify";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { recordRevenue, reverseRevenue } from "../services/revenue";
import { permissionProcedure, router } from "../trpc";

const FEE_TYPES = ["tuition", "registration", "materials", "exam", "certification", "other"] as const;
const PAYMENT_METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;
const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "transport",
  "equipment",
  "beauty_products",
  "maintenance",
  "marketing",
  "stationery",
  "cleaning",
  "other",
] as const;

/** Postgres unique-violation, raised when a duplicate reference is booked. */
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";

export const financeRouter = router({
  /* ---------------------------------------------------------------------- */
  /* Fee structures (§24)                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * The fee catalogue, with the programme each line belongs to.
   *
   * A structure with no course is the school-wide default — registration, say —
   * so `courseTitle` is null rather than the row being dropped by the join.
   */
  feeStructures: permissionProcedure("fees.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select({ structure: feeStructures, courseTitle: courses.title })
      .from(feeStructures)
      .leftJoin(courses, eq(feeStructures.courseId, courses.id))
      .orderBy(courses.title, feeStructures.feeType);
    return rows.map(({ structure, courseTitle }) => ({
      ...structure,
      amount: money(structure.amount),
      courseTitle,
    }));
  }),

  upsertFeeStructure: permissionProcedure("fees.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        courseId: z.number().int().positive().nullable(),
        intakeId: z.number().int().positive().nullable(),
        feeType: z.enum(FEE_TYPES),
        label: z.string().min(2).max(180),
        amount: z.number().min(0),
        isMandatory: z.boolean().default(true),
        dueOffsetDays: z.number().int().min(0).max(3650).default(0),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        courseId: input.courseId,
        intakeId: input.intakeId,
        feeType: input.feeType,
        label: input.label,
        amount: toAmountString(toMinor(input.amount)),
        isMandatory: input.isMandatory,
        dueOffsetDays: input.dueOffsetDays,
        isActive: input.isActive,
      };

      if (input.id) {
        const [before] = await db
          .select()
          .from(feeStructures)
          .where(eq(feeStructures.id, input.id))
          .limit(1);
        await db.update(feeStructures).set(values).where(eq(feeStructures.id, input.id));
        await recordAudit(db, ctx.actor, {
          action: "update",
          entity: "feeStructure",
          entityId: input.id,
          entityLabel: input.label,
          oldValue: before,
          newValue: values,
        });
        return { id: input.id };
      }

      const [created] = await db
        .insert(feeStructures)
        .values(values)
        .returning({ id: feeStructures.id });
      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "feeStructure",
        entityId: created?.id,
        entityLabel: input.label,
        newValue: values,
      });
      return { id: created?.id };
    }),

  /* ---------------------------------------------------------------------- */
  /* Student fee accounts (§24)                                             */
  /* ---------------------------------------------------------------------- */

  /** The account equation, plus the charges behind it. */
  studentAccount: permissionProcedure("fees.read")
    .input(z.object({ studentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentId))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

      const [summary, charges, adjustments, history] = await Promise.all([
        studentAccountSummary(db, input.studentId),
        db
          .select()
          .from(feeCharges)
          .where(eq(feeCharges.studentId, input.studentId))
          .orderBy(feeCharges.dueDate, feeCharges.id),
        db
          .select()
          .from(feeAdjustments)
          .where(eq(feeAdjustments.studentId, input.studentId))
          .orderBy(desc(feeAdjustments.createdAt)),
        db
          .select()
          .from(payments)
          .where(eq(payments.studentId, input.studentId))
          .orderBy(desc(payments.paidAt)),
      ]);

      return {
        student,
        summary,
        charges: charges.map(charge => ({
          ...charge,
          amountDue: money(charge.amountDue),
          amountPaid: money(charge.amountPaid),
          balance: money(charge.amountDue) - money(charge.amountPaid),
        })),
        adjustments: adjustments.map(row => ({ ...row, amount: money(row.amount) })),
        payments: history.map(row => ({
          ...row,
          amount: money(row.amount),
          refundedAmount: money(row.refundedAmount),
        })),
      };
    }),

  /** Outstanding-balance report, paginated server-side (§25, §43). */
  outstanding: permissionProcedure("fees.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const searchFilter = input.search
        ? or(
            ilike(studentProfiles.fullName, likePattern(input.search)),
            ilike(studentProfiles.studentNumber, likePattern(input.search)),
          )
        : undefined;

      const where = and(isNull(studentProfiles.deletedAt), searchFilter);

      const [rows, [total]] = await Promise.all([
        db
          .select({
            studentId: studentProfiles.id,
            studentNumber: studentProfiles.studentNumber,
            fullName: studentProfiles.fullName,
            email: studentProfiles.email,
            phone: studentProfiles.phone,
            status: studentProfiles.status,
            billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
            paid: sql<string>`coalesce(sum(${feeCharges.amountPaid}), 0)`,
          })
          .from(studentProfiles)
          .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
          .where(where)
          .groupBy(studentProfiles.id)
          .having(sql`coalesce(sum(${feeCharges.amountDue}), 0) > coalesce(sum(${feeCharges.amountPaid}), 0)`)
          .orderBy(desc(sql`coalesce(sum(${feeCharges.amountDue}), 0) - coalesce(sum(${feeCharges.amountPaid}), 0)`))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)` })
          .from(
            db
              .select({ id: studentProfiles.id })
              .from(studentProfiles)
              .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
              .where(where)
              .groupBy(studentProfiles.id)
              .having(sql`coalesce(sum(${feeCharges.amountDue}), 0) > coalesce(sum(${feeCharges.amountPaid}), 0)`)
              .as("owing"),
          ),
      ]);

      return paginate(
        rows.map(row => ({
          ...row,
          totalFees: money(row.billed),
          amountPaid: money(row.paid),
          outstanding: money(row.billed) - money(row.paid),
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  createCharge: permissionProcedure("fees.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        enrollmentId: z.number().int().positive().optional(),
        feeType: z.enum(FEE_TYPES),
        description: z.string().min(2).max(255),
        amountDue: z.number().positive(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [charge] = await db
        .insert(feeCharges)
        .values({
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
          feeType: input.feeType,
          description: input.description,
          amountDue: toAmountString(toMinor(input.amountDue)),
          dueDate: input.dueDate,
          createdByUserId: ctx.user.id,
        })
        .returning({ id: feeCharges.id });

      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "feeCharge",
        entityId: charge?.id,
        entityLabel: input.description,
        newValue: { amountDue: input.amountDue, feeType: input.feeType },
        summary: `${ctx.actor.name ?? "Staff"} billed GHS ${input.amountDue.toFixed(2)} to student ${input.studentId}`,
      });

      return { id: charge?.id };
    }),

  /** Discounts and surcharges are recorded, never edited into the charge. */
  adjust: permissionProcedure("fees.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        feeChargeId: z.number().int().positive().optional(),
        adjustmentType: z.enum(["discount", "surcharge"]),
        amount: z.number().positive(),
        reason: z.string().min(2).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [row] = await db
        .insert(feeAdjustments)
        .values({
          studentId: input.studentId,
          feeChargeId: input.feeChargeId,
          adjustmentType: input.adjustmentType,
          amount: toAmountString(toMinor(input.amount)),
          reason: input.reason,
          createdByUserId: ctx.user.id,
        })
        .returning({ id: feeAdjustments.id });

      await recordAudit(db, ctx.actor, {
        action: input.adjustmentType,
        entity: "studentAccount",
        entityId: input.studentId,
        newValue: { amount: input.amount, reason: input.reason },
        summary: `${ctx.actor.name ?? "Staff"} applied a ${input.adjustmentType} of GHS ${input.amount.toFixed(2)} to student ${input.studentId}`,
      });

      return { id: row?.id };
    }),

  /* ---------------------------------------------------------------------- */
  /* Payments (§25)                                                         */
  /* ---------------------------------------------------------------------- */

  payments: permissionProcedure("payments.read")
    .input(
      listInputSchema.extend({
        method: z.enum(PAYMENT_METHODS).optional(),
        studentId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.method ? eq(payments.paymentMethod, input.method) : undefined,
        input.studentId ? eq(payments.studentId, input.studentId) : undefined,
        input.dateFrom ? gte(payments.paidAt, input.dateFrom) : undefined,
        input.dateTo ? lte(payments.paidAt, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(payments.reference, likePattern(input.search)),
              ilike(payments.transactionReference, likePattern(input.search)),
              ilike(studentProfiles.fullName, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({
            payment: payments,
            studentName: studentProfiles.fullName,
            studentNumber: studentProfiles.studentNumber,
          })
          .from(payments)
          .leftJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
          .where(where)
          .orderBy(desc(payments.paidAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(payments)
          .leftJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
          .where(where),
      ]);

      return paginate(
        rows.map(row => ({
          ...row.payment,
          amount: money(row.payment.amount),
          refundedAmount: money(row.payment.refundedAmount),
          studentName: row.studentName,
          studentNumber: row.studentNumber,
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /**
   * Records a student payment as one atomic unit: the payment row, its
   * allocation across open charges, and the revenue line. If any step fails
   * none of it is written, so a balance can never fall out of step with the
   * money actually received (§48).
   */
  recordStudentPayment: permissionProcedure("payments.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        feeChargeId: z.number().int().positive().optional(),
        amount: z.number().positive(),
        paymentMethod: z.enum(PAYMENT_METHODS),
        transactionReference: z.string().max(120).optional(),
        feeType: z.enum(FEE_TYPES).optional(),
        note: z.string().max(1000).optional(),
        paidAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const amountMinor = toMinor(input.amount);

      const [student] = await db
        .select({ id: studentProfiles.id, fullName: studentProfiles.fullName, userId: studentProfiles.userId })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentId))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

      try {
        return await db.transaction(async tx => {
          const reference = buildReference("PAY");

          const [payment] = await tx
            .insert(payments)
            .values({
              reference,
              studentId: input.studentId,
              feeChargeId: input.feeChargeId,
              feeType: input.feeType,
              amount: toAmountString(amountMinor),
              paymentMethod: input.paymentMethod,
              status: "completed",
              transactionReference: input.transactionReference || null,
              note: input.note,
              receivedByUserId: ctx.user.id,
              recordedByUserId: ctx.user.id,
              paidAt: input.paidAt ?? new Date(),
            })
            .returning({ id: payments.id });

          if (!payment?.id) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Payment could not be recorded.",
            });
          }

          const allocations = await allocatePayment(tx, {
            paymentId: payment.id,
            studentId: input.studentId,
            amountMinor,
            preferredFeeChargeId: input.feeChargeId ?? null,
          });

          await recordRevenue(tx, {
            source: "student_fee",
            sourceType: "payment",
            sourceId: payment.id,
            paymentId: payment.id,
            studentId: input.studentId,
            amountMinor,
            description: `Student payment ${reference}`,
            occurredAt: input.paidAt ?? new Date(),
            recordedByUserId: ctx.user.id,
          });

          await recordAudit(tx, ctx.actor, {
            action: "record_payment",
            entity: "payment",
            entityId: payment.id,
            entityLabel: reference,
            newValue: {
              amount: input.amount,
              method: input.paymentMethod,
              allocations: allocations.length,
            },
            summary: `${ctx.actor.name ?? "Staff"} recorded GHS ${input.amount.toFixed(2)} for ${student.fullName}`,
          });

          if (student.userId) {
            await notify(tx, {
              userIds: [student.userId],
              type: "payment_received",
              title: `Payment received: GHS ${input.amount.toFixed(2)}`,
              body: `Reference ${reference}. Your fee balance has been updated.`,
              entityType: "payment",
              entityId: payment.id,
              link: "/portal",
            });
          }

          const summary = await studentAccountSummary(tx, input.studentId);
          return { id: payment.id, reference, allocations: allocations.length, summary };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That transaction reference has already been recorded.",
          });
        }
        throw error;
      }
    }),

  /**
   * Refunds are counter-entries: the payment keeps its original amount and a
   * negative revenue line cancels it (§29). Old rows are never rewritten.
   */
  refundPayment: permissionProcedure("payments.write")
    .input(
      z.object({
        paymentId: z.number().int().positive(),
        amount: z.number().positive(),
        reason: z.string().min(2).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, input.paymentId))
          .limit(1);
        if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment was not found." });

        const refundMinor = toMinor(input.amount);
        assertRefundable(toMinor(payment.amount), toMinor(payment.refundedAmount), refundMinor);

        const nextRefunded = toMinor(payment.refundedAmount) + refundMinor;

        await tx
          .update(payments)
          .set({
            refundedAmount: toAmountString(nextRefunded),
            status: nextRefunded >= toMinor(payment.amount) ? "refunded" : payment.status,
          })
          .where(eq(payments.id, payment.id));

        const [ledgerRow] = await tx
          .select({ id: revenueTransactions.id })
          .from(revenueTransactions)
          .where(eq(revenueTransactions.paymentId, payment.id))
          .limit(1);

        if (ledgerRow) {
          await reverseRevenue(tx, {
            revenueTransactionId: ledgerRow.id,
            amountMinor: refundMinor,
            reason: `Refund: ${input.reason}`,
            recordedByUserId: ctx.user.id,
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "refund_payment",
          entity: "payment",
          entityId: payment.id,
          entityLabel: payment.reference,
          oldValue: { refundedAmount: money(payment.refundedAmount) },
          newValue: { refundedAmount: fromMinor(nextRefunded), reason: input.reason },
          summary: `${ctx.actor.name ?? "Staff"} refunded GHS ${input.amount.toFixed(2)} on ${payment.reference}`,
        });

        return { success: true, refundedAmount: fromMinor(nextRefunded) };
      });
    }),

  /* ---------------------------------------------------------------------- */
  /* Expenses (§27)                                                         */
  /* ---------------------------------------------------------------------- */

  expenseCategories: permissionProcedure("expenses.read").query(async () => {
    const db = await dbOrThrow();
    return db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.isActive, true))
      .orderBy(expenseCategories.name);
  }),

  expenses: permissionProcedure("expenses.read")
    .input(
      listInputSchema.extend({
        category: z.enum(EXPENSE_CATEGORIES).optional(),
        approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(expenses.deletedAt),
        input.category ? eq(expenses.category, input.category) : undefined,
        input.approvalStatus ? eq(expenses.approvalStatus, input.approvalStatus) : undefined,
        input.dateFrom ? gte(expenses.expenseDate, input.dateFrom) : undefined,
        input.dateTo ? lte(expenses.expenseDate, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(expenses.title, likePattern(input.search)),
              ilike(expenses.vendor, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], [sum]] = await Promise.all([
        db
          .select()
          .from(expenses)
          .where(where)
          .orderBy(desc(expenses.expenseDate), desc(expenses.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(expenses).where(where),
        db
          .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
          .from(expenses)
          .where(where),
      ]);

      return {
        ...paginate(
          rows.map(row => ({ ...row, amount: money(row.amount) })),
          Number(total?.total ?? 0),
          input,
        ),
        filteredTotal: money(sum?.total),
      };
    }),

  addExpense: permissionProcedure("expenses.write")
    .input(
      z.object({
        title: z.string().min(2).max(180),
        category: z.enum(EXPENSE_CATEGORIES),
        amount: z.number().positive(),
        expenseDate: z.coerce.date(),
        vendor: z.string().max(160).optional(),
        paymentMethod: z.enum(PAYMENT_METHODS),
        receiptKey: z.string().max(512).optional(),
        note: z.string().max(2000).optional(),
        /** Held for approval when the recorder cannot approve their own spend. */
        requiresApproval: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [category] = await db
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(eq(expenseCategories.key, input.category))
        .limit(1);

      const needsApproval = input.requiresApproval || !ctx.access.can("expenses.approve");

      const [expense] = await db
        .insert(expenses)
        .values({
          title: input.title,
          category: input.category,
          categoryId: category?.id,
          amount: toAmountString(toMinor(input.amount)),
          expenseDate: input.expenseDate,
          vendor: input.vendor,
          paymentMethod: input.paymentMethod,
          receiptKey: input.receiptKey,
          note: input.note,
          approvalStatus: needsApproval ? "pending" : "approved",
          approvedByUserId: needsApproval ? null : ctx.user.id,
          approvedAt: needsApproval ? null : new Date(),
          recordedByUserId: ctx.user.id,
        })
        .returning({ id: expenses.id });

      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "expense",
        entityId: expense?.id,
        entityLabel: input.title,
        newValue: { amount: input.amount, category: input.category },
        summary: `${ctx.actor.name ?? "Staff"} recorded a GHS ${input.amount.toFixed(2)} expense (${input.category})`,
      });

      if (needsApproval) {
        await notify(db, {
          userIds: await staffRecipients(db, ["admin"]),
          type: "new_expense",
          title: `Expense awaiting approval: ${input.title}`,
          body: `GHS ${input.amount.toFixed(2)} recorded by ${ctx.actor.name ?? "a staff member"}.`,
          entityType: "expense",
          entityId: expense?.id,
          link: "/finance/expenses",
        });
      }

      return { id: expense?.id, approvalStatus: needsApproval ? "pending" : "approved" };
    }),

  reviewExpense: permissionProcedure("expenses.approve")
    .input(
      z.object({
        expenseId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, input.expenseId))
        .limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Expense was not found." });

      await db
        .update(expenses)
        .set({
          approvalStatus: input.decision,
          approvedByUserId: ctx.user.id,
          approvedAt: new Date(),
          note: input.note ?? before.note,
        })
        .where(eq(expenses.id, input.expenseId));

      await recordAudit(db, ctx.actor, {
        action: `expense_${input.decision}`,
        entity: "expense",
        entityId: input.expenseId,
        entityLabel: before.title,
        oldValue: { approvalStatus: before.approvalStatus },
        newValue: { approvalStatus: input.decision },
      });

      return { success: true };
    }),

  /* ---------------------------------------------------------------------- */
  /* Revenue ledger (§28)                                                   */
  /* ---------------------------------------------------------------------- */

  revenue: permissionProcedure("finance.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.dateFrom ? gte(revenueTransactions.occurredAt, input.dateFrom) : undefined,
        input.dateTo ? lte(revenueTransactions.occurredAt, input.dateTo) : undefined,
        input.search ? ilike(revenueTransactions.description, likePattern(input.search)) : undefined,
      );

      const [rows, [total], [sum]] = await Promise.all([
        db
          .select()
          .from(revenueTransactions)
          .where(where)
          .orderBy(desc(revenueTransactions.occurredAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(revenueTransactions).where(where),
        db
          .select({ total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)` })
          .from(revenueTransactions)
          .where(where),
      ]);

      return {
        ...paginate(
          rows.map(row => ({ ...row, amount: money(row.amount) })),
          Number(total?.total ?? 0),
          input,
        ),
        filteredTotal: money(sum?.total),
      };
    }),
});
