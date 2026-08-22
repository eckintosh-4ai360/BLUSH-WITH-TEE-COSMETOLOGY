/**
 * Repairs derived values from the tables that are the source of truth.
 *
 * Everything in the running system writes these together inside a transaction,
 * so drift should not happen. It still can: an interrupted import, a restore
 * from backup, or data written before a rule existed. This routine makes the
 * derived columns agree with the ledgers again, and it is safe to run twice.
 *
 * Rules applied, in order:
 *   1. Every completed payment has a revenue line.
 *   2. feeCharges.amountPaid equals the allocations against it.
 *   3. The stock ledger explains quantity on hand for every item.
 *
 * Run with: pnpm db:reconcile
 */

import { eq, sql } from "drizzle-orm";
import type { getDb } from "./index";
import {
  feeCharges,
  inventoryItems,
  inventoryMovements,
  paymentAllocations,
  payments,
  revenueTransactions,
} from "./schema";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ReconcileReport = {
  revenueLinesCreated: number;
  chargesCorrected: number;
  stockMovementsCreated: number;
  details: string[];
};

export async function reconcileDerivedData(db: Database): Promise<ReconcileReport> {
  const details: string[] = [];

  /* --- 1. Revenue lines for completed payments -------------------------- */

  const orphanPayments = await db
    .select({
      id: payments.id,
      reference: payments.reference,
      amount: payments.amount,
      studentId: payments.studentId,
      storeOrderId: payments.storeOrderId,
      paidAt: payments.paidAt,
      recordedByUserId: payments.recordedByUserId,
    })
    .from(payments)
    .leftJoin(revenueTransactions, eq(revenueTransactions.paymentId, payments.id))
    .where(sql`${payments.status} = 'completed' and ${revenueTransactions.id} is null`);

  if (orphanPayments.length) {
    await db.insert(revenueTransactions).values(
      orphanPayments.map(payment => ({
        source: payment.storeOrderId ? ("product_sale" as const) : ("student_fee" as const),
        sourceType: "payment",
        sourceId: payment.id,
        paymentId: payment.id,
        studentId: payment.studentId,
        storeOrderId: payment.storeOrderId,
        amount: payment.amount,
        description: payment.storeOrderId
          ? `Store sale ${payment.reference} (reconciled)`
          : `Student payment ${payment.reference} (reconciled)`,
        occurredAt: payment.paidAt,
        recordedByUserId: payment.recordedByUserId,
      })),
    );
    details.push(
      `Created ${orphanPayments.length} revenue line(s) for payments that had none: ${orphanPayments
        .slice(0, 5)
        .map(payment => payment.reference)
        .join(", ")}`,
    );
  }

  /* --- 2. feeCharges.amountPaid from its allocations -------------------- */

  const drifted = await db
    .select({
      id: feeCharges.id,
      amountDue: feeCharges.amountDue,
      amountPaid: feeCharges.amountPaid,
      status: feeCharges.status,
      allocated: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)`,
    })
    .from(feeCharges)
    .leftJoin(paymentAllocations, eq(paymentAllocations.feeChargeId, feeCharges.id))
    .groupBy(feeCharges.id)
    .having(sql`coalesce(sum(${paymentAllocations.amount}), 0) <> ${feeCharges.amountPaid}`);

  let chargesCorrected = 0;
  for (const charge of drifted) {
    const dueMinor = Math.round(Number(charge.amountDue) * 100);
    // An over-allocation is capped at the amount billed rather than silently
    // creating a negative balance; the surplus is reported for a human to look at.
    const allocatedMinor = Math.round(Number(charge.allocated) * 100);
    const paidMinor = Math.min(allocatedMinor, dueMinor);

    await db
      .update(feeCharges)
      .set({
        amountPaid: (paidMinor / 100).toFixed(2),
        status:
          charge.status === "waived"
            ? "waived"
            : paidMinor >= dueMinor
              ? "paid"
              : paidMinor > 0
                ? "partially_paid"
                : "open",
      })
      .where(eq(feeCharges.id, charge.id));

    if (allocatedMinor > dueMinor) {
      details.push(
        `Charge ${charge.id}: allocations (${(allocatedMinor / 100).toFixed(2)}) exceed the amount billed (${charge.amountDue}); capped.`,
      );
    }
    chargesCorrected += 1;
  }

  if (chargesCorrected) {
    details.push(`Recomputed amountPaid on ${chargesCorrected} fee charge(s) from allocations.`);
  }

  /* --- 3. Stock ledger explains quantity on hand ------------------------ */

  const stockDrift = await db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      unitCost: inventoryItems.unitCost,
      onHand: inventoryItems.quantityOnHand,
      ledger: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}), 0)::int`,
    })
    .from(inventoryItems)
    .leftJoin(inventoryMovements, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
    .groupBy(inventoryItems.id)
    .having(sql`${inventoryItems.quantityOnHand} <> coalesce(sum(${inventoryMovements.quantityDelta}), 0)`);

  const reconcilingMovements = stockDrift.map(item => {
    const difference = item.onHand - Number(item.ledger);
    return {
      inventoryItemId: item.id,
      // An opening balance where the ledger has nothing to explain the stock;
      // an explicit adjustment where the two simply disagree.
      movementType: Number(item.ledger) === 0 ? ("received" as const) : ("adjustment" as const),
      quantityDelta: difference,
      balanceAfter: item.onHand,
      unitCost: item.unitCost,
      referenceType: "reconciliation",
      note:
        Number(item.ledger) === 0
          ? "Opening balance recorded during reconciliation"
          : `Reconciled: ledger showed ${item.ledger}, stock on hand was ${item.onHand}`,
    };
  });

  if (reconcilingMovements.length) {
    await db.insert(inventoryMovements).values(reconcilingMovements);
    for (const item of stockDrift) {
      details.push(
        `${item.sku}: ledger ${item.ledger} vs on hand ${item.onHand} - wrote a ${item.onHand - Number(item.ledger) > 0 ? "+" : ""}${item.onHand - Number(item.ledger)} movement.`,
      );
    }
  }

  return {
    revenueLinesCreated: orphanPayments.length,
    chargesCorrected,
    stockMovementsCreated: reconcilingMovements.length,
    details,
  };
}
