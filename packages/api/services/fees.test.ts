import { describe, expect, it } from "vitest";
import { assertRefundable, planAllocation } from "./fees";

const charge = (id: number, due: string, paid = "0.00") => ({
  id,
  amountDue: due,
  amountPaid: paid,
});

describe("payment allocation", () => {
  it("settles the oldest charge first and cascades the remainder", () => {
    const { lines, unallocatedMinor } = planAllocation(
      [charge(1, "150.00"), charge(2, "320.00"), charge(3, "2400.00")],
      40000, // GHS 400.00
    );

    expect(lines).toEqual([
      { feeChargeId: 1, amountMinor: 15000, paidAfterMinor: 15000, dueMinor: 15000, settled: true },
      { feeChargeId: 2, amountMinor: 25000, paidAfterMinor: 25000, dueMinor: 32000, settled: false },
    ]);
    expect(unallocatedMinor).toBe(0);
  });

  it("pulls an explicitly chosen charge to the front", () => {
    // GHS 200 against the chosen charge of 320 leaves it part paid, and there
    // is nothing left to reach the charge that would otherwise have come first.
    const { lines } = planAllocation([charge(1, "150.00"), charge(2, "320.00")], 20000, 2);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.feeChargeId).toBe(2);
    expect(lines[0]?.settled).toBe(false);
    expect(lines[0]?.paidAfterMinor).toBe(20000);
  });

  it("settles the chosen charge first, then falls back to the usual order", () => {
    const { lines } = planAllocation([charge(1, "150.00"), charge(2, "320.00")], 40000, 2);

    expect(lines.map(line => line.feeChargeId)).toEqual([2, 1]);
    expect(lines[0]?.settled).toBe(true);
    expect(lines[1]?.amountMinor).toBe(8000);
  });

  it("continues from what a charge has already been paid", () => {
    const { lines } = planAllocation([charge(1, "150.00", "100.00")], 8000);

    expect(lines).toEqual([
      { feeChargeId: 1, amountMinor: 5000, paidAfterMinor: 15000, dueMinor: 15000, settled: true },
    ]);
  });

  it("never allocates more than is owed and reports the surplus", () => {
    const { lines, unallocatedMinor } = planAllocation([charge(1, "150.00")], 50000);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.amountMinor).toBe(15000);
    // The overpayment is surfaced rather than silently pushing a charge negative.
    expect(unallocatedMinor).toBe(35000);
  });

  it("skips charges that are already settled", () => {
    const { lines } = planAllocation(
      [charge(1, "150.00", "150.00"), charge(2, "320.00")],
      10000,
    );

    expect(lines.map(line => line.feeChargeId)).toEqual([2]);
  });

  it("allocates nothing for a zero or negative amount", () => {
    expect(planAllocation([charge(1, "150.00")], 0).lines).toEqual([]);
    expect(planAllocation([charge(1, "150.00")], -500).lines).toEqual([]);
  });

  it("splits a payment across every open charge until it runs out", () => {
    const { lines, unallocatedMinor } = planAllocation(
      [charge(1, "100.00"), charge(2, "100.00"), charge(3, "100.00")],
      25000,
    );

    expect(lines.map(line => line.amountMinor)).toEqual([10000, 10000, 5000]);
    expect(lines.filter(line => line.settled)).toHaveLength(2);
    expect(unallocatedMinor).toBe(0);
  });
});

describe("refund guards", () => {
  it("rejects a refund larger than what was collected", () => {
    expect(() => assertRefundable(10000, 0, 15000)).toThrow(/exceed/i);
  });

  it("counts refunds already taken against the original payment", () => {
    expect(() => assertRefundable(10000, 6000, 5000)).toThrow(/exceed/i);
    expect(() => assertRefundable(10000, 6000, 4000)).not.toThrow();
  });

  it("rejects a zero or negative refund", () => {
    expect(() => assertRefundable(10000, 0, 0)).toThrow(/positive/i);
    expect(() => assertRefundable(10000, 0, -100)).toThrow(/positive/i);
  });
});
