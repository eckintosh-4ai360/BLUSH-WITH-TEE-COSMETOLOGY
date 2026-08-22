import { describe, expect, it } from "vitest";
import { assertVerificationMatches, type GatewayVerification } from "./gateway";

const verification = (overrides: Partial<GatewayVerification> = {}): GatewayVerification => ({
  status: "succeeded",
  amountMinor: 50000,
  currency: "GHS",
  providerReference: "psk_abc123",
  merchantReference: "PI-2026-ABCDEF",
  raw: {},
  ...overrides,
});

const expected = { amountMinor: 50000, currency: "GHS" };

describe("gateway verification", () => {
  it("accepts a charge the provider confirms for the exact amount", () => {
    expect(() => assertVerificationMatches(verification(), expected)).not.toThrow();
  });

  it("refuses a charge the provider has not completed", () => {
    expect(() => assertVerificationMatches(verification({ status: "pending" }), expected)).toThrow(
      /not completed/i,
    );
  });

  it("refuses a charge the provider says failed", () => {
    expect(() => assertVerificationMatches(verification({ status: "failed" }), expected)).toThrow(
      /failed/i,
    );
  });

  it("refuses a short capture, so a small payment cannot clear a large balance", () => {
    // The attack this blocks: pay GHS 1, claim the GHS 500 intent is settled.
    expect(() => assertVerificationMatches(verification({ amountMinor: 100 }), expected)).toThrow(
      /amount confirmed/i,
    );
  });

  it("refuses an overpayment rather than silently accepting it", () => {
    expect(() =>
      assertVerificationMatches(verification({ amountMinor: 90000 }), expected),
    ).toThrow(/amount confirmed/i);
  });

  it("refuses a capture in a different currency", () => {
    expect(() => assertVerificationMatches(verification({ currency: "NGN" }), expected)).toThrow(
      /currency/i,
    );
  });

  it("compares currency case-insensitively", () => {
    expect(() => assertVerificationMatches(verification({ currency: "ghs" }), expected)).not.toThrow();
  });
});
