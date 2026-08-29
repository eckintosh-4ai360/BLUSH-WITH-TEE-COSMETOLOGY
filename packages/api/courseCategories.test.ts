import { describe, expect, it } from "vitest";
import {
  COURSE_CATEGORIES,
  DEFAULT_COURSE_CATEGORY,
  sortCourseCategories,
} from "@blush/shared/const";

/**
 * The prospectus reads General first, then Individual Courses. Both apps build
 * their filter from the categories the rows happen to carry, and the three full
 * programmes were added to the catalogue after the ten single-skill ones - so
 * row order alone puts them in the wrong place.
 */
describe("sortCourseCategories", () => {
  it("puts the full programmes ahead of the individual courses", () => {
    expect(sortCourseCategories(["Individual Courses", "General"])).toEqual([
      "General",
      "Individual Courses",
    ]);
  });

  it("leaves an already-correct order alone", () => {
    expect(sortCourseCategories(["General", "Individual Courses"])).toEqual([
      "General",
      "Individual Courses",
    ]);
  });

  it("keeps an unrecognised category, sorted after the known ones", () => {
    expect(
      sortCourseCategories(["Workshops", "Individual Courses", "General"]),
    ).toEqual(["General", "Individual Courses", "Workshops"]);
  });

  it("sorts several unrecognised categories alphabetically among themselves", () => {
    expect(sortCourseCategories(["Workshops", "Masterclasses", "General"])).toEqual([
      "General",
      "Masterclasses",
      "Workshops",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const input = ["Individual Courses", "General"];
    sortCourseCategories(input);
    expect(input).toEqual(["Individual Courses", "General"]);
  });

  it("handles an empty catalogue", () => {
    expect(sortCourseCategories([])).toEqual([]);
  });

  it("defaults new programmes to the General half of the prospectus", () => {
    expect(DEFAULT_COURSE_CATEGORY).toBe("General");
    expect(COURSE_CATEGORIES).toContain(DEFAULT_COURSE_CATEGORY);
  });
});
