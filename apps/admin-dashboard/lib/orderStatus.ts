/**
 * Presentation for the order lifecycle. The rules themselves live in
 * `@blush/api` (services/orderFlow); this file only decides how each stage
 * looks and which button offers it.
 */

export type FulfillmentStatus =
  | "new"
  | "confirmed"
  | "processing"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Status tones: state, never reused as a chart series colour. */
export const FULFILLMENT_TONE: Record<string, string> = {
  new: "bg-muted text-muted-foreground hover:bg-muted",
  confirmed: "bg-sky-500/15 text-sky-800 dark:text-sky-300 hover:bg-sky-500/15",
  processing: "bg-violet-500/15 text-violet-800 dark:text-violet-300 hover:bg-violet-500/15",
  ready: "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15",
  shipped: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-500/15",
  delivered: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15",
  cancelled: "bg-rose-500/15 text-rose-800 dark:text-rose-300 hover:bg-rose-500/15",
};

/**
 * Mirrors the server-side state machine so the UI only offers moves that will
 * actually be accepted. The server re-checks every transition regardless.
 */
export const NEXT_STATUSES: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready", "shipped", "cancelled"],
  ready: ["shipped", "delivered", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const STATUS_ACTION_LABEL: Record<FulfillmentStatus, string> = {
  new: "Reopen",
  confirmed: "Confirm",
  processing: "Start processing",
  ready: "Mark ready",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
};
