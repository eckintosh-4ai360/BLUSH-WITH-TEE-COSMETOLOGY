import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, releasesStock } from "./orderFlow";

describe("order lifecycle", () => {
  it("refuses to mark a brand new order delivered", () => {
    // The rule from §64: delivery has to be earned by confirming and processing.
    expect(canTransition("new", "delivered")).toBe(false);
    expect(() => assertTransition("new", "delivered")).toThrow(/can only move to/i);
  });

  it("allows the ordinary path from new through to delivered", () => {
    const path = ["new", "confirmed", "processing", "ready", "shipped", "delivered"] as const;
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransition(path[index]!, path[index + 1]!)).toBe(true);
    }
  });

  it("allows cancellation from any live status but not after delivery", () => {
    for (const status of ["new", "confirmed", "processing", "ready", "shipped"] as const) {
      expect(canTransition(status, "cancelled")).toBe(true);
    }
    expect(canTransition("delivered", "cancelled")).toBe(false);
  });

  it("treats delivered and cancelled as terminal", () => {
    expect(() => assertTransition("delivered", "shipped")).toThrow(/cannot change status/i);
    expect(() => assertTransition("cancelled", "confirmed")).toThrow(/cannot change status/i);
  });

  it("rejects a no-op transition rather than writing a pointless timeline entry", () => {
    expect(() => assertTransition("confirmed", "confirmed")).toThrow(/already confirmed/i);
  });

  it("never moves backwards through the pipeline", () => {
    expect(canTransition("shipped", "processing")).toBe(false);
    expect(canTransition("processing", "confirmed")).toBe(false);
    expect(canTransition("ready", "new")).toBe(false);
  });

  it("returns stock to the shelf only on cancellation", () => {
    expect(releasesStock("cancelled")).toBe(true);
    expect(releasesStock("delivered")).toBe(false);
    expect(releasesStock("shipped")).toBe(false);
  });
});
