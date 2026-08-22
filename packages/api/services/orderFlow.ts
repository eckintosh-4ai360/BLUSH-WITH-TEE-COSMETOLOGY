import { TRPCError } from "@trpc/server";

export type FulfillmentStatus =
  | "new"
  | "confirmed"
  | "processing"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled";

/**
 * The order lifecycle from §51, written down so the rule lives in one place.
 *
 * The important guarantee is §64: an order cannot jump to delivered without
 * having been confirmed and processed first.
 */
const ALLOWED_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready", "shipped", "cancelled"],
  ready: ["shipped", "delivered", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: FulfillmentStatus, to: FulfillmentStatus): void {
  if (from === to) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `This order is already ${to}.` });
  }
  if (!canTransition(from, to)) {
    const next = ALLOWED_TRANSITIONS[from];
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: next?.length
        ? `An order that is ${from} can only move to: ${next.join(", ")}.`
        : `An order that is ${from} cannot change status.`,
    });
  }
}

/** Statuses a customer should be notified about, and what to tell them. */
export const CUSTOMER_NOTIFICATIONS: Partial<
  Record<FulfillmentStatus, { type: "order_confirmed" | "order_shipped" | "order_delivered"; title: string }>
> = {
  confirmed: { type: "order_confirmed", title: "Your order has been confirmed" },
  shipped: { type: "order_shipped", title: "Your order is on its way" },
  delivered: { type: "order_delivered", title: "Your order has been delivered" },
};

/** Whether reaching this status should return reserved stock to the shelf. */
export function releasesStock(to: FulfillmentStatus): boolean {
  return to === "cancelled";
}
