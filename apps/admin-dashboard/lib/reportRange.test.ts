import { describe, expect, it } from "vitest";
import { RANGE_OPTIONS, describeRange, resolveRange } from "./reportRange";

/**
 * These bounds decide what every report counts. The cases that matter are the
 * edges: a window that ends at midnight silently drops the day it claims to
 * cover, and one month's start bleeding into another double-counts.
 */

// A fixed "now" in the middle of a month, so nothing depends on the real date.
const NOW = new Date(2026, 2, 20, 14, 30, 0); // 20 March 2026, 14:30

describe("resolveRange", () => {
  it("includes everything recorded today, not just up to midnight", () => {
    const { dateTo } = resolveRange("this_month", NOW);
    expect(dateTo?.getDate()).toBe(20);
    expect(dateTo?.getHours()).toBe(23);
    expect(dateTo?.getMinutes()).toBe(59);
    expect(dateTo?.getMilliseconds()).toBe(999);
  });

  it("starts this month at the first of the month", () => {
    const { dateFrom } = resolveRange("this_month", NOW);
    expect(dateFrom?.getMonth()).toBe(2);
    expect(dateFrom?.getDate()).toBe(1);
    expect(dateFrom?.getHours()).toBe(0);
  });

  it("ends last month immediately before this one begins, with no gap and no overlap", () => {
    const lastMonth = resolveRange("last_month", NOW);
    const thisMonth = resolveRange("this_month", NOW);

    expect(lastMonth.dateFrom?.getMonth()).toBe(1);
    expect(lastMonth.dateFrom?.getDate()).toBe(1);
    // One millisecond apart: a row belongs to exactly one of the two windows.
    expect((thisMonth.dateFrom as Date).getTime() - (lastMonth.dateTo as Date).getTime()).toBe(1);
  });

  it("counts the current month as one of the last three", () => {
    const { dateFrom } = resolveRange("last_3", NOW);
    expect(dateFrom?.getMonth()).toBe(0); // January, so Jan–Mar inclusive
    expect(dateFrom?.getFullYear()).toBe(2026);
  });

  it("rolls a twelve-month window back across the year boundary", () => {
    const { dateFrom } = resolveRange("last_12", NOW);
    expect(dateFrom?.getFullYear()).toBe(2025);
    expect(dateFrom?.getMonth()).toBe(3); // April 2025 through March 2026
  });

  it("starts this year on 1 January", () => {
    const { dateFrom } = resolveRange("this_year", NOW);
    expect(dateFrom?.getFullYear()).toBe(2026);
    expect(dateFrom?.getMonth()).toBe(0);
    expect(dateFrom?.getDate()).toBe(1);
  });

  it("leaves all-time unbounded rather than picking an arbitrary start", () => {
    const range = resolveRange("all", NOW);
    expect(range.dateFrom).toBeUndefined();
    expect(range.dateTo).toBeUndefined();
  });

  it("labels every option it offers", () => {
    for (const option of RANGE_OPTIONS) {
      expect(resolveRange(option.key, NOW).label).toBe(option.label);
    }
  });
});

describe("describeRange", () => {
  it("says what an exported file covers", () => {
    expect(describeRange(resolveRange("this_month", NOW))).toBe("01/03/2026 to 20/03/2026");
  });

  it("names an unbounded window rather than leaving it blank", () => {
    expect(describeRange(resolveRange("all", NOW))).toBe("All time");
  });

  it("handles a window open at one end", () => {
    expect(describeRange({ dateFrom: new Date(2026, 0, 5), label: "x" })).toBe("From 05/01/2026");
    expect(describeRange({ dateTo: new Date(2026, 0, 5), label: "x" })).toBe("Up to 05/01/2026");
  });
});
