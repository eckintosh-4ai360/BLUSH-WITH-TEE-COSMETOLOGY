import { describe, expect, it } from "vitest";
import { ordinal, positionsByScore, tiedPositions } from "./ranking";

describe("positionsByScore", () => {
  it("ranks highest first", () => {
    expect(positionsByScore([70, 90, 80])).toEqual([3, 1, 2]);
  });

  it("keeps the input order", () => {
    // The sheet decides how to display; this only says what each mark earned.
    expect(positionsByScore([50, 100])).toEqual([2, 1]);
  });

  it("gives a tie the same position and skips the places it used", () => {
    // Joint second, and nobody is third.
    expect(positionsByScore([90, 80, 80, 70])).toEqual([1, 2, 2, 4]);
  });

  it("handles a tie at the top", () => {
    expect(positionsByScore([90, 90, 90, 10])).toEqual([1, 1, 1, 4]);
  });

  it("handles every mark being the same", () => {
    expect(positionsByScore([60, 60, 60])).toEqual([1, 1, 1]);
  });

  it("leaves an unmarked student without a position", () => {
    expect(positionsByScore([90, null, 70])).toEqual([1, null, 2]);
  });

  it("does not let unmarked students consume a place", () => {
    // Marking the two blanks later must not shuffle these two.
    expect(positionsByScore([null, 90, null, 70])).toEqual([null, 1, null, 2]);
  });

  it("returns nothing for an empty sheet", () => {
    expect(positionsByScore([])).toEqual([]);
    expect(positionsByScore([null, null])).toEqual([null, null]);
  });

  it("ranks a zero rather than treating it as unmarked", () => {
    // A student who sat the exam and scored nothing is last, not absent.
    expect(positionsByScore([0, 50])).toEqual([2, 1]);
  });

  it("ranks fractional marks", () => {
    expect(positionsByScore([74.5, 74.75, 74.25])).toEqual([2, 1, 3]);
  });
});

describe("tiedPositions", () => {
  it("reports only the positions more than one student holds", () => {
    expect(tiedPositions([1, 2, 2, 4])).toEqual(new Set([2]));
  });

  it("reports nothing when every position is held alone", () => {
    expect(tiedPositions([1, 2, 3])).toEqual(new Set());
  });

  it("ignores the unmarked", () => {
    expect(tiedPositions([null, null, 1])).toEqual(new Set());
  });
});

describe("ordinal", () => {
  it("uses the ordinary suffixes", () => {
    expect([1, 2, 3, 4, 21, 22, 23].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });

  it("says 11th, 12th and 13th rather than 11st", () => {
    expect([11, 12, 13, 111, 112].map(ordinal)).toEqual([
      "11th",
      "12th",
      "13th",
      "111th",
      "112th",
    ]);
  });
});
