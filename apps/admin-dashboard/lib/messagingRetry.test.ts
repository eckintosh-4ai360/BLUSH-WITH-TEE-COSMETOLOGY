import { describe, expect, it } from "vitest";
import { retryIntervalMinutes } from "./messagingRetry";

describe("retryIntervalMinutes", () => {
  it("defaults to five minutes", () => {
    expect(retryIntervalMinutes(undefined)).toBe(5);
    expect(retryIntervalMinutes("")).toBe(5);
    expect(retryIntervalMinutes("soon")).toBe(5);
    expect(retryIntervalMinutes("-1")).toBe(5);
  });

  it("takes a configured interval, and 0 to switch the timer off", () => {
    expect(retryIntervalMinutes("10")).toBe(10);
    expect(retryIntervalMinutes("0")).toBe(0);
  });
});
