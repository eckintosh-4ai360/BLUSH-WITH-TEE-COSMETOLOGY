import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { inventoryItems, inventoryMovements } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { toAmountString } from "./money";

export type MovementType =
  | "received"
  | "retail_sale"
  | "classroom_use"
  | "adjustment"
  | "damaged"
  | "return";

export type StockMovementInput = {
  inventoryItemId: number;
  movementType: MovementType;
  /** Signed: positive adds stock, negative removes it. */
  quantityDelta: number;
  referenceType?: string | null;
  referenceId?: number | null;
  note?: string | null;
  unitCostMinor?: number | null;
  performedByUserId?: number | null;
  /**
   * Only an explicit, authorised adjustment may drive stock below zero (§64).
   * Sales and consumption never can.
   */
  allowNegative?: boolean;
};

/**
 * Applies a stock change and its ledger entry together.
 *
 * The row is locked FOR UPDATE before the balance is read, so two concurrent
 * checkouts cannot both see the last unit and both sell it. Callers must be
 * inside a transaction for that lock to mean anything.
 */
export async function applyStockMovement(
  db: DbExecutor,
  input: StockMovementInput,
): Promise<{ balanceAfter: number; movementId: number | undefined }> {
  if (!Number.isInteger(input.quantityDelta)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Stock quantities must be whole numbers." });
  }
  if (input.quantityDelta === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Stock movement cannot be zero." });
  }

  // FOR UPDATE holds the row until the surrounding transaction ends, so two
  // concurrent checkouts cannot both read the last unit and both sell it.
  const [current] = await db
    .select({
      id: inventoryItems.id,
      name: inventoryItems.name,
      quantityOnHand: inventoryItems.quantityOnHand,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, input.inventoryItemId))
    .limit(1)
    .for("update");

  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item was not found." });
  }

  const balanceAfter = current.quantityOnHand + input.quantityDelta;

  if (balanceAfter < 0 && !input.allowNegative) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Only ${current.quantityOnHand} of ${current.name} remain in stock.`,
    });
  }

  await db
    .update(inventoryItems)
    .set({ quantityOnHand: balanceAfter })
    .where(eq(inventoryItems.id, input.inventoryItemId));

  const [movement] = await db
    .insert(inventoryMovements)
    .values({
      inventoryItemId: input.inventoryItemId,
      movementType: input.movementType,
      quantityDelta: input.quantityDelta,
      balanceAfter,
      unitCost: input.unitCostMinor == null ? null : toAmountString(input.unitCostMinor),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      performedByUserId: input.performedByUserId ?? null,
    })
    .returning({ id: inventoryMovements.id });

  return { balanceAfter, movementId: movement?.id };
}

/**
 * Pure balance check, kept separate from the database so the rule can be unit
 * tested and reused by validation before a write is attempted.
 */
export function inventoryBalanceAfter(quantityOnHand: number, quantityDelta: number): number {
  if (!Number.isInteger(quantityOnHand) || !Number.isInteger(quantityDelta)) {
    throw new Error("Inventory quantities must be whole numbers.");
  }
  const nextBalance = quantityOnHand + quantityDelta;
  if (nextBalance < 0) throw new Error("This movement would take inventory below zero.");
  return nextBalance;
}

export function checkoutStockDeductions(
  items: Array<{ inventoryItemId: number; quantityOnHand: number; quantity: number }>,
) {
  return items.map(item => ({
    inventoryItemId: item.inventoryItemId,
    remaining: inventoryBalanceAfter(item.quantityOnHand, -item.quantity),
  }));
}

export function isLowStock(item: { quantityOnHand: number; reorderLevel: number }): boolean {
  return item.quantityOnHand <= item.reorderLevel;
}
