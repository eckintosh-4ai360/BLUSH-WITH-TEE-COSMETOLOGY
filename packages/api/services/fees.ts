import { and, asc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { feeAdjustments, feeCharges, paymentAllocations, payments } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { fromMinor, toAmountString, toMinor } from "./money";

export type StudentAccount = {
  totalFees: number;
  discounts: number;
  additionalCharges: number;
  amountPaid: number;
  outstanding: number;
};

/**
 * The student account equation from §24, computed from real rows:
 *
 *   Total Fees - Discounts + Additional Charges - Payments = Outstanding
 */
export async function studentAccountSummary(
  db: DbExecutor,
  studentId: number,
): Promise<StudentAccount> {
  const [chargeTotals, adjustmentRows, paidTotals] = await Promise.all([
    db
      .select({
        billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
        waived: sql<string>`coalesce(sum(case when ${feeCharges.status} = 'waived' then ${feeCharges.amountDue} else 0 end), 0)`,
      })
      .from(feeCharges)
      .where(eq(feeCharges.studentId, studentId)),
    db
      .select({
        adjustmentType: feeAdjustments.adjustmentType,
        total: sql<string>`coalesce(sum(${feeAdjustments.amount}), 0)`,
      })
      .from(feeAdjustments)
      .where(eq(feeAdjustments.studentId, studentId))
      .groupBy(feeAdjustments.adjustmentType),
    db
      .select({ total: sql<string>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)` })
      .from(payments)
      .where(and(eq(payments.studentId, studentId), eq(payments.status, "completed"))),
  ]);

  const billedMinor = toMinor(chargeTotals[0]?.billed);
  const waivedMinor = toMinor(chargeTotals[0]?.waived);
  const discountMinor =
    toMinor(adjustmentRows.find(row => row.adjustmentType === "discount")?.total) + waivedMinor;
  const surchargeMinor = toMinor(
    adjustmentRows.find(row => row.adjustmentType === "surcharge")?.total,
  );
  const paidMinor = toMinor(paidTotals[0]?.total);

  const outstandingMinor = billedMinor - discountMinor + surchargeMinor - paidMinor;

  return {
    totalFees: fromMinor(billedMinor),
    discounts: fromMinor(discountMinor),
    additionalCharges: fromMinor(surchargeMinor),
    amountPaid: fromMinor(paidMinor),
    // A credit balance is shown as zero owing rather than a negative debt.
    outstanding: fromMinor(Math.max(outstandingMinor, 0)),
  };
}

/**
 * Spreads a payment across the charges it settles, oldest due date first, and
 * moves each charge to its correct status. Allocation is the only thing that
 * may write `feeCharges.amountPaid`.
 *
 * Must run inside the same transaction as the payment insert.
 */
export async function allocatePayment(
  db: DbExecutor,
  input: {
    paymentId: number;
    studentId: number;
    amountMinor: number;
    /** Settle this charge first; the remainder cascades to the rest. */
    preferredFeeChargeId?: number | null;
  },
): Promise<Array<{ feeChargeId: number; amountMinor: number }>> {
  if (input.amountMinor <= 0) return [];

  const open = await db
    .select()
    .from(feeCharges)
    .where(
      and(
        eq(feeCharges.studentId, input.studentId),
        sql`${feeCharges.status} in ('open', 'partially_paid')`,
      ),
    )
    .orderBy(asc(feeCharges.dueDate), asc(feeCharges.id));

  const ordered = input.preferredFeeChargeId
    ? [
        ...open.filter(charge => charge.id === input.preferredFeeChargeId),
        ...open.filter(charge => charge.id !== input.preferredFeeChargeId),
      ]
    : open;

  let remaining = input.amountMinor;
  const applied: Array<{ feeChargeId: number; amountMinor: number }> = [];

  for (const charge of ordered) {
    if (remaining <= 0) break;

    const dueMinor = toMinor(charge.amountDue);
    const paidMinor = toMinor(charge.amountPaid);
    const owingMinor = dueMinor - paidMinor;
    if (owingMinor <= 0) continue;

    const applyMinor = Math.min(owingMinor, remaining);
    const nextPaidMinor = paidMinor + applyMinor;

    await db.insert(paymentAllocations).values({
      paymentId: input.paymentId,
      feeChargeId: charge.id,
      amount: toAmountString(applyMinor),
    });

    await db
      .update(feeCharges)
      .set({
        amountPaid: toAmountString(nextPaidMinor),
        status: nextPaidMinor >= dueMinor ? "paid" : "partially_paid",
      })
      .where(eq(feeCharges.id, charge.id));

    applied.push({ feeChargeId: charge.id, amountMinor: applyMinor });
    remaining -= applyMinor;
  }

  return applied;
}

/**
 * Bills the configured fees for an enrolment. Called once when an application
 * is approved, so a new student starts with a correct, itemised account.
 */
export async function raiseChargesFromStructure(
  db: DbExecutor,
  input: {
    studentId: number;
    enrollmentId?: number | null;
    structures: Array<{
      id: number;
      feeType: "tuition" | "registration" | "materials" | "exam" | "certification" | "other";
      label: string;
      amount: string;
      dueOffsetDays: number;
    }>;
    createdByUserId?: number | null;
    startDate?: Date;
  },
): Promise<number> {
  if (!input.structures.length) return 0;

  const base = input.startDate ?? new Date();

  await db.insert(feeCharges).values(
    input.structures.map(structure => ({
      studentId: input.studentId,
      enrollmentId: input.enrollmentId ?? null,
      feeStructureId: structure.id,
      feeType: structure.feeType,
      description: structure.label,
      amountDue: structure.amount,
      dueDate: addDays(base, structure.dueOffsetDays),
      createdByUserId: input.createdByUserId ?? null,
    })),
  );

  return input.structures.length;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Guards against a refund exceeding what was actually collected. */
export function assertRefundable(paidMinor: number, alreadyRefundedMinor: number, requestMinor: number) {
  if (requestMinor <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Refund amount must be positive." });
  }
  if (alreadyRefundedMinor + requestMinor > paidMinor) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Refund would exceed the amount originally paid.",
    });
  }
}
