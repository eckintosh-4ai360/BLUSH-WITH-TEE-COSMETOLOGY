import { describe, expect, it } from "vitest";
import { absoluteAdminUrl, describeItem, shouldAlert, type AlertState } from "./lowStock";
import { buildLowStockPdf } from "./lowStockPdf";
import { crossesReorderLevel } from "./stock";
import type { LowStockRow } from "./lowStock";

const empty: AlertState = { lastSentAt: null, itemIds: [] };
const now = new Date("2026-09-02T09:00:00Z");
const minutesBefore = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

describe("spotting the movement that takes an item low", () => {
  it("fires on the sale that crosses the line, and not on the ones after it", () => {
    const item = { quantityOnHand: 6, reorderLevel: 5 };
    // Six down to five: this is the sale worth telling somebody about.
    expect(crossesReorderLevel(item, 5)).toBe(true);
    // Five down to four is the same shortage, already reported.
    expect(crossesReorderLevel({ quantityOnHand: 5, reorderLevel: 5 }, 4)).toBe(false);
  });

  it("fires when a large sale jumps clean past the reorder level", () => {
    expect(crossesReorderLevel({ quantityOnHand: 20, reorderLevel: 5 }, 0)).toBe(true);
  });

  it("never fires on stock coming in", () => {
    // Receiving a delivery is the opposite of a shortage, even while the
    // balance is still under the reorder level.
    expect(crossesReorderLevel({ quantityOnHand: 1, reorderLevel: 5 }, 4)).toBe(false);
    expect(crossesReorderLevel({ quantityOnHand: 4, reorderLevel: 5 }, 9)).toBe(false);
  });

  it("treats an item with no reorder level as low only once it runs out", () => {
    // reorderLevel defaults to zero, and most items never have one set. They
    // must not alert on every sale.
    expect(crossesReorderLevel({ quantityOnHand: 9, reorderLevel: 0 }, 8)).toBe(false);
    expect(crossesReorderLevel({ quantityOnHand: 1, reorderLevel: 0 }, 0)).toBe(true);
  });
});

describe("deciding whether to spend a text message", () => {
  it("alerts on an item nobody has been told about", () => {
    expect(shouldAlert(empty, [7], now)).toMatchObject({ send: true, newlyLow: [7] });
  });

  it("says nothing when everything low has already been reported", () => {
    // The shelf is still empty, but the owner already knows. Every further
    // sale of that item must not send another text.
    const state: AlertState = { lastSentAt: minutesBefore(600), itemIds: [7] };
    expect(shouldAlert(state, [7], now).send).toBe(false);
  });

  it("holds a new item back during the quiet period rather than losing it", () => {
    const state: AlertState = { lastSentAt: minutesBefore(5), itemIds: [7] };
    const decision = shouldAlert(state, [7, 9], now);

    expect(decision.send).toBe(false);
    // Item 9 is still counted as new, so the next alert leads with it. Nothing
    // marks it as told except an alert that actually went out.
    expect(decision.newlyLow).toEqual([9]);
  });

  it("alerts once the quiet period has passed", () => {
    const state: AlertState = { lastSentAt: minutesBefore(45), itemIds: [7] };
    expect(shouldAlert(state, [7, 9], now).send).toBe(true);
  });

  it("treats an item that was restocked and has fallen again as news", () => {
    // It was reported in March, restocked in April, and is empty again today.
    // That is a second shortage, not the first one still running.
    const state: AlertState = { lastSentAt: minutesBefore(10_000), itemIds: [7] };
    expect(shouldAlert(state, [], now).send).toBe(false);
    expect(shouldAlert({ ...state, itemIds: [] }, [7], now)).toMatchObject({ send: true });
  });

  it("sends nothing at all when nothing is low", () => {
    expect(shouldAlert(empty, [], now)).toMatchObject({ send: false });
    // Not even when a person presses the button.
    expect(shouldAlert(empty, [], now, true).send).toBe(false);
  });

  it("ignores the quiet period when a person asked for it", () => {
    const state: AlertState = { lastSentAt: minutesBefore(1), itemIds: [7] };
    expect(shouldAlert(state, [7], now, true).send).toBe(true);
  });
});

describe("wording", () => {
  it("says out of stock rather than nought left", () => {
    expect(describeItem({ name: "Shea butter", quantityOnHand: 0, reorderLevel: 6 })).toBe(
      "Shea butter (out of stock, reorder at 6)",
    );
    expect(describeItem({ name: "Cotton pads", quantityOnHand: 2, reorderLevel: 20 })).toBe(
      "Cotton pads (2 left, reorder at 20)",
    );
  });

  it("keeps a link relative rather than inventing an origin", () => {
    // No ADMIN_URL in the test environment. A relative path is still readable
    // in an email; a made-up host would not be.
    expect(absoluteAdminUrl("/inventory?filter=low")).toBe("/inventory?filter=low");
  });
});

describe("the report itself", () => {
  const rows: LowStockRow[] = [
    {
      id: 1,
      sku: "SHE-500",
      name: "Shea butter 500g",
      category: "Treatments",
      supplier: "Accra Naturals",
      quantityOnHand: 0,
      reorderLevel: 6,
      shortfall: 6,
      unitCost: 24.5,
    },
    {
      id: 2,
      sku: "COT-100",
      name: "Cotton pads",
      category: "Consumables",
      supplier: null,
      quantityOnHand: 2,
      reorderLevel: 20,
      shortfall: 18,
      unitCost: 3,
    },
  ];

  it("builds a real PDF on the server", async () => {
    const pdf = await buildLowStockPdf(rows, {
      schoolName: "Blush With Tee",
      generatedAt: new Date("2026-09-02T09:00:00Z"),
      requestedBy: "Tee",
    });

    // The SMS is only worth sending if the thing it links to opens.
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("builds one for a single item without falling over on the plural", async () => {
    const pdf = await buildLowStockPdf(rows.slice(0, 1), {
      schoolName: "Blush With Tee",
      generatedAt: new Date("2026-09-02T09:00:00Z"),
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
