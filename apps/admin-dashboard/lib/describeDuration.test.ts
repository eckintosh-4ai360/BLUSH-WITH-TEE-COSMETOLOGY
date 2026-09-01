import { describe, expect, it } from "vitest";
import { describeDuration, durationFilterOptions } from "./describeDuration";

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

  it("reads the individual courses the way the price list does", () => {
    // Professional Makeup (Beginner) and Nails are both sold as two months.
    expect(describeDuration(8)).toBe("2 months");
    // Wigmaking & Styling and Ombre Brows are sold as one month.
    expect(describeDuration(4)).toBe("1 month");
    // The short installation and lash courses are sold in weeks.
    expect(describeDuration(2)).toBe("2 weeks");
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

describe("durationFilterOptions", () => {
  it("offers each length once, shortest first", () => {
    // Two programmes share the 8-week length; the filter should list it once.
    expect(
      durationFilterOptions([
        { durationWeeks: 24 },
        { durationWeeks: 8 },
        { durationWeeks: 48 },
        { durationWeeks: 8 },
      ]),
    ).toEqual([
      { weeks: 8, label: "2 months" },
      { weeks: 24, label: "6 months" },
      { weeks: 48, label: "1 year" },
    ]);
  });

  it("has nothing to offer before the programmes have loaded", () => {
    expect(durationFilterOptions(undefined)).toEqual([]);
    expect(durationFilterOptions([])).toEqual([]);
  });

  it("leaves out a length that would render as a dash", () => {
    expect(durationFilterOptions([{ durationWeeks: 0 }, { durationWeeks: 12 }])).toEqual([
      { weeks: 12, label: "3 months" },
    ]);
  });
});
