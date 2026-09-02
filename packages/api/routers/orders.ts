import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  customers,
  orderAddresses,
  orderItems,
  orderStatusEvents,
  payments,
  people,
  revenueTransactions,
  storeOrders,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { recordAudit } from "../services/audit";
import { money, toAmountString, toMinor } from "../services/money";
import { notify } from "../services/notify";
import {
  CUSTOMER_NOTIFICATIONS,
  assertTransition,
  releasesStock,
  type FulfillmentStatus,
} from "../services/orderFlow";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { recordRevenue, reverseRevenue } from "../services/revenue";
import { alertLowStockInBackground } from "../services/lowStock";
import { applyStockMovement } from "../services/stock";
import { permissionProcedure, router } from "../trpc";

const FULFILLMENT = [
  "new",
  "confirmed",
  "processing",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const PAYMENT_METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;

export const ordersRouter = router({
  list: permissionProcedure("orders.read")
    .input(
      listInputSchema.extend({
        fulfillmentStatus: z.enum(FULFILLMENT).optional(),
        paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.fulfillmentStatus
          ? eq(storeOrders.fulfillmentStatus, input.fulfillmentStatus)
          : undefined,
        input.paymentStatus ? eq(storeOrders.paymentStatus, input.paymentStatus) : undefined,
        input.dateFrom ? gte(storeOrders.createdAt, input.dateFrom) : undefined,
        input.dateTo ? lte(storeOrders.createdAt, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(storeOrders.orderNumber, likePattern(input.search)),
              ilike(storeOrders.customerName, likePattern(input.search)),
              ilike(storeOrders.customerEmail, likePattern(input.search)),
              ilike(storeOrders.customerPhone, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], [sum]] = await Promise.all([
        db
          .select()
          .from(storeOrders)
          .where(where)
          .orderBy(desc(storeOrders.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(storeOrders).where(where),
        db
          .select({ total: sql<string>`coalesce(sum(${storeOrders.total}), 0)` })
          .from(storeOrders)
          .where(where),
      ]);

      return {
        ...paginate(
          rows.map(row => ({
            ...row,
            subtotal: money(row.subtotal),
            discount: money(row.discount),
            deliveryFee: money(row.deliveryFee),
            total: money(row.total),
          })),
          Number(total?.total ?? 0),
          input,
        ),
        filteredTotal: money(sum?.total),
      };
    }),

  /** Everything the order page in §51 shows, in one round trip. */
  detail: permissionProcedure("orders.read")
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [order] = await db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.id, input.orderId))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order was not found." });

      const [items, addresses, timeline, orderPayments, customer] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
        db.select().from(orderAddresses).where(eq(orderAddresses.orderId, order.id)),
        db
          .select({ event: orderStatusEvents, actor: users.name })
          .from(orderStatusEvents)
          .leftJoin(users, eq(orderStatusEvents.createdByUserId, users.id))
          .where(eq(orderStatusEvents.orderId, order.id))
          .orderBy(orderStatusEvents.createdAt),
        db.select().from(payments).where(eq(payments.storeOrderId, order.id)),
        order.customerId
          ? db
              .select({
                id: customers.id,
                fullName: people.fullName,
                email: people.email,
                phone: people.phone,
                totalOrders: customers.totalOrders,
                totalSpent: customers.totalSpent,
              })
              .from(customers)
              .innerJoin(people, eq(customers.personId, people.id))
              .where(eq(customers.id, order.customerId))
              .limit(1)
          : Promise.resolve([]),
      ]);

      return {
        ...order,
        subtotal: money(order.subtotal),
        discount: money(order.discount),
        deliveryFee: money(order.deliveryFee),
        total: money(order.total),
        items: items.map(item => ({
          ...item,
          unitPrice: money(item.unitPrice),
          lineTotal: money(item.lineTotal),
        })),
        addresses,
        timeline: timeline.map(row => ({ ...row.event, actor: row.actor })),
        payments: orderPayments.map(payment => ({
          ...payment,
          amount: money(payment.amount),
          refundedAmount: money(payment.refundedAmount),
        })),
        customer: customer[0]
          ? { ...customer[0], totalSpent: money(customer[0].totalSpent) }
          : null,
      };
    }),

  /**
   * Moves an order along its lifecycle. The transition is validated against
   * the state machine, the timeline gets an entry, and cancelling returns any
   * stock that was reserved (§50, §51, §64).
   */
  updateStatus: permissionProcedure("orders.write")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        status: z.enum(FULFILLMENT),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [order] = await tx
          .select()
          .from(storeOrders)
          .where(eq(storeOrders.id, input.orderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order was not found." });

        const from = order.fulfillmentStatus as FulfillmentStatus;
        assertTransition(from, input.status);

        await tx
          .update(storeOrders)
          .set({ fulfillmentStatus: input.status })
          .where(eq(storeOrders.id, order.id));

        await tx.insert(orderStatusEvents).values({
          orderId: order.id,
          fromStatus: from,
          toStatus: input.status,
          note: input.note,
          createdByUserId: ctx.user.id,
        });

        // Cancelling puts reserved units back on the shelf, once.
        if (releasesStock(input.status) && order.stockDeductedAt) {
          const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          for (const line of lines) {
            const returnable = line.quantity - line.quantityReturned;
            if (returnable <= 0) continue;
            await applyStockMovement(tx, {
              inventoryItemId: line.inventoryItemId,
              movementType: "return",
              quantityDelta: returnable,
              referenceType: "store_order",
              referenceId: order.id,
              note: `Cancelled ${order.orderNumber}`,
              performedByUserId: ctx.user.id,
            });
            await tx
              .update(orderItems)
              .set({ quantityReturned: line.quantity })
              .where(eq(orderItems.id, line.id));
          }
          await tx
            .update(storeOrders)
            .set({ stockDeductedAt: null })
            .where(eq(storeOrders.id, order.id));
        }

        await recordAudit(tx, ctx.actor, {
          action: "order_status",
          entity: "storeOrder",
          entityId: order.id,
          entityLabel: order.orderNumber,
          oldValue: { fulfillmentStatus: from },
          newValue: { fulfillmentStatus: input.status },
          summary: `${ctx.actor.name ?? "Staff"} moved ${order.orderNumber} from ${from} to ${input.status}`,
        });

        const message = CUSTOMER_NOTIFICATIONS[input.status];
        if (message && order.userId) {
          await notify(tx, {
            userIds: [order.userId],
            type: message.type,
            title: message.title,
            body: `Order ${order.orderNumber}.`,
            entityType: "storeOrder",
            entityId: order.id,
            link: "/store",
          });
        }

        return { success: true, status: input.status };
      });
    }),

  /**
   * Books an offline payment against an order.
   *
   * Confirming payment is what deducts stock, and `stockDeductedAt` makes that
   * idempotent - a second confirmation cannot take the units twice (§50).
   */
  recordPayment: permissionProcedure("orders.write", "payments.write")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        amount: z.number().positive(),
        paymentMethod: z.enum(PAYMENT_METHODS),
        transactionReference: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const amountMinor = toMinor(input.amount);
      // Set inside the transaction, acted on after it: paying for an order is
      // what takes its stock off the shelf, and that is where an item can hit
      // its reorder level.
      let stockWentLow = false;

      const settled = await db.transaction(async tx => {
        const [order] = await tx
          .select()
          .from(storeOrders)
          .where(eq(storeOrders.id, input.orderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order was not found." });
        if (order.paymentStatus === "paid") {
          throw new TRPCError({ code: "CONFLICT", message: "This order is already paid." });
        }

        const reference = buildReference("SALE");

        const [payment] = await tx
          .insert(payments)
          .values({
            reference,
            storeOrderId: order.id,
            amount: toAmountString(amountMinor),
            paymentMethod: input.paymentMethod,
            status: "completed",
            transactionReference: input.transactionReference || null,
            receivedByUserId: ctx.user.id,
            recordedByUserId: ctx.user.id,
          })
          .returning({ id: payments.id });

        await tx
          .update(storeOrders)
          .set({ paymentStatus: "paid" })
          .where(eq(storeOrders.id, order.id));

        await recordRevenue(tx, {
          source: "product_sale",
          sourceType: "payment",
          sourceId: payment?.id,
          paymentId: payment?.id,
          storeOrderId: order.id,
          amountMinor,
          description: `Store sale ${order.orderNumber}`,
          recordedByUserId: ctx.user.id,
        });

        if (!order.stockDeductedAt) {
          const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          for (const line of lines) {
            const movement = await applyStockMovement(tx, {
              inventoryItemId: line.inventoryItemId,
              movementType: "retail_sale",
              quantityDelta: -line.quantity,
              referenceType: "store_order",
              referenceId: order.id,
              note: `Sold on ${order.orderNumber}`,
              performedByUserId: ctx.user.id,
            });
            if (movement.crossedReorderLevel) stockWentLow = true;
          }
          await tx
            .update(storeOrders)
            .set({ stockDeductedAt: new Date() })
            .where(eq(storeOrders.id, order.id));
        }

        if (order.customerId) await refreshCustomerTotals(tx, order.customerId);

        await recordAudit(tx, ctx.actor, {
          action: "record_order_payment",
          entity: "storeOrder",
          entityId: order.id,
          entityLabel: order.orderNumber,
          newValue: { amount: input.amount, method: input.paymentMethod },
          summary: `${ctx.actor.name ?? "Staff"} recorded GHS ${input.amount.toFixed(2)} against ${order.orderNumber}`,
        });

        return { id: payment?.id, reference };
      });

      if (stockWentLow) alertLowStockInBackground(db, ctx.actor);

      return settled;
    }),

  /** Refund with an optional restock, as a counter-entry rather than an edit. */
  refund: permissionProcedure("orders.write", "payments.write")
    .input(
      z.object({
        orderId: z.number().int().positive(),
        amount: z.number().positive(),
        reason: z.string().min(2).max(255),
        restock: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const refundMinor = toMinor(input.amount);

      return db.transaction(async tx => {
        const [order] = await tx
          .select()
          .from(storeOrders)
          .where(eq(storeOrders.id, input.orderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order was not found." });
        if (order.paymentStatus !== "paid") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only a paid order can be refunded.",
          });
        }

        const [payment] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.storeOrderId, order.id), eq(payments.status, "completed")))
          .limit(1);
        if (!payment) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No captured payment to refund." });
        }

        const alreadyRefunded = toMinor(payment.refundedAmount);
        if (alreadyRefunded + refundMinor > toMinor(payment.amount)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Refund would exceed the amount paid on this order.",
          });
        }

        const nextRefunded = alreadyRefunded + refundMinor;
        const fullyRefunded = nextRefunded >= toMinor(payment.amount);

        await tx
          .update(payments)
          .set({
            refundedAmount: toAmountString(nextRefunded),
            status: fullyRefunded ? "refunded" : payment.status,
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
            reason: `Refund on ${order.orderNumber}: ${input.reason}`,
            recordedByUserId: ctx.user.id,
          });
        }

        if (fullyRefunded) {
          await tx
            .update(storeOrders)
            .set({ paymentStatus: "refunded" })
            .where(eq(storeOrders.id, order.id));
        }

        if (input.restock && order.stockDeductedAt) {
          const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          for (const line of lines) {
            const returnable = line.quantity - line.quantityReturned;
            if (returnable <= 0) continue;
            await applyStockMovement(tx, {
              inventoryItemId: line.inventoryItemId,
              movementType: "return",
              quantityDelta: returnable,
              referenceType: "store_order",
              referenceId: order.id,
              note: `Refund on ${order.orderNumber}`,
              performedByUserId: ctx.user.id,
            });
            await tx
              .update(orderItems)
              .set({ quantityReturned: line.quantity })
              .where(eq(orderItems.id, line.id));
          }
        }

        if (order.customerId) await refreshCustomerTotals(tx, order.customerId);

        await recordAudit(tx, ctx.actor, {
          action: "refund_order",
          entity: "storeOrder",
          entityId: order.id,
          entityLabel: order.orderNumber,
          oldValue: { refundedAmount: money(payment.refundedAmount) },
          newValue: { refundedAmount: nextRefunded / 100, reason: input.reason },
          summary: `${ctx.actor.name ?? "Staff"} refunded GHS ${input.amount.toFixed(2)} on ${order.orderNumber}`,
        });

        return { success: true, fullyRefunded };
      });
    }),
});

/**
 * Recomputes a customer lifetime totals from their paid orders. Derived rather
 * than incremented, so a refund or correction cannot leave the rollup drifting.
 */
async function refreshCustomerTotals(
  tx: Parameters<Parameters<Awaited<ReturnType<typeof dbOrThrow>>["transaction"]>[0]>[0],
  customerId: number,
): Promise<void> {
  const [totals] = await tx
    .select({
      orders: count(),
      spent: sql<string>`coalesce(sum(${storeOrders.total}), 0)`,
      lastOrderAt: sql<Date | null>`max(${storeOrders.createdAt})`,
    })
    .from(storeOrders)
    .where(and(eq(storeOrders.customerId, customerId), eq(storeOrders.paymentStatus, "paid")));

  await tx
    .update(customers)
    .set({
      totalOrders: Number(totals?.orders ?? 0),
      totalSpent: toAmountString(toMinor(totals?.spent)),
      lastOrderAt: totals?.lastOrderAt ?? null,
    })
    .where(eq(customers.id, customerId));
}
