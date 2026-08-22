import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  feeCharges,
  orderItems,
  paymentIntents,
  payments,
  storeOrders,
  studentProfiles,
} from "@blush/db/schema";
import type { Database } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { recordAudit, type AuditActor } from "./audit";
import { allocatePayment } from "./fees";
import { assertVerificationMatches, getGateway } from "./gateway";
import { toAmountString, toMinor } from "./money";
import { notify } from "./notify";
import { recordRevenue } from "./revenue";
import { applyStockMovement } from "./stock";

export type CaptureResult = {
  status: "captured" | "already_captured";
  paymentId: number;
  paymentReference: string;
  amount: number;
};

/**
 * Turns a verified gateway charge into money in the books.
 *
 * This is the only path that may mark a payment intent succeeded, and it is
 * the single place both the return-from-gateway call and the webhook go
 * through, so the two can never disagree.
 *
 * Idempotency comes from locking the intent row and re-reading its status
 * inside the transaction: a duplicate webhook, a double click, and a retry all
 * find the intent already succeeded and return the original payment rather
 * than booking a second one (§48).
 */
export async function captureVerifiedPayment(
  db: Database,
  input: {
    intentReference: string;
    providerReference?: string;
    actor?: AuditActor | null;
  },
): Promise<CaptureResult> {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.reference, input.intentReference))
    .limit(1);

  if (!intent) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That payment could not be found." });
  }

  // Short-circuit before calling the provider if this is already done.
  if (intent.status === "succeeded") {
    return existingCapture(db, intent.id);
  }

  const providerReference = input.providerReference ?? intent.providerReference;
  if (!providerReference) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This payment has no provider reference to verify.",
    });
  }

  // Server-to-server verification. Nothing below this line trusts the client.
  const verification = await getGateway().verify(providerReference);
  assertVerificationMatches(verification, {
    amountMinor: toMinor(intent.amount),
    currency: intent.currency,
  });

  return db.transaction(async tx => {
    // Lock the intent so two concurrent callbacks serialise here.
    const [locked] = await tx
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intent.id))
      .limit(1)
      .for("update");

    if (!locked) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That payment could not be found." });
    }

    if (locked.status === "succeeded") {
      return existingCapture(tx as unknown as Database, locked.id);
    }

    const amountMinor = toMinor(locked.amount);
    const paymentReference = buildReference(locked.purpose === "store_order" ? "SALE" : "PAY");

    const [payment] = await tx
      .insert(payments)
      .values({
        reference: paymentReference,
        studentId: locked.studentId,
        storeOrderId: locked.storeOrderId,
        paymentIntentId: locked.id,
        amount: toAmountString(amountMinor),
        paymentMethod: "online",
        status: "completed",
        transactionReference: verification.providerReference,
        recordedByUserId: locked.initiatedByUserId,
        paidAt: new Date(),
      })
      .returning({ id: payments.id });

    if (!payment?.id) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The payment could not be recorded.",
      });
    }

    await tx
      .update(paymentIntents)
      .set({
        status: "succeeded",
        providerReference: verification.providerReference,
        verifiedAt: new Date(),
      })
      .where(eq(paymentIntents.id, locked.id));

    if (locked.purpose === "store_order" && locked.storeOrderId) {
      await captureStoreOrder(tx, {
        orderId: locked.storeOrderId,
        amountMinor,
        paymentId: payment.id,
        userId: locked.initiatedByUserId,
      });
    } else if (locked.studentId) {
      await allocatePayment(tx, {
        paymentId: payment.id,
        studentId: locked.studentId,
        amountMinor,
      });

      await recordRevenue(tx, {
        source: locked.purpose === "application_fee" ? "application_fee" : "student_fee",
        sourceType: "payment",
        sourceId: payment.id,
        paymentId: payment.id,
        studentId: locked.studentId,
        amountMinor,
        description: `Online payment ${paymentReference}`,
        recordedByUserId: locked.initiatedByUserId,
      });

      const [student] = await tx
        .select({ userId: studentProfiles.userId, fullName: studentProfiles.fullName })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, locked.studentId))
        .limit(1);

      if (student?.userId) {
        await notify(tx, {
          userIds: [student.userId],
          type: "payment_received",
          title: `Payment received: GHS ${(amountMinor / 100).toFixed(2)}`,
          body: `Reference ${paymentReference}. Your fee balance has been updated.`,
          entityType: "payment",
          entityId: payment.id,
          link: "/portal",
        });
      }
    }

    await recordAudit(tx, input.actor ?? null, {
      action: "capture_online_payment",
      entity: "paymentIntent",
      entityId: locked.id,
      entityLabel: locked.reference,
      newValue: {
        paymentReference,
        amount: amountMinor / 100,
        provider: locked.provider,
        providerReference: verification.providerReference,
      },
      summary: `Online payment ${paymentReference} captured after provider verification`,
    });

    return {
      status: "captured" as const,
      paymentId: payment.id,
      paymentReference,
      amount: amountMinor / 100,
    };
  });
}

/** Order-side effects of a captured payment: revenue, stock, status. */
async function captureStoreOrder(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: { orderId: number; amountMinor: number; paymentId: number; userId: number | null },
): Promise<void> {
  const [order] = await tx
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.id, input.orderId))
    .limit(1);
  if (!order) return;

  await tx
    .update(storeOrders)
    .set({ paymentStatus: "paid" })
    .where(eq(storeOrders.id, order.id));

  await recordRevenue(tx, {
    source: "product_sale",
    sourceType: "payment",
    sourceId: input.paymentId,
    paymentId: input.paymentId,
    storeOrderId: order.id,
    amountMinor: input.amountMinor,
    description: `Store sale ${order.orderNumber}`,
    recordedByUserId: input.userId,
  });

  // Stock comes off once payment is confirmed, and only once.
  if (!order.stockDeductedAt) {
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const line of lines) {
      await applyStockMovement(tx, {
        inventoryItemId: line.inventoryItemId,
        movementType: "retail_sale",
        quantityDelta: -line.quantity,
        referenceType: "store_order",
        referenceId: order.id,
        note: `Paid online on ${order.orderNumber}`,
        performedByUserId: input.userId,
      });
    }
    await tx
      .update(storeOrders)
      .set({ stockDeductedAt: new Date() })
      .where(eq(storeOrders.id, order.id));
  }
}

async function existingCapture(db: Database, intentId: number): Promise<CaptureResult> {
  const [payment] = await db
    .select({ id: payments.id, reference: payments.reference, amount: payments.amount })
    .from(payments)
    .where(eq(payments.paymentIntentId, intentId))
    .limit(1);

  if (!payment) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "This payment is marked complete but no record was found. Contact support.",
    });
  }

  return {
    status: "already_captured",
    paymentId: payment.id,
    paymentReference: payment.reference,
    amount: toMinor(payment.amount) / 100,
  };
}

/** Outstanding balance for a student, used to bound what may be paid. */
export async function outstandingBalanceMinor(db: Database, studentId: number): Promise<number> {
  const rows = await db
    .select({ amountDue: feeCharges.amountDue, amountPaid: feeCharges.amountPaid })
    .from(feeCharges)
    .where(
      and(
        eq(feeCharges.studentId, studentId),
        // Waived charges are not owed.
        eq(feeCharges.status, "open"),
      ),
    );

  const partial = await db
    .select({ amountDue: feeCharges.amountDue, amountPaid: feeCharges.amountPaid })
    .from(feeCharges)
    .where(and(eq(feeCharges.studentId, studentId), eq(feeCharges.status, "partially_paid")));

  return [...rows, ...partial].reduce(
    (total, row) => total + Math.max(toMinor(row.amountDue) - toMinor(row.amountPaid), 0),
    0,
  );
}
