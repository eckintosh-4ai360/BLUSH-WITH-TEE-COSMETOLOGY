import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { enforceRateLimit, resetRateLimits } from "./rateLimit";

const rule = { bucket: "test", limit: 3, windowMs: 60_000 };

describe("enforceRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  it("allows exactly the budget, then refuses", () => {
    for (let i = 0; i < rule.limit; i++) expect(() => enforceRateLimit("1.1.1.1", rule)).not.toThrow();
    expect(() => enforceRateLimit("1.1.1.1", rule)).toThrow(TRPCError);
  });

  it("reports how many attempts remain", () => {
    expect(enforceRateLimit("1.1.1.1", rule)).toBe(2);
    expect(enforceRateLimit("1.1.1.1", rule)).toBe(1);
    expect(enforceRateLimit("1.1.1.1", rule)).toBe(0);
  });

  it("answers TOO_MANY_REQUESTS rather than a generic failure", () => {
    for (let i = 0; i < rule.limit; i++) enforceRateLimit("1.1.1.1", rule);
    try {
      enforceRateLimit("1.1.1.1", rule);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("keeps callers apart", () => {
    for (let i = 0; i < rule.limit; i++) enforceRateLimit("1.1.1.1", rule);
    expect(() => enforceRateLimit("2.2.2.2", rule)).not.toThrow();
  });

  it("keeps endpoints apart, so one budget cannot spend another", () => {
    for (let i = 0; i < rule.limit; i++) enforceRateLimit("1.1.1.1", rule);
    expect(() => enforceRateLimit("1.1.1.1", { ...rule, bucket: "other" })).not.toThrow();
  });

  it("puts unidentifiable callers in one shared bucket rather than exempting them", () => {
    for (let i = 0; i < rule.limit; i++) enforceRateLimit(null, rule);
    expect(() => enforceRateLimit(undefined, rule)).toThrow(TRPCError);
  });

  it("lets the window lapse", () => {
    vi.useFakeTimers();
    for (let i = 0; i < rule.limit; i++) enforceRateLimit("1.1.1.1", rule);
    expect(() => enforceRateLimit("1.1.1.1", rule)).toThrow();

    vi.advanceTimersByTime(rule.windowMs + 1);
    expect(() => enforceRateLimit("1.1.1.1", rule)).not.toThrow();
  });
});
