import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { cartItems, carts, inventoryItems, inventoryMovements, orderItems, storeOrders } from "@blush/db/schema";
import { initializeFoundationData } from "@blush/db";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference, calculateOrderTotal, checkoutStockDeductions, money } from "../platform.utils";
import { publicProcedure, router } from "../trpc";

export const storeRouter = router({
  products: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    await initializeFoundationData(db);
    const rows = await db.select().from(inventoryItems).where(and(eq(inventoryItems.isSellable, true), eq(inventoryItems.isActive, true)));
    return rows.map(item => ({ ...item, unitCost: money(item.unitCost), sellingPrice: money(item.sellingPrice) }));
  }),
  lookupOrder: publicProcedure.input(z.object({ orderNumber: z.string().min(6).max(40), email: z.string().email() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const [order] = await db.select().from(storeOrders).where(and(
      eq(storeOrders.orderNumber, input.orderNumber),
      eq(storeOrders.customerEmail, input.email.toLowerCase()),
    )).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "No order matches that reference and email." });
    const items = await db.select({ itemName: orderItems.itemName, quantity: orderItems.quantity, lineTotal: orderItems.lineTotal }).from(orderItems).where(eq(orderItems.orderId, order.id));
    return { ...order, total: money(order.total), items: items.map(item => ({ ...item, lineTotal: money(item.lineTotal) })) };
  }),
  cart: publicProcedure.input(z.object({ sessionToken: z.string().min(16).max(96) })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const [cart] = await db.select().from(carts).where(and(eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
    if (!cart) return { cartId: null, items: [], subtotal: 0 };
    const rows = await db.select({
      cartItemId: cartItems.id,
      quantity: cartItems.quantity,
      productId: inventoryItems.id,
      name: inventoryItems.name,
      imageKey: inventoryItems.imageKey,
      sellingPrice: inventoryItems.sellingPrice,
      quantityOnHand: inventoryItems.quantityOnHand,
    }).from(cartItems).innerJoin(inventoryItems, eq(cartItems.inventoryItemId, inventoryItems.id)).where(eq(cartItems.cartId, cart.id));
    const items = rows.map(row => ({ ...row, sellingPrice: money(row.sellingPrice), lineTotal: money(row.sellingPrice) * row.quantity }));
    return { cartId: cart.id, items, subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0) };
  }),
  addItem: publicProcedure.input(z.object({ sessionToken: z.string().min(16).max(96), inventoryItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [product] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, input.inventoryItemId), eq(inventoryItems.isSellable, true), eq(inventoryItems.isActive, true))).limit(1);
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "This product is unavailable." });
    if (product.quantityOnHand < input.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient stock is available." });

    const [activeCart] = await db.select().from(carts).where(and(eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
    const cartId = activeCart?.id ?? (await db.insert(carts).values({ sessionToken: input.sessionToken, userId: ctx.user?.id }).returning({ id: carts.id }))[0]?.id;
    if (!cartId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cart could not be created." });
    const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.inventoryItemId, input.inventoryItemId))).limit(1);
    if (existing) {
      if (existing.quantity + input.quantity > product.quantityOnHand) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested quantity exceeds stock." });
      await db.update(cartItems).set({ quantity: existing.quantity + input.quantity }).where(eq(cartItems.id, existing.id));
    } else {
      await db.insert(cartItems).values({ cartId, inventoryItemId: input.inventoryItemId, quantity: input.quantity });
    }
    return { cartId };
  }),
  updateItem: publicProcedure.input(z.object({ sessionToken: z.string().min(16).max(96), cartItemId: z.number().int().positive(), quantity: z.number().int().min(0).max(20) })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [row] = await db.select({ cartItemId: cartItems.id, cartId: carts.id, productId: inventoryItems.id, quantityOnHand: inventoryItems.quantityOnHand })
      .from(cartItems).innerJoin(carts, eq(cartItems.cartId, carts.id)).innerJoin(inventoryItems, eq(cartItems.inventoryItemId, inventoryItems.id))
      .where(and(eq(cartItems.id, input.cartItemId), eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cart item was not found." });
    if (input.quantity > row.quantityOnHand) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested quantity exceeds stock." });
    if (input.quantity === 0) await db.delete(cartItems).where(eq(cartItems.id, row.cartItemId));
    else await db.update(cartItems).set({ quantity: input.quantity }).where(eq(cartItems.id, row.cartItemId));
    return { success: true };
  }),
  checkout: publicProcedure.input(z.object({
    sessionToken: z.string().min(16).max(96),
    customerName: z.string().min(2).max(160),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(7).max(40),
    deliveryAddress: z.string().max(1500).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [cart] = await db.select().from(carts).where(and(eq(carts.sessionToken, input.sessionToken), eq(carts.status, "active"))).limit(1);
    if (!cart) throw new TRPCError({ code: "BAD_REQUEST", message: "Your cart has expired." });

    return db.transaction(async tx => {
      const items = await tx.select({
        inventoryItemId: inventoryItems.id,
        itemName: inventoryItems.name,
        sellingPrice: inventoryItems.sellingPrice,
        quantityOnHand: inventoryItems.quantityOnHand,
        quantity: cartItems.quantity,
      }).from(cartItems).innerJoin(inventoryItems, eq(cartItems.inventoryItemId, inventoryItems.id)).where(eq(cartItems.cartId, cart.id));
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Your cart is empty." });
      try { checkoutStockDeductions(items.map(item => ({ inventoryItemId: item.inventoryItemId, quantityOnHand: item.quantityOnHand, quantity: item.quantity }))); }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "One or more cart items no longer has sufficient shared inventory." }); }

      const total = calculateOrderTotal(items);
      const orderNumber = buildReference("ORD");
      const [order] = await tx.insert(storeOrders).values({
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
      }).returning({ id: storeOrders.id });
      if (!order?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Order could not be created." });

      await tx.insert(orderItems).values(items.map(item => ({
        orderId: order.id,
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName,
        unitPrice: money(item.sellingPrice).toFixed(2),
        quantity: item.quantity,
        lineTotal: (money(item.sellingPrice) * item.quantity).toFixed(2),
      })));
      for (const item of items) {
        await tx.update(inventoryItems).set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${item.quantity}` }).where(eq(inventoryItems.id, item.inventoryItemId));
        await tx.insert(inventoryMovements).values({
          inventoryItemId: item.inventoryItemId,
          movementType: "retail_sale",
          quantityDelta: -item.quantity,
          referenceType: "store_order",
          referenceId: order.id,
          performedByUserId: ctx.user?.id,
          note: `Reserved for ${orderNumber}`,
        });
      }
      await tx.update(carts).set({ status: "converted" }).where(eq(carts.id, cart.id));
      return { orderNumber, total, paymentStatus: "pending" as const };
    });
  }),
});
