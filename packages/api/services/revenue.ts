import { eq } from "drizzle-orm";
import { revenueTransactions } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { toAmountString } from "./money";

export type RevenueSource =
  | "student_fee"
  | "application_fee"
  | "registration"
  | "product_sale"
  | "service"
  | "other";

export type RecordRevenueInput = {
  source: RevenueSource;
  /** The table that produced this revenue, e.g. "payment" or "store_order". */
  sourceType: string;
  sourceId?: number | null;
  paymentId?: number | null;
  studentId?: number | null;
  storeOrderId?: number | null;
  amountMinor: number;
  description: string;
  occurredAt?: Date;
  recordedByUserId?: number | null;
};

/**
 * Appends one line to the revenue ledger (§28).
 *
 * Income is never a typed-in total: every figure the dashboard reports is a sum
 * over these rows, and each row points back at the transaction that earned it.
 */
export async function recordRevenue(
  db: DbExecutor,
  input: RecordRevenueInput,
): Promise<number | undefined> {
  if (input.amountMinor === 0) return undefined;

  const [row] = await db
    .insert(revenueTransactions)
    .values({
      source: input.source,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      paymentId: input.paymentId ?? null,
      studentId: input.studentId ?? null,
      storeOrderId: input.storeOrderId ?? null,
      amount: toAmountString(input.amountMinor),
      description: input.description.slice(0, 255),
      occurredAt: input.occurredAt ?? new Date(),
      recordedByUserId: input.recordedByUserId ?? null,
    })
    .returning({ id: revenueTransactions.id });

  return row?.id;
}

/**
 * Books a refund as a negative counter-entry rather than editing the original
 * line (§29). History stays intact and the two rows net to the amount kept.
 */
export async function reverseRevenue(
  db: DbExecutor,
  input: {
    revenueTransactionId: number;
    amountMinor?: number;
    reason: string;
    recordedByUserId?: number | null;
  },
): Promise<number | undefined> {
  const [original] = await db
    .select()
    .from(revenueTransactions)
    .where(eq(revenueTransactions.id, input.revenueTransactionId))
    .limit(1);

  if (!original) return undefined;

  const originalMinor = Math.round(Number(original.amount) * 100);
  const reversalMinor = -Math.abs(input.amountMinor ?? originalMinor);

  const [row] = await db
    .insert(revenueTransactions)
    .values({
      source: original.source,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      paymentId: original.paymentId,
      studentId: original.studentId,
      storeOrderId: original.storeOrderId,
      amount: toAmountString(reversalMinor),
      description: input.reason.slice(0, 255),
      reversalOfId: original.id,
      occurredAt: new Date(),
      recordedByUserId: input.recordedByUserId ?? null,
    })
    .returning({ id: revenueTransactions.id });

  return row?.id;
}
