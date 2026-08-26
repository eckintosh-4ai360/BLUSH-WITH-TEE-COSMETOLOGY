import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  cartItems,
  carts,
  inventoryItems,
  orderItems,
  storeOrders,
} from "@blush/db/schema";
import { initializeFoundationData } from "@blush/db";
import { dbOrThrow } from "../dbOrThrow";
import {
  buildReference,
  calculateOrderTotal,
  money,
} from "../platform.utils";
import { applyStockMovement } from "../services/stock";
import { storageGet } from "@blush/storage";
import { publicProcedure, router, throttledPublicProcedure } from "../trpc";

/** Order number plus email is a guessable pair worth brute-forcing. */
const lookupLimit = throttledPublicProcedure({ bucket: "store.lookupOrder", limit: 30, windowMs: 10 * 60_000 });
const checkoutLimit = throttledPublicProcedure({ bucket: "store.checkout", limit: 15, windowMs: 60 * 60_000 });

const LOCAL_PRODUCT_IMAGES_BY_SKU = new Map<string, string>([
  ["BWT-SERUM-01", "/products/lumina-serum.jpg"],
  ["GC-SERUM-01", "/products/lumina-serum.jpg"],
  ["BWT-KIT-01", "/products/student-essentials-kit.jpg"],
  ["GC-KIT-01", "/products/student-essentials-kit.jpg"],
  ["BWT-SHMP-01", "/products/hydrating-shampoo-mask.jpg"],
  ["BWT-COND-01", "/products/hydrating-shampoo-mask.jpg"],
  ["BWT-GEL-01", "/products/builder-gel-kit.jpg"],
  ["BWT-POLISH-01", "/products/builder-gel-kit.jpg"],
  ["BWT-CLNS-01", "/products/facial-cleanser.jpg"],
  ["BWT-BRUSH-01", "/products/makeup-brush-set.jpg"],
]);

const LOCAL_PRODUCT_IMAGES_BY_NAME = new Map<string, string>([
  ["lumina renewal serum", "/products/lumina-serum.jpg"],
  ["student artistry essentials kit", "/products/student-essentials-kit.jpg"],
  ["glow student essentials kit", "/products/student-essentials-kit.jpg"],
  ["student essentials kit", "/products/student-essentials-kit.jpg"],
  [
    "hydrating botanical shampoo & mask duo",
    "/products/hydrating-shampoo-mask.jpg",
  ],
  ["hydrating shampoo 500ml", "/products/hydrating-shampoo-mask.jpg"],
  ["repair conditioner 500ml", "/products/hydrating-shampoo-mask.jpg"],
  ["sculpting builder gel & uv kit", "/products/builder-gel-kit.jpg"],
  ["builder gel kit", "/products/builder-gel-kit.jpg"],
  ["gel polish set (12)", "/products/builder-gel-kit.jpg"],
  ["gentle radiance facial cleanser", "/products/facial-cleanser.jpg"],
  ["gentle facial cleanser", "/products/facial-cleanser.jpg"],
  ["master precision makeup brush set", "/products/makeup-brush-set.jpg"],
  ["professional brush set", "/products/makeup-brush-set.jpg"],
]);

async function resolveImageUrl(
  imageKey: string | null | undefined,
  product?: { sku?: string | null; name?: string | null }
): Promise<string | null> {
  const fallback =
    (product?.sku ? LOCAL_PRODUCT_IMAGES_BY_SKU.get(product.sku) : undefined) ??
    (product?.name
      ? LOCAL_PRODUCT_IMAGES_BY_NAME.get(product.name.toLowerCase())
      : undefined) ??
    null;

  const key = imageKey ?? fallback;
  if (!key) return null;

  if (
    key.startsWith("/") ||
    key.startsWith("http://") ||
    key.startsWith("https://")
  ) {
    return key;
  }
  try {
    const result = await storageGet(key);
    return result.url;
  } catch {
    return fallback;
  }
}

export const storeRouter = router({
  products: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    await initializeFoundationData(db);
    const rows = await db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.isSellable, true),
          eq(inventoryItems.isActive, true)
        )
      );
    return Promise.all(
      rows.map(async item => ({
        ...item,
        unitCost: money(item.unitCost),
        sellingPrice: money(item.sellingPrice),
        imageUrl: await resolveImageUrl(item.imageKey, item),
      }))
    );
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
          imageUrl: await resolveImageUrl(row.imageKey, row),
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

      return db.transaction(async tx => {
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

        // Always take the rows in the same order, so two checkouts sharing a
        // product cannot each hold half of what the other is waiting for.
        items.sort((a, b) => a.inventoryItemId - b.inventoryItemId);

        const total = calculateOrderTotal(items);
        const orderNumber = buildReference("ORD");
        const [order] = await tx
          .insert(storeOrders)
          .values({
            orderNumber,
            userId: ctx.user?.id,
            customerName: input.customerName,
            customerEmail: input.customerEmail.toLowerCase(),
            customerPhone: input.customerPhone,
            deliveryAddress: input.deliveryAddress,
            subtotal: total.toFixed(2),
            total: total.toFixed(2),
            paymentStatus: "pending",
            fulfillmentStatus: "new",
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
        // Deducted through applyStockMovement rather than a bare UPDATE: it
        // locks the row FOR UPDATE before reading the balance, which is what
        // stops two checkouts both seeing the last unit and both selling it.
        // The stock read above is unlocked and only feeds pricing, so it is
        // not safe to decide availability from.
        for (const item of items) {
          await applyStockMovement(tx, {
            inventoryItemId: item.inventoryItemId,
            movementType: "retail_sale",
            quantityDelta: -item.quantity,
            referenceType: "store_order",
            referenceId: order.id,
            performedByUserId: ctx.user?.id,
            note: `Reserved for ${orderNumber}`,
          });
        }
        await tx
          .update(carts)
          .set({ status: "converted" })
          .where(eq(carts.id, cart.id));
        return { orderNumber, total, paymentStatus: "pending" as const };
      });
    }),
});
