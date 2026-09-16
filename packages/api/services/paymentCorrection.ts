import { and, asc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { feeCharges, paymentAllocations, payments, revenueTransactions } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { allocateUnappliedPayments } from "./billing";
import { allocatePayment } from "./fees";
import { toAmountString, toMinor } from "./money";
import { recordRevenue, reverseRevenue } from "./revenue";

type ChargeStatus = "open" | "partially_paid" | "paid" | "waived";

// The status a charge should carry for what has been paid against it. A waived charge stays waived.
export function chargeStatusFor(
  dueMinor: number,
  paidMinor: number,
  current: ChargeStatus,
): ChargeStatus {
  if (current === "waived") return "waived";
  if (paidMinor <= 0) return "open";
  return paidMinor >= dueMinor ? "paid" : "partially_paid";
}

// Refuses a correction the books cannot take.
export function assertCorrectable(payment: {
  studentId: number | null;
  status: string;
  amountMinor: number;
  refundedMinor: number;
  newAmountMinor: number;
}) {
  if (!payment.studentId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only student fee payments can be corrected here.",
    });
  }
  if (payment.status !== "completed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A ${payment.status} payment cannot be corrected.`,
    });
  }
  if (payment.newAmountMinor <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be a positive number." });
  }
  if (payment.newAmountMinor < payment.refundedMinor) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The amount cannot be less than what has already been refunded on this payment.",
    });
  }
  if (payment.newAmountMinor === payment.amountMinor) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That is already the amount on file." });
  }
}

// Corrects the amount on a payment that was entered wrongly. Its allocations are taken off the
// charges and made again for the new amount, and the revenue ledger gets a counter-entry for the
// difference rather than having its original line rewritten. Run inside a transaction.
export async function correctPaymentAmount(
  db: DbExecutor,
  input: { paymentId: number; amountMinor: number; reason: string; recordedByUserId: number },
) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, input.paymentId))
    .limit(1)
    .for("update");
  if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment was not found." });

  const oldMinor = toMinor(payment.amount);
  const refundedMinor = toMinor(payment.refundedAmount);
  assertCorrectable({
    studentId: payment.studentId,
    status: payment.status,
    amountMinor: oldMinor,
    refundedMinor,
    newAmountMinor: input.amountMinor,
  });
  const studentId = payment.studentId!;

  // Take this payment's money back off the charges it was applied to.
  const allocations = await db
    .select({ feeChargeId: paymentAllocations.feeChargeId, amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, payment.id))
    .orderBy(asc(paymentAllocations.id));

  for (const allocation of allocations) {
    const [charge] = await db
      .select()
      .from(feeCharges)
      .where(eq(feeCharges.id, allocation.feeChargeId))
      .limit(1)
      .for("update");
    if (!charge) continue;

    const paidMinor = Math.max(toMinor(charge.amountPaid) - toMinor(allocation.amount), 0);
    await db
      .update(feeCharges)
      .set({
        amountPaid: toAmountString(paidMinor),
        status: chargeStatusFor(toMinor(charge.amountDue), paidMinor, charge.status),
      })
      .where(eq(feeCharges.id, charge.id));
  }
  await db.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));

  await db
    .update(payments)
    .set({ amount: toAmountString(input.amountMinor) })
    .where(eq(payments.id, payment.id));

  // Apply the corrected amount the way a new payment is applied, starting with the charge it was
  // first put towards.
  await allocatePayment(db, {
    paymentId: payment.id,
    studentId,
    amountMinor: input.amountMinor - refundedMinor,
    preferredFeeChargeId: payment.feeChargeId ?? allocations[0]?.feeChargeId ?? null,
  });
  // A smaller payment can reopen charges that another payment's spare money should now cover.
  await allocateUnappliedPayments(db, studentId);

  const [ledgerRow] = await db
    .select({ id: revenueTransactions.id })
    .from(revenueTransactions)
    .where(
      and(eq(revenueTransactions.paymentId, payment.id), isNull(revenueTransactions.reversalOfId)),
    )
    .orderBy(asc(revenueTransactions.id))
    .limit(1);

  const differenceMinor = input.amountMinor - oldMinor;
  const description = `Correction to ${payment.reference}: ${input.reason}`;
  if (ledgerRow && differenceMinor < 0) {
    await reverseRevenue(db, {
      revenueTransactionId: ledgerRow.id,
      amountMinor: -differenceMinor,
      reason: description,
      recordedByUserId: input.recordedByUserId,
    });
  } else {
    await recordRevenue(db, {
      source: "student_fee",
      sourceType: "payment",
      sourceId: payment.id,
      paymentId: payment.id,
      studentId,
      // With no ledger line to correct, the whole corrected amount is booked.
      amountMinor: ledgerRow ? differenceMinor : input.amountMinor,
      description,
      recordedByUserId: input.recordedByUserId,
    });
  }

  return { reference: payment.reference, studentId, oldMinor, newMinor: input.amountMinor };
}
