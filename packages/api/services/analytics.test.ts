import { describe, expect, it } from "vitest";
import { humanise, monthBuckets, startOfMonth, startOfMonthsAgo, startOfToday } from "./analytics";

describe("reporting period boundaries", () => {
  it("starts the day at midnight, so today's figures exclude yesterday", () => {
    const start = startOfToday(new Date("2026-08-22T15:42:19Z"));
    expect(start.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("starts the month on the first, whatever the time of day", () => {
    expect(startOfMonth(new Date("2026-08-22T23:59:59Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("steps back across a year boundary correctly", () => {
    expect(startOfMonthsAgo(11, new Date("2026-08-22T10:00:00Z")).toISOString()).toBe(
      "2025-09-01T00:00:00.000Z",
    );
  });
});

describe("chart axes", () => {
  it("produces a dense month axis so a quiet month renders as zero", () => {
    const buckets = monthBuckets(12, new Date("2026-08-22T10:00:00Z"));

    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toEqual({ key: "2025-09", label: "Sep 2025" });
    expect(buckets.at(-1)).toEqual({ key: "2026-08", label: "Aug 2026" });
  });

  it("keeps months in ascending order with no gaps", () => {
    const keys = monthBuckets(14, new Date("2026-01-15T10:00:00Z")).map(bucket => bucket.key);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("titles enum values for display", () => {
    expect(humanise("beauty_products")).toBe("Beauty Products");
    expect(humanise("rent")).toBe("Rent");
  });
});
