import { eq } from "drizzle-orm";
import { storeOrders } from "@blush/db/schema";
import type { Database } from "../dbOrThrow";
import { onlinePaymentMode } from "./gateway";
import { announce } from "./messaging/announce";
import { flushInBackground } from "./messaging/dispatch";
import { money } from "./money";
import { notify, recipientsWithPermission } from "./notify";
import { readSchoolProfile } from "./schoolProfile";

// How a customer pays for a web order, as the order message and the store page both say it.
export function paymentInstructions(input: { online: boolean; phone: string | null }): string {
  const atSchool = "pay at the school by cash or mobile money, quoting your order number";
  const help = input.phone ? ` For help, call ${input.phone}.` : "";
  return input.online
    ? `You can pay online from our store page with your order number and email, or ${atSchool}.${help}`
    : `Please ${atSchool}.${help}`;
}

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

// Confirms the order to the customer, with the number to quote and how to pay.
export async function messageCustomerAboutOrder(db: Database, orderId: number): Promise<void> {
  const order = await loadOrder(db, orderId);
  if (!order) return;

  const profile = await readSchoolProfile(db);
  const amount = `GHS ${money(order.total).toFixed(2)}`;
  const payment = paymentInstructions({
    online: onlinePaymentMode() !== "off",
    phone: profile.phone,
  });

  await announce(db, {
    type: "order_placed",
    recipient: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
      userId: order.userId,
    },
    title: `Order ${order.orderNumber} received`,
    body: `${amount}. ${payment}`,
    facts: { reference: order.orderNumber, amount, payment },
    entityType: "storeOrder",
    entityId: order.id,
    link: "/store",
  });
  flushInBackground(db);
}
