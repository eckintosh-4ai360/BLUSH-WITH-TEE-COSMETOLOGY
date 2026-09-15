import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  customers,
  inventoryItems,
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
import {
  COUNTER_HANDOVER,
  mergeLines,
  priceCounterOrder,
  startingStatus,
} from "../services/counterOrders";
import { refreshCustomerTotals } from "../services/customers";
import { ensureCustomer, resolvePerson } from "../services/people";
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

const HANDOVER_NOTE: Record<(typeof COUNTER_HANDOVER)[number], string> = {
  collected: "Recorded in the dashboard and handed over",
  pickup: "Recorded in the dashboard for collection",
  delivery: "Recorded in the dashboard for delivery",
};

export const ordersRouter = router({
  // Products that can go on a recorded order, with what is on the shelf.
  sellableItems: permissionProcedure("orders.write").query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select({
        id: inventoryItems.id,
        sku: inventoryItems.sku,
        name: inventoryItems.name,
        sellingPrice: inventoryItems.sellingPrice,
        quantityOnHand: inventoryItems.quantityOnHand,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.isSellable, true), eq(inventoryItems.isActive, true)))
      .orderBy(asc(inventoryItems.name));
    return rows.map(row => ({ ...row, sellingPrice: money(row.sellingPrice) }));
  }),

  // Records an order taken in person or by phone. Stock comes off the shelf straight away, and a
  // paid order books its payment and revenue in the same transaction.
  record: permissionProcedure("orders.write")
    .input(
      z
        .object({
          customerName: z.string().trim().max(160).optional(),
          customerPhone: z.string().trim().max(40).optional(),
          customerEmail: z.string().trim().email("Enter a valid email address.").max(320).optional().or(z.literal("")),
          items: z
            .array(
              z.object({
                inventoryItemId: z.number().int().positive(),
                quantity: z.number().int().min(1).max(10_000),
              }),
            )
            .min(1, "Add at least one product.")
            .max(100),
          discount: z.number().min(0).max(1_000_000).default(0),
          handover: z.enum(COUNTER_HANDOVER),
          deliveryAddress: z.string().trim().max(1500).optional(),
          deliveryFee: z.number().min(0).max(1_000_000).default(0),
          paid: z.boolean(),
          paymentMethod: z.enum(PAYMENT_METHODS).optional(),
          transactionReference: z.string().trim().max(120).optional(),
          notes: z.string().trim().max(2000).optional(),
        })
        .superRefine((input, ctx) => {
          if (input.handover === "delivery" && !input.deliveryAddress) {
            ctx.addIssue({ code: "custom", path: ["deliveryAddress"], message: "Add the delivery address." });
          }
          if (input.paid && !input.paymentMethod) {
            ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Choose how the customer paid." });
          }
        }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.paid) ctx.access.assert("payments.write");
      const db = await dbOrThrow();
      let stockWentLow = false;

      const recorded = await db.transaction(async tx => {
        const lines = mergeLines(input.items);
        const products = await tx
          .select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            sellingPrice: inventoryItems.sellingPrice,
            isSellable: inventoryItems.isSellable,
            isActive: inventoryItems.isActive,
          })
          .from(inventoryItems)
          .where(inArray(inventoryItems.id, lines.map(line => line.inventoryItemId)));
        const byId = new Map(products.map(product => [product.id, product]));

        // Prices come from the stock list, never from the browser.
        const priced = lines.map(line => {
          const product = byId.get(line.inventoryItemId);
          if (!product || !product.isActive || !product.isSellable) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: product
                ? `${product.name} is not for sale. Mark it as sold online on the stock list first.`
                : "One of the products is no longer on the stock list.",
            });
          }
          return { ...line, name: product.name, unitPriceMinor: toMinor(product.sellingPrice) };
        });

        let totals;
        try {
          totals = priceCounterOrder(priced, {
            discountMinor: toMinor(input.discount),
            deliveryFeeMinor: input.handover === "delivery" ? toMinor(input.deliveryFee) : 0,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "The order total could not be worked out.",
          });
        }

        const name = input.customerName || "Walk-in customer";
        const email = input.customerEmail?.toLowerCase() || null;
        const phone = input.customerPhone || null;
        const deliveryAddress = input.handover === "delivery" ? input.deliveryAddress || null : null;

        // A customer with contact details gets a record, so repeat buyers build up a history.
        let customerId: number | null = null;
        if (email || phone) {
          const personId = await resolvePerson(tx, {
            fullName: name,
            email,
            phone,
            address: deliveryAddress,
          });
          customerId = await ensureCustomer(tx, { personId });
        }

        const orderNumber = buildReference("ORD");
        const status = startingStatus(input.handover);

        const [order] = await tx
          .insert(storeOrders)
          .values({
            orderNumber,
            customerId,
            customerName: name,
            customerEmail: email ?? "",
            customerPhone: phone ?? "",
            deliveryAddress,
            subtotal: toAmountString(totals.subtotalMinor),
            discount: toAmountString(totals.discountMinor),
            deliveryFee: toAmountString(totals.deliveryFeeMinor),
            total: toAmountString(totals.totalMinor),
            paymentStatus: input.paid ? "paid" : "pending",
            fulfillmentStatus: status,
            stockDeductedAt: new Date(),
            notes: input.notes || null,
          })
          .returning({ id: storeOrders.id });
        if (!order) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The order could not be recorded." });
        }

        await tx.insert(orderItems).values(
          priced.map(line => ({
            orderId: order.id,
            inventoryItemId: line.inventoryItemId,
            itemName: line.name,
            unitPrice: toAmountString(line.unitPriceMinor),
            quantity: line.quantity,
            lineTotal: toAmountString(line.unitPriceMinor * line.quantity),
          })),
        );

        if (deliveryAddress) {
          await tx.insert(orderAddresses).values({
            orderId: order.id,
            addressType: "shipping",
            line1: deliveryAddress.slice(0, 255),
          });
        }

        await tx.insert(orderStatusEvents).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: status,
          note: HANDOVER_NOTE[input.handover],
          createdByUserId: ctx.user.id,
        });

        for (const line of priced) {
          const movement = await applyStockMovement(tx, {
            inventoryItemId: line.inventoryItemId,
            movementType: "retail_sale",
            quantityDelta: -line.quantity,
            referenceType: "store_order",
            referenceId: order.id,
            note: `Sold on ${orderNumber}`,
            performedByUserId: ctx.user.id,
          });
          if (movement.crossedReorderLevel) stockWentLow = true;
        }

        if (input.paid && totals.totalMinor > 0) {
          const [payment] = await tx
            .insert(payments)
            .values({
              reference: buildReference("SALE"),
              storeOrderId: order.id,
              amount: toAmountString(totals.totalMinor),
              paymentMethod: input.paymentMethod ?? "cash",
              status: "completed",
              transactionReference: input.transactionReference || null,
              receivedByUserId: ctx.user.id,
              recordedByUserId: ctx.user.id,
            })
            .returning({ id: payments.id });

          await recordRevenue(tx, {
            source: "product_sale",
            sourceType: "payment",
            sourceId: payment?.id,
            paymentId: payment?.id,
            storeOrderId: order.id,
            amountMinor: totals.totalMinor,
            description: `Store sale ${orderNumber}`,
            recordedByUserId: ctx.user.id,
          });
        }

        if (customerId) await refreshCustomerTotals(tx, customerId);

        await recordAudit(tx, ctx.actor, {
          action: "record_order",
          entity: "storeOrder",
          entityId: order.id,
          entityLabel: orderNumber,
          newValue: {
            total: toAmountString(totals.totalMinor),
            items: priced.map(line => ({ item: line.name, quantity: line.quantity })),
            handover: input.handover,
            paid: input.paid,
            paymentMethod: input.paid ? input.paymentMethod : null,
          },
          summary: `${ctx.actor.name ?? "Staff"} recorded order ${orderNumber} for ${name} (GHS ${toAmountString(totals.totalMinor)}, ${input.paid ? "paid" : "not paid yet"})`,
        });

        return { id: order.id, orderNumber };
      });

      if (stockWentLow) alertLowStockInBackground(db, ctx.actor);
      return recorded;
    }),

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

  // Everything the order page in shows, in one round trip.
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

  // Moves an order along its lifecycle.
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

  // Books an offline payment against an order.
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
      // Set inside the transaction, acted on after it: paying for an order is what takes its.
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

  // Refund with an optional restock, as a counter-entry rather than an edit.
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
