import { describe, expect, it } from "vitest";
import { mergeLines, priceCounterOrder, startingStatus } from "./counterOrders";

describe("mergeLines", () => {
  it("adds up the same item picked twice and sorts by item", () => {
    expect(
      mergeLines([
        { inventoryItemId: 9, quantity: 1 },
        { inventoryItemId: 3, quantity: 2 },
        { inventoryItemId: 9, quantity: 4 },
      ]),
    ).toEqual([
      { inventoryItemId: 3, quantity: 2 },
      { inventoryItemId: 9, quantity: 5 },
    ]);
  });
});

describe("priceCounterOrder", () => {
  const lines = [
    { quantity: 2, unitPriceMinor: 4_550 },
    { quantity: 1, unitPriceMinor: 12_000 },
  ];

  it("totals the lines, less the discount, plus delivery", () => {
    expect(priceCounterOrder(lines, { discountMinor: 1_100, deliveryFeeMinor: 2_000 })).toEqual({
      subtotalMinor: 21_100,
      discountMinor: 1_100,
      deliveryFeeMinor: 2_000,
      totalMinor: 22_000,
    });
  });

  it("refuses a discount larger than the items, or negative charges", () => {
    expect(() => priceCounterOrder(lines, { discountMinor: 21_101, deliveryFeeMinor: 0 })).toThrow(/discount/);
    expect(() => priceCounterOrder(lines, { discountMinor: -1, deliveryFeeMinor: 0 })).toThrow(/negative/);
  });
});

describe("startingStatus", () => {
  it("treats goods handed over on the spot as delivered", () => {
    expect(startingStatus("collected")).toBe("delivered");
    expect(startingStatus("pickup")).toBe("confirmed");
    expect(startingStatus("delivery")).toBe("confirmed");
  });
});
