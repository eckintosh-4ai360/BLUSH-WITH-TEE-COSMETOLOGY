import { and, count, eq, sql } from "drizzle-orm";
import { customers, storeOrders } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { toAmountString, toMinor } from "./money";

// Recomputes a customer's lifetime totals from their paid orders, rather than incrementing a
// counter that drifts the first time a refund or an out-of-order capture happens.
export async function refreshCustomerTotals(db: DbExecutor, customerId: number): Promise<void> {
  const [totals] = await db
    .select({
      orders: count(),
      spent: sql<string>`coalesce(sum(${storeOrders.total}), 0)`,
      // Mapped through the column: a raw aggregate comes back from the driver as text, and
      // writing text into a timestamp column throws.
      lastOrderAt: sql<Date | null>`max(${storeOrders.createdAt})`.mapWith(storeOrders.createdAt),
    })
    .from(storeOrders)
    .where(and(eq(storeOrders.customerId, customerId), eq(storeOrders.paymentStatus, "paid")));

  await db
    .update(customers)
    .set({
      totalOrders: Number(totals?.orders ?? 0),
      totalSpent: toAmountString(toMinor(totals?.spent)),
      lastOrderAt: totals?.lastOrderAt ?? null,
    })
    .where(eq(customers.id, customerId));
}
