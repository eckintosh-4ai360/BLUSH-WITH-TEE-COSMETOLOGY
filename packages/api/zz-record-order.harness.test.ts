// TEMPORARY: exercises orders.record against the throwaway in-memory harness. Deleted after use.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "@blush/db/schema";

const { Pool } = createRequire(new URL("../db/package.json", import.meta.url))("pg");
const pool = new Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:55438/postgres", max: 1 });
const harness = (globalThis as any).__harness ?? drizzle(pool, { schema });
(globalThis as any).__harness = harness;
vi.mock("@blush/db", async () => ({ ...(await import("@blush/db/schema")), getDb: async () => (globalThis as any).__harness }));

const { adminAppRouter } = await import("./adminRouter");

let admin: ReturnType<typeof adminAppRouter.createCaller>;
let serum = 0;
let kit = 0;
let hidden = 0;

const stock = async (id: number) =>
  (await harness.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)))[0].quantityOnHand;

beforeAll(async () => {
  const [owner] = await harness.insert(schema.users).values({ openId: "o", name: "Owner", email: "o@t.test", role: "admin" }).returning();
  admin = adminAppRouter.createCaller({ req: new Request("http://x"), user: owner, ipAddress: null, userAgent: null } as never);
  const [category] = await harness.insert(schema.productCategories).values({ slug: "care", name: "Care" }).returning();
  const rows = await harness.insert(schema.inventoryItems).values([
    { sku: "S1", slug: "serum", name: "Serum", category: "Care", categoryId: category.id, quantityOnHand: 10, reorderLevel: 2, unitCost: "20.00", sellingPrice: "45.50", isSellable: true },
    { sku: "K1", slug: "kit", name: "Kit", category: "Care", categoryId: category.id, quantityOnHand: 3, reorderLevel: 1, unitCost: "50.00", sellingPrice: "120.00", isSellable: true },
    { sku: "H1", slug: "hidden", name: "Hidden", category: "Care", categoryId: category.id, quantityOnHand: 5, reorderLevel: 1, unitCost: "5.00", sellingPrice: "9.00", isSellable: false },
  ]).returning();
  [serum, kit, hidden] = rows.map((row: { id: number }) => row.id);
});
afterAll(async () => { await pool.end(); });

describe("orders.record", () => {
  it("lists sellable items only", async () => {
    const items = await admin.orders.sellableItems();
    expect(items.map((item: { name: string }) => item.name)).toEqual(["Kit", "Serum"]);
    expect(items[1].sellingPrice).toBe(45.5);
  });

  it("records a paid walk-in sale handed over at the counter", async () => {
    const order = await admin.orders.record({
      items: [{ inventoryItemId: serum, quantity: 1 }, { inventoryItemId: kit, quantity: 1 }, { inventoryItemId: serum, quantity: 1 }],
      discount: 11,
      handover: "collected",
      paid: true,
      paymentMethod: "mobile_money",
      transactionReference: "MOMO-1",
      notes: "Paid at the front desk",
    });
    const detail = await admin.orders.detail({ orderId: order.id });
    expect(detail.customerName).toBe("Walk-in customer");
    expect(detail.customerId).toBeNull();
    expect(detail.items.map((item: { itemName: string; quantity: number }) => `${item.itemName}x${item.quantity}`)).toEqual(["Serumx2", "Kitx1"]);
    expect([detail.subtotal, detail.discount, detail.total]).toEqual([211, 11, 200]);
    expect(detail.paymentStatus).toBe("paid");
    expect(detail.fulfillmentStatus).toBe("delivered");
    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0].amount).toBe(200);
    expect(detail.timeline).toHaveLength(1);
    expect(await stock(serum)).toBe(8);
    expect(await stock(kit)).toBe(2);

    const revenue = await harness.select().from(schema.revenueTransactions).where(eq(schema.revenueTransactions.storeOrderId, order.id));
    expect(revenue).toHaveLength(1);
    expect(Number(revenue[0].amount)).toBe(200);
  });

  it("records an unpaid delivery for a known customer, and cancelling returns the stock", async () => {
    const order = await admin.orders.record({
      customerName: "Ama Mensah", customerPhone: "0241234567",
      items: [{ inventoryItemId: kit, quantity: 2 }],
      handover: "delivery", deliveryAddress: "12 Palm St, Tarkwa", deliveryFee: 15,
      paid: false,
    });
    const detail = await admin.orders.detail({ orderId: order.id });
    expect(detail.customer?.fullName).toBe("Ama Mensah");
    expect([detail.total, detail.deliveryFee, detail.paymentStatus, detail.fulfillmentStatus]).toEqual([255, 15, "pending", "confirmed"]);
    expect(detail.addresses).toHaveLength(1);
    expect(await stock(kit)).toBe(0);

    await admin.orders.updateStatus({ orderId: order.id, status: "cancelled" });
    expect(await stock(kit)).toBe(2);

    // Paying later still works and does not take stock twice for a live order.
    const second = await admin.orders.record({ customerPhone: "0241234567", items: [{ inventoryItemId: serum, quantity: 1 }], handover: "pickup", paid: false });
    await admin.orders.recordPayment({ orderId: second.id, amount: 45.5, paymentMethod: "cash" });
    expect(await stock(serum)).toBe(7);
  });

  it("refuses what it should", async () => {
    await expect(admin.orders.record({ items: [{ inventoryItemId: kit, quantity: 5 }], handover: "collected", paid: false })).rejects.toThrow(/Only 2 of Kit/);
    await expect(admin.orders.record({ items: [{ inventoryItemId: hidden, quantity: 1 }], handover: "collected", paid: false })).rejects.toThrow(/not for sale/);
    await expect(admin.orders.record({ items: [{ inventoryItemId: serum, quantity: 1 }], discount: 50, handover: "collected", paid: false })).rejects.toThrow(/discount/);
    await expect(admin.orders.record({ items: [{ inventoryItemId: serum, quantity: 1 }], handover: "delivery", paid: false })).rejects.toThrow(/delivery address/);
    await expect(admin.orders.record({ items: [{ inventoryItemId: serum, quantity: 1 }], handover: "collected", paid: true })).rejects.toThrow(/how the customer paid/);
    // Nothing left the shelf on a refused order.
    expect(await stock(serum)).toBe(7);
    expect(await stock(kit)).toBe(2);
  });
});
