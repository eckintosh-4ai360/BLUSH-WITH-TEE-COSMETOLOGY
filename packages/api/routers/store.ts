import { and, asc, count, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  cartItems,
  carts,
  inventoryItems,
  productCategories,
  orderAddresses,
  orderItems,
  paymentIntents,
  storeOrders,
} from "@blush/db/schema";
import { ENV } from "@blush/env";
import { dbOrThrow, type Database } from "../dbOrThrow";
import {
  buildReference,
  calculateOrderTotal,
  money,
} from "../platform.utils";
import { captureVerifiedPayment } from "../services/capture";
import {
  callbackUrlFor,
  confirmManualPayment,
  getGateway,
  onlinePaymentMode,
} from "../services/gateway";
import { alertLowStockInBackground } from "../services/lowStock";
import { toAmountString, toMinor } from "../services/money";
import { resolveProductImageUrl } from "../services/productImages";
import { bestEffort } from "../services/notify";
import { alertStaffToOrder, messageCustomerAboutOrder } from "../services/orderAlerts";
import { ensureCustomer, resolvePerson } from "../services/people";
import { applyStockMovement } from "../services/stock";
import { publicProcedure, router, throttledPublicProcedure } from "../trpc";

// Order number plus email is a guessable pair worth brute-forcing.
const lookupLimit = throttledPublicProcedure({ bucket: "store.lookupOrder", limit: 30, windowMs: 10 * 60_000 });
const checkoutLimit = throttledPublicProcedure({ bucket: "store.checkout", limit: 15, windowMs: 60 * 60_000 });
// Opening a charge talks to the provider, and confirming one asks it again.
const payLimit = throttledPublicProcedure({ bucket: "store.payOrder", limit: 20, windowMs: 60 * 60_000 });
const confirmLimit = throttledPublicProcedure({ bucket: "store.confirmPayment", limit: 30, windowMs: 10 * 60_000 });

// What the storefront sells: on the shelf, switched on, and marked as sold online.
const onSale = and(eq(inventoryItems.isSellable, true), eq(inventoryItems.isActive, true));

// Items carry a linked category and an older free-text one. The shop groups by whichever it has,
// so nothing is left out of the filters.
const categoryName = sql<string>`coalesce(${productCategories.name}, ${inventoryItems.category})`;

export const CATALOGUE_SORTS = ["featured", "price_asc", "price_desc", "newest", "name"] as const;

export const storeRouter = router({
  // The categories with something to sell in them, and how many.
  categories: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select({ name: categoryName, total: count() })
      .from(inventoryItems)
      .leftJoin(productCategories, eq(inventoryItems.categoryId, productCategories.id))
      .where(onSale)
      .groupBy(categoryName)
      .orderBy(categoryName);
    return rows.filter(row => row.name).map(row => ({ name: row.name, total: Number(row.total) }));
  }),

  // One page of the catalogue. The shop never loads the whole stock list: as the range grows, the
  // search, the category and the page are what narrow it, and they are all applied in the database.
  catalogue: publicProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(120).optional(),
          category: z.string().trim().max(120).optional(),
          inStockOnly: z.boolean().default(false),
          sort: z.enum(CATALOGUE_SORTS).default("featured"),
          page: z.number().int().min(1).max(500).default(1),
          pageSize: z.number().int().min(1).max(48).default(12),
        })
        .default({ inStockOnly: false, sort: "featured", page: 1, pageSize: 12 }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const term = input.search?.trim();

      const where = and(
        onSale,
        input.inStockOnly ? gt(inventoryItems.quantityOnHand, 0) : undefined,
        input.category ? sql`lower(${categoryName}) = ${input.category.toLowerCase()}` : undefined,
        term
          ? or(
              ilike(inventoryItems.name, `%${term}%`),
              ilike(inventoryItems.description, `%${term}%`),
              ilike(inventoryItems.sku, `%${term}%`),
              sql`${categoryName} ilike ${`%${term}%`}`,
            )
          : undefined,
      );

      // Featured keeps what can be bought today at the front; the rest are plain orderings.
      const order =
        input.sort === "price_asc"
          ? [asc(inventoryItems.sellingPrice), asc(inventoryItems.name)]
          : input.sort === "price_desc"
            ? [desc(inventoryItems.sellingPrice), asc(inventoryItems.name)]
            : input.sort === "newest"
              ? [desc(inventoryItems.createdAt), asc(inventoryItems.name)]
              : input.sort === "name"
                ? [asc(inventoryItems.name)]
                : [sql`case when ${inventoryItems.quantityOnHand} > 0 then 0 else 1 end`, asc(inventoryItems.name)];

      const [rows, [totals]] = await Promise.all([
        db
          .select({ item: inventoryItems, categoryName })
          .from(inventoryItems)
          .leftJoin(productCategories, eq(inventoryItems.categoryId, productCategories.id))
          .where(where)
          .orderBy(...order)
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db
          .select({ total: count() })
          .from(inventoryItems)
          .leftJoin(productCategories, eq(inventoryItems.categoryId, productCategories.id))
          .where(where),
      ]);

      const total = Number(totals?.total ?? 0);
      return {
        rows: await Promise.all(
          rows.map(async row => ({
            id: row.item.id,
            name: row.item.name,
            description: row.item.description,
            category: row.categoryName ?? row.item.category,
            sellingPrice: money(row.item.sellingPrice),
            quantityOnHand: row.item.quantityOnHand,
            imageUrl: await resolveProductImageUrl(row.item.imageKey, row.item),
          })),
        ),
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / input.pageSize), 1),
        hasMore: input.page * input.pageSize < total,
      };
    }),
  lookupOrder: lookupLimit
    .input(
      z.object({
        orderNumber: z.string().min(6).max(40),
        email: z.string().email(),
      })
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const [order] = await db
        .select()
        .from(storeOrders)
        .where(
          and(
            eq(storeOrders.orderNumber, input.orderNumber),
            eq(storeOrders.customerEmail, input.email.toLowerCase())
          )
        )
        .limit(1);
      if (!order)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No order matches that reference and email.",
        });
      const items = await db
        .select({
          itemName: orderItems.itemName,
          quantity: orderItems.quantity,
          lineTotal: orderItems.lineTotal,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      return {
        ...order,
        total: money(order.total),
        items: items.map(item => ({
          ...item,
          lineTotal: money(item.lineTotal),
        })),
      };
    }),
  cart: publicProcedure
    .input(z.object({ sessionToken: z.string().min(16).max(96) }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const [cart] = await db
        .select()
        .from(carts)
        .where(
          and(
            eq(carts.sessionToken, input.sessionToken),
            eq(carts.status, "active")
          )
        )
        .limit(1);
      if (!cart) return { cartId: null, items: [], subtotal: 0 };
      const rows = await db
        .select({
          cartItemId: cartItems.id,
          quantity: cartItems.quantity,
          productId: inventoryItems.id,
          sku: inventoryItems.sku,
          name: inventoryItems.name,
          imageKey: inventoryItems.imageKey,
          sellingPrice: inventoryItems.sellingPrice,
          quantityOnHand: inventoryItems.quantityOnHand,
        })
        .from(cartItems)
        .innerJoin(
          inventoryItems,
          eq(cartItems.inventoryItemId, inventoryItems.id)
        )
        .where(eq(cartItems.cartId, cart.id));
      const items = await Promise.all(
        rows.map(async row => ({
          ...row,
          sellingPrice: money(row.sellingPrice),
          lineTotal: money(row.sellingPrice) * row.quantity,
          imageUrl: await resolveProductImageUrl(row.imageKey, row),
        }))
      );
      return {
        cartId: cart.id,
        items,
        subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      };
    }),
  addItem: publicProcedure
    .input(
      z.object({
        sessionToken: z.string().min(16).max(96),
        inventoryItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [product] = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.id, input.inventoryItemId),
            eq(inventoryItems.isSellable, true),
            eq(inventoryItems.isActive, true)
          )
        )
        .limit(1);
      if (!product)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This product is unavailable.",
        });
      if (product.quantityOnHand < input.quantity)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Insufficient stock is available.",
        });

      const [activeCart] = await db
        .select()
        .from(carts)
        .where(
          and(
            eq(carts.sessionToken, input.sessionToken),
            eq(carts.status, "active")
          )
        )
        .limit(1);
      const cartId =
        activeCart?.id ??
        (
          await db
            .insert(carts)
            .values({ sessionToken: input.sessionToken, userId: ctx.user?.id })
            .returning({ id: carts.id })
        )[0]?.id;
      if (!cartId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Cart could not be created.",
        });
      const [existing] = await db
        .select()
        .from(cartItems)
        .where(
          and(
            eq(cartItems.cartId, cartId),
            eq(cartItems.inventoryItemId, input.inventoryItemId)
          )
        )
        .limit(1);
      if (existing) {
        if (existing.quantity + input.quantity > product.quantityOnHand)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Requested quantity exceeds stock.",
          });
        await db
          .update(cartItems)
          .set({ quantity: existing.quantity + input.quantity })
          .where(eq(cartItems.id, existing.id));
      } else {
        await db.insert(cartItems).values({
          cartId,
          inventoryItemId: input.inventoryItemId,
          quantity: input.quantity,
        });
      }
      return { cartId };
    }),
  updateItem: publicProcedure
    .input(
      z.object({
        sessionToken: z.string().min(16).max(96),
        cartItemId: z.number().int().positive(),
        quantity: z.number().int().min(0).max(20),
      })
    )
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const [row] = await db
        .select({
          cartItemId: cartItems.id,
          cartId: carts.id,
          productId: inventoryItems.id,
          quantityOnHand: inventoryItems.quantityOnHand,
        })
        .from(cartItems)
        .innerJoin(carts, eq(cartItems.cartId, carts.id))
        .innerJoin(
          inventoryItems,
          eq(cartItems.inventoryItemId, inventoryItems.id)
        )
        .where(
          and(
            eq(cartItems.id, input.cartItemId),
            eq(carts.sessionToken, input.sessionToken),
            eq(carts.status, "active")
          )
        )
        .limit(1);
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cart item was not found.",
        });
      if (input.quantity > row.quantityOnHand)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Requested quantity exceeds stock.",
        });
      if (input.quantity === 0)
        await db.delete(cartItems).where(eq(cartItems.id, row.cartItemId));
      else
        await db
          .update(cartItems)
          .set({ quantity: input.quantity })
          .where(eq(cartItems.id, row.cartItemId));
      return { success: true };
    }),
  checkout: checkoutLimit
    .input(
      z.object({
        sessionToken: z.string().min(16).max(96),
        customerName: z.string().min(2).max(160),
        customerEmail: z.string().email(),
        customerPhone: z.string().min(7).max(40),
        deliveryAddress: z.string().max(1500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [cart] = await db
        .select()
        .from(carts)
        .where(
          and(
            eq(carts.sessionToken, input.sessionToken),
            eq(carts.status, "active")
          )
        )
        .limit(1);
      if (!cart)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your cart has expired.",
        });

      // A customer's checkout is what empties the shelf, so it is also where the shop finds out.
      let stockWentLow = false;

      const placed = await db.transaction(async tx => {
        const items = await tx
          .select({
            inventoryItemId: inventoryItems.id,
            itemName: inventoryItems.name,
            sellingPrice: inventoryItems.sellingPrice,
            quantityOnHand: inventoryItems.quantityOnHand,
            quantity: cartItems.quantity,
          })
          .from(cartItems)
          .innerJoin(
            inventoryItems,
            eq(cartItems.inventoryItemId, inventoryItems.id)
          )
          .where(eq(cartItems.cartId, cart.id));
        if (!items.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Your cart is empty.",
          });

        // Always take the rows in the same order.
        items.sort((a, b) => a.inventoryItemId - b.inventoryItemId);

        const total = calculateOrderTotal(items);
        const orderNumber = buildReference("ORD");

        // The buyer becomes a customer record, so the order sits against a person in the back
        // office and their totals move when it is paid.
        const personId = await resolvePerson(tx, {
          fullName: input.customerName,
          email: input.customerEmail,
          phone: input.customerPhone,
          address: input.deliveryAddress?.trim() || null,
        });
        const customerId = await ensureCustomer(tx, {
          personId,
          userId: ctx.user?.id ?? null,
        });

        const [order] = await tx
          .insert(storeOrders)
          .values({
            orderNumber,
            customerId,
            userId: ctx.user?.id,
            customerName: input.customerName,
            customerEmail: input.customerEmail.toLowerCase(),
            customerPhone: input.customerPhone,
            deliveryAddress: input.deliveryAddress,
            subtotal: total.toFixed(2),
            total: total.toFixed(2),
            paymentStatus: "pending",
            fulfillmentStatus: "new",
            // The stock is taken below in this same transaction. Without the mark, recording
            // payment takes it a second time and cancelling never puts it back.
            stockDeductedAt: new Date(),
          })
          .returning({ id: storeOrders.id });
        if (!order?.id)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Order could not be created.",
          });

        await tx.insert(orderItems).values(
          items.map(item => ({
            orderId: order.id,
            inventoryItemId: item.inventoryItemId,
            itemName: item.itemName,
            unitPrice: money(item.sellingPrice).toFixed(2),
            quantity: item.quantity,
            lineTotal: (money(item.sellingPrice) * item.quantity).toFixed(2),
          }))
        );

        const deliveryAddress = input.deliveryAddress?.trim();
        if (deliveryAddress) {
          // The order keeps the full text; the address row is what the order page lists.
          await tx.insert(orderAddresses).values({
            orderId: order.id,
            addressType: "shipping",
            line1: deliveryAddress.slice(0, 255),
          });
        }

        // Deducted through applyStockMovement rather than a bare UPDATE.
        for (const item of items) {
          const movement = await applyStockMovement(tx, {
            inventoryItemId: item.inventoryItemId,
            movementType: "retail_sale",
            quantityDelta: -item.quantity,
            referenceType: "store_order",
            referenceId: order.id,
            performedByUserId: ctx.user?.id,
            note: `Reserved for ${orderNumber}`,
          });
          if (movement.crossedReorderLevel) stockWentLow = true;
        }
        await tx
          .update(carts)
          .set({ status: "converted" })
          .where(eq(carts.id, cart.id));
        return { orderId: order.id, orderNumber, total, paymentStatus: "pending" as const };
      });

      // Nothing is awaited.
      if (stockWentLow) alertLowStockInBackground(db);

      // After the commit, so a message can only ever describe an order that exists.
      await bestEffort("web order alert", () => alertStaffToOrder(db, placed.orderId));
      await bestEffort("order confirmation", () => messageCustomerAboutOrder(db, placed.orderId));

      return {
        orderNumber: placed.orderNumber,
        total: placed.total,
        paymentStatus: placed.paymentStatus,
      };
    }),

  // Whether this site can take a card or mobile-money payment online right now.
  paymentOptions: publicProcedure.query(() => ({ online: onlinePaymentMode() })),

  // Opens an online payment for a web order. The order number and the email it was placed with
  // stand in for a sign-in, exactly as they do for tracking it.
  payOrder: payLimit
    .input(
      z.object({
        orderNumber: z.string().trim().min(6).max(40),
        email: z.string().trim().email().max(320),
        // A retried click reuses the intent it opened instead of starting a second charge.
        idempotencyKey: z.string().min(8).max(96),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const [order] = await db
        .select()
        .from(storeOrders)
        .where(
          and(
            eq(storeOrders.orderNumber, input.orderNumber.toUpperCase()),
            eq(storeOrders.customerEmail, input.email.toLowerCase())
          )
        )
        .limit(1);
      if (!order)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No order matches that reference and email.",
        });
      if (order.paymentStatus === "paid")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This order has already been paid.",
        });
      if (order.paymentStatus !== "pending" || order.fulfillmentStatus === "cancelled")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This order can no longer be paid online. Please contact the school.",
        });

      const [existing] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        if (existing.storeOrderId !== order.id)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That payment belongs to another order.",
          });
        return {
          reference: existing.reference,
          checkoutUrl: null,
          provider: existing.provider,
          reused: true,
        };
      }

      const gateway = getGateway();
      const amountMinor = toMinor(order.total);
      const reference = buildReference("PI");

      const [intent] = await db
        .insert(paymentIntents)
        .values({
          reference,
          purpose: "store_order",
          storeOrderId: order.id,
          initiatedByUserId: ctx.user?.id ?? null,
          provider: gateway.name,
          idempotencyKey: input.idempotencyKey,
          amount: toAmountString(amountMinor),
          currency: "GHS",
          status: "initiated",
        })
        .returning({ id: paymentIntents.id });

      const opened = await gateway.initiate({
        reference,
        amountMinor,
        currency: "GHS",
        email: order.customerEmail,
        callbackUrl: callbackUrlFor(ctx.req, "/store/payment"),
      });

      await db
        .update(paymentIntents)
        .set({ providerReference: opened.providerReference, status: "pending" })
        .where(eq(paymentIntents.id, intent!.id));

      return {
        reference,
        checkoutUrl: opened.checkoutUrl,
        provider: gateway.name,
        reused: false,
      };
    }),

  // Where the payer lands back from the provider. The server asks the provider what happened
  // before anything is recorded, so calling this with a reference cannot mark an order paid.
  confirmPayment: confirmLimit
    .input(z.object({ reference: z.string().trim().min(6).max(64) }))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const intent = await storeIntent(db, input.reference);

      const result = await captureVerifiedPayment(db, {
        intentReference: intent.reference,
        actor: null,
      });

      const [order] = await db
        .select({ orderNumber: storeOrders.orderNumber })
        .from(storeOrders)
        .where(eq(storeOrders.id, intent.storeOrderId))
        .limit(1);

      return {
        status: result.status,
        paymentReference: result.paymentReference,
        amount: result.amount,
        orderNumber: order?.orderNumber ?? null,
      };
    }),

  // Development only: stands in for the provider confirming a store payment.
  simulatePayment: confirmLimit
    .input(z.object({ reference: z.string().trim().min(6).max(64) }))
    .mutation(async ({ input }) => {
      if (ENV.isProduction || onlinePaymentMode() !== "test") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Simulated payments are only available in test mode.",
        });
      }
      const db = await dbOrThrow();
      const intent = await storeIntent(db, input.reference);
      if (!intent.providerReference)
        throw new TRPCError({ code: "NOT_FOUND", message: "That payment could not be found." });

      confirmManualPayment(intent.providerReference, toMinor(intent.amount));
      return { success: true };
    }),
});

// A store-order payment intent by reference, or not found: student fee intents are not
// reachable from these public procedures.
async function storeIntent(db: Database, reference: string) {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.reference, reference))
    .limit(1);
  if (!intent || intent.purpose !== "store_order" || !intent.storeOrderId)
    throw new TRPCError({ code: "NOT_FOUND", message: "That payment could not be found." });
  return { ...intent, storeOrderId: intent.storeOrderId };
}
