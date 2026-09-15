// Orders staff record in the dashboard: a sale at the counter, a phone order, or one taken in
// person for later collection or delivery.

export const COUNTER_HANDOVER = ["collected", "pickup", "delivery"] as const;
export type CounterHandover = (typeof COUNTER_HANDOVER)[number];

// Where a recorded order starts. Goods handed over on the spot are already delivered; the rest
// wait at "confirmed" for the usual processing, ready and delivered steps.
export function startingStatus(handover: CounterHandover): "delivered" | "confirmed" {
  return handover === "collected" ? "delivered" : "confirmed";
}

// The same item picked twice is one line with the quantities added, so stock is taken once.
export function mergeLines<T extends { inventoryItemId: number; quantity: number }>(lines: T[]): T[] {
  const merged = new Map<number, T>();
  for (const line of lines) {
    const existing = merged.get(line.inventoryItemId);
    merged.set(
      line.inventoryItemId,
      existing ? { ...existing, quantity: existing.quantity + line.quantity } : { ...line },
    );
  }
  // Always in item order, so rows are locked in the same order as checkout locks them.
  return [...merged.values()].sort((a, b) => a.inventoryItemId - b.inventoryItemId);
}

export type PricedOrder = {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
};

// Totals in minor units (pesewas), so no line is rounded twice.
export function priceCounterOrder(
  lines: Array<{ quantity: number; unitPriceMinor: number }>,
  charges: { discountMinor: number; deliveryFeeMinor: number },
): PricedOrder {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  if (charges.discountMinor < 0 || charges.deliveryFeeMinor < 0) {
    throw new Error("Discounts and delivery fees cannot be negative.");
  }
  if (charges.discountMinor > subtotalMinor) {
    throw new Error("The discount cannot be more than the items cost.");
  }
  return {
    subtotalMinor,
    discountMinor: charges.discountMinor,
    deliveryFeeMinor: charges.deliveryFeeMinor,
    totalMinor: subtotalMinor - charges.discountMinor + charges.deliveryFeeMinor,
  };
}
