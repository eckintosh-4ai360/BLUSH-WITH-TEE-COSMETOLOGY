import { describe, expect, it } from "vitest";
import { ageFromBirthDate } from "./ageFromBirthDate";

/** Fixed so the tests do not change their mind on somebody's birthday. */
const TODAY = new Date(2026, 8, 2); // 2 September 2026

describe("ageFromBirthDate", () => {
  it("counts the years to a birthday already past this year", () => {
    expect(ageFromBirthDate("2000-01-15", TODAY)).toBe(26);
  });

  it("holds the age back when the birthday is still to come", () => {
    expect(ageFromBirthDate("2000-12-15", TODAY)).toBe(25);
  });

  it("counts the birthday itself as the day the age changes", () => {
    expect(ageFromBirthDate("2000-09-02", TODAY)).toBe(26);
    expect(ageFromBirthDate("2000-09-03", TODAY)).toBe(25);
  });

  it("reads the date as written, not as midnight in London", () => {
    // Parsed as an instant this is the 31st for anyone west of Greenwich,
    // which would make a 1 September birthday read a year short.
    expect(ageFromBirthDate("2001-09-01", TODAY)).toBe(25);
  });

  it("handles a birthday on the 29th of February", () => {
    expect(ageFromBirthDate("2004-02-29", TODAY)).toBe(22);
  });

  it("gives nothing for an empty or half-typed date", () => {
    expect(ageFromBirthDate("", TODAY)).toBeNull();
    expect(ageFromBirthDate("2000-01", TODAY)).toBeNull();
    expect(ageFromBirthDate("15/01/2000", TODAY)).toBeNull();
  });

  it("gives nothing for a day that does not exist", () => {
    expect(ageFromBirthDate("2001-02-31", TODAY)).toBeNull();
  });

  it("gives nothing for a date in the future or an implausible one", () => {
    expect(ageFromBirthDate("2030-01-01", TODAY)).toBeNull();
    expect(ageFromBirthDate("1850-01-01", TODAY)).toBeNull();
  });
});
