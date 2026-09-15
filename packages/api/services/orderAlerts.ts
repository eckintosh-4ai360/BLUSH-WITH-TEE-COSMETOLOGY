import { eq } from "drizzle-orm";
import { storeOrders } from "@blush/db/schema";
import type { Database } from "../dbOrThrow";
import { money } from "./money";
import { notify, recipientsWithPermission } from "./notify";

async function loadOrder(db: Database, orderId: number) {
  const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, orderId)).limit(1);
  return order ?? null;
}

// Puts a new web order in front of the people who fulfil orders.
export async function alertStaffToOrder(db: Database, orderId: number): Promise<void> {
  const order = await loadOrder(db, orderId);
  if (!order) return;

  await notify(db, {
    userIds: await recipientsWithPermission(db, "orders.read"),
    type: "new_order",
    title: `New web order ${order.orderNumber}`,
    body: `${order.customerName} · GHS ${money(order.total).toFixed(2)} · awaiting payment`,
    entityType: "storeOrder",
    entityId: order.id,
    link: `/orders/${order.id}`,
    inAppOnly: true,
  });
}
