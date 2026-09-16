import { describe, expect, it } from "vitest";
import { assertCorrectable, chargeStatusFor } from "./paymentCorrection";

describe("chargeStatusFor", () => {
  it("follows what has been paid", () => {
    expect(chargeStatusFor(850000, 0, "paid")).toBe("open");
    expect(chargeStatusFor(850000, 450000, "paid")).toBe("partially_paid");
    expect(chargeStatusFor(850000, 850000, "partially_paid")).toBe("paid");
  });

  it("leaves a waived charge waived", () => {
    expect(chargeStatusFor(850000, 0, "waived")).toBe("waived");
  });
});

describe("assertCorrectable", () => {
  const payment = {
    studentId: 42,
    status: "completed",
    amountMinor: 465000,
    refundedMinor: 0,
    newAmountMinor: 400000,
  };

  it("accepts a correction to a completed student payment", () => {
    expect(() => assertCorrectable(payment)).not.toThrow();
  });

  it("accepts zero, for a payment recorded by mistake", () => {
    expect(() => assertCorrectable({ ...payment, newAmountMinor: 0 })).not.toThrow();
  });

  it("refuses store payments, refunded payments and negative amounts", () => {
    expect(() => assertCorrectable({ ...payment, studentId: null })).toThrow(/student fee/);
    expect(() => assertCorrectable({ ...payment, status: "refunded" })).toThrow(/refunded/);
    expect(() => assertCorrectable({ ...payment, newAmountMinor: -100 })).toThrow(/negative/);
  });

  it("refuses an amount below what was already refunded, or no change at all", () => {
    expect(() => assertCorrectable({ ...payment, refundedMinor: 450000 })).toThrow(/refunded/);
    expect(() => assertCorrectable({ ...payment, newAmountMinor: 465000 })).toThrow(/already/);
  });
});
