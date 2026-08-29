import { describe, expect, it } from "vitest";
import { describeDuration } from "./describeDuration";

/**
 * These are the three programmes the school actually sells, and the words on
 * its price list. A length that reads back as "12 months" where the brochure
 * says "one year" is the failure worth guarding.
 */
describe("describeDuration", () => {
  it("says three months for the basic course", () => {
    expect(describeDuration(12)).toBe("3 months");
  });

  it("says six months for the mini full course", () => {
    expect(describeDuration(24)).toBe("6 months");
  });

  it("says one year for the ultimate course, timetabled as 48 weeks", () => {
    expect(describeDuration(48)).toBe("1 year");
  });

  it("still says one year for a full 52-week course", () => {
    expect(describeDuration(52)).toBe("1 year");
  });

  it("counts whole years past the first", () => {
    expect(describeDuration(96)).toBe("2 years");
    expect(describeDuration(104)).toBe("2 years");
  });

  it("keeps the singular for a one-month and one-week course", () => {
    expect(describeDuration(4)).toBe("1 month");
    expect(describeDuration(1)).toBe("1 week");
  });

  it("falls back to weeks when the length is not whole months", () => {
    expect(describeDuration(2)).toBe("2 weeks");
    expect(describeDuration(10)).toBe("10 weeks");
  });

  it("prints a dash rather than a nonsense length", () => {
    expect(describeDuration(0)).toBe("\u2014");
    expect(describeDuration(Number.NaN)).toBe("\u2014");
  });
});
