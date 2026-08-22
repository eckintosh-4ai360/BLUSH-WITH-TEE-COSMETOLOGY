import { describe, expect, it } from "vitest";
import { calculateOrderTotal, canUsePortal, checkoutStockDeductions, inventoryBalanceAfter, safeFileName, validateDocumentUpload } from "./platform.utils";

describe("platform access and transaction utilities", () => {
  it("enforces distinct portal access for student, staff, and administrator roles", () => {
    expect(canUsePortal("student", "student")).toBe(true);
    expect(canUsePortal("student", "staff")).toBe(false);
    expect(canUsePortal("staff", "admin")).toBe(false);
    expect(canUsePortal("admin", "admin")).toBe(true);
  });

  it("calculates checkout totals from authoritative product prices", () => {
    expect(calculateOrderTotal([{ quantity: 2, sellingPrice: "12.50" }, { quantity: 1, sellingPrice: 5 }])).toBe(30);
  });

  it("keeps the shared balance non-negative for sales, class use, and stock adjustments", () => {
    expect(inventoryBalanceAfter(20, -2)).toBe(18);
    expect(inventoryBalanceAfter(18, 7)).toBe(25);
    expect(() => inventoryBalanceAfter(3, -4)).toThrow("below zero");
  });

  it("plans an authoritative shared-stock deduction for every checkout line", () => {
    expect(checkoutStockDeductions([{ inventoryItemId: 1, quantityOnHand: 11, quantity: 2 }, { inventoryItemId: 2, quantityOnHand: 5, quantity: 5 }])).toEqual([{ inventoryItemId: 1, remaining: 9 }, { inventoryItemId: 2, remaining: 0 }]);
    expect(() => checkoutStockDeductions([{ inventoryItemId: 1, quantityOnHand: 1, quantity: 2 }])).toThrow("below zero");
  });

  it("accepts transcript PDFs and rejects unsupported upload types", () => {
    const encoded = `data:application/pdf;base64,${Buffer.from("document").toString("base64")}`;
    expect(validateDocumentUpload("application/pdf", encoded).toString()).toBe("document");
    expect(() => validateDocumentUpload("application/x-msdownload", encoded)).toThrow("Only PDF");
    expect(safeFileName("my government ID (final).pdf")).toBe("my-government-ID-final-.pdf");
  });
});
