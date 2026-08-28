import { describe, expect, it } from "vitest";
import { dayBounds, expectedCashMinor, isFutureDay, isoDay, toDayKey, variance } from "./closing";

describe("trading day boundaries", () => {
  it("covers midnight to midnight", () => {
    const { start, end } = dayBounds(new Date("2026-08-28T14:37:12.000Z"));
    expect(start.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("puts a payment taken a second before midnight in the right day", () => {
    // The bound is half-open, so 23:59:59 belongs to the day and 00:00:00 to
    // the next one. A payment must land in exactly one closing.
    const { start, end } = dayBounds(new Date("2026-08-28T00:00:00.000Z"));
    const lastMoment = new Date("2026-08-28T23:59:59.999Z");
    const firstMomentOfNextDay = new Date("2026-08-29T00:00:00.000Z");

    expect(lastMoment >= start && lastMoment < end).toBe(true);
    expect(firstMomentOfNextDay < end).toBe(false);
  });

  it("crosses a month end without slipping", () => {
    const { end } = dayBounds(new Date("2026-08-31T09:00:00.000Z"));
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("crosses a year end without slipping", () => {
    const { end } = dayBounds(new Date("2026-12-31T09:00:00.000Z"));
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles a leap day", () => {
    const { end } = dayBounds(new Date("2028-02-28T09:00:00.000Z"));
    expect(end.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("reduces any moment in a day to the same key", () => {
    const morning = toDayKey(new Date("2026-08-28T06:00:00.000Z"));
    const evening = toDayKey(new Date("2026-08-28T22:00:00.000Z"));
    expect(morning.getTime()).toBe(evening.getTime());
    expect(isoDay(new Date("2026-08-28T22:00:00.000Z"))).toBe("2026-08-28");
  });
});

describe("closing a day that has not happened", () => {
  const now = new Date("2026-08-28T10:00:00.000Z");

  it("allows today, even mid-morning", () => {
    expect(isFutureDay(new Date("2026-08-28T23:00:00.000Z"), now)).toBe(false);
  });

  it("allows any past day", () => {
    expect(isFutureDay(new Date("2026-08-27T00:00:00.000Z"), now)).toBe(false);
  });

  it("refuses tomorrow", () => {
    expect(isFutureDay(new Date("2026-08-29T00:00:00.000Z"), now)).toBe(true);
  });
});

describe("what should be in the drawer", () => {
  it("is cash taken less cash paid out", () => {
    expect(expectedCashMinor(50_000, 12_000)).toBe(38_000);
  });

  it("ignores the channels that never reach the till", () => {
    // The whole point: a day of nothing but card sales expects an empty till,
    // not a till holding the card takings.
    expect(expectedCashMinor(0, 0)).toBe(0);
  });

  it("can go negative when more was paid out than taken in", () => {
    // A real situation - paying a supplier from a float on a quiet day. It
    // must not be clamped to zero, or the count will look like a surplus.
    expect(expectedCashMinor(1_000, 5_000)).toBe(-4_000);
  });
});

describe("variance", () => {
  it("calls an exact count balanced", () => {
    expect(variance(38_000, 38_000)).toEqual({ minor: 0, direction: "balanced" });
  });

  it("calls a missing note short, and signs it negative", () => {
    expect(variance(33_000, 38_000)).toEqual({ minor: -5_000, direction: "short" });
  });

  it("calls an unexplained extra note over", () => {
    // Over is not "fine". A till that is repeatedly over is as much a sign of
    // something wrong as one that is repeatedly short.
    expect(variance(40_000, 38_000)).toEqual({ minor: 2_000, direction: "over" });
  });

  it("stays exact across a long day of small amounts", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in pesewas it is exact, which is why the
    // arithmetic is done in minor units.
    const expectedMinor = Array.from({ length: 300 }, () => 10).reduce((a, b) => a + b, 0);
    expect(variance(expectedMinor, expectedMinor).direction).toBe("balanced");
  });
});
