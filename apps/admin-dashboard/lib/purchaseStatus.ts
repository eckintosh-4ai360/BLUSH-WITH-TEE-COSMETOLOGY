/**
 * Purchase order states, shared by the list, the detail page and the supplier
 * history so one order never reads as two different things.
 */

export const PO_STATUSES = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;

export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Part received",
  received: "Received",
  cancelled: "Cancelled",
};

/** State tones, never reused as a chart series colour. */
export const PO_STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-800 dark:text-slate-300 hover:bg-slate-500/15",
  ordered: "bg-sky-500/15 text-sky-800 dark:text-sky-300 hover:bg-sky-500/15",
  partially_received:
    "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15",
  received:
    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15",
  cancelled: "bg-rose-500/15 text-rose-800 dark:text-rose-300 hover:bg-rose-500/15",
};

/** An order still has stock to take in until every line is fully received. */
export function canReceive(status: string): boolean {
  return status !== "cancelled" && status !== "received";
}
