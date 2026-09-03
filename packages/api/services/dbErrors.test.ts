import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./dbErrors";

/**
 * The shape drizzle actually throws: its own Error, with the driver's error -
 * the one carrying `code` and `constraint` - on `cause`. Checking only the
 * outer object matches nothing, which is the bug this guards.
 */
function wrapped(code: string, constraint?: string) {
  return Object.assign(new Error("Failed query: insert into ..."), {
    cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
      code,
      constraint,
    }),
  });
}

describe("isUniqueViolation", () => {
  it("finds the code on the wrapped driver error", () => {
    expect(isUniqueViolation(wrapped("23505"))).toBe(true);
  });

  it("finds it on a bare driver error too", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("matches the named constraint", () => {
    expect(isUniqueViolation(wrapped("23505", "enrollment_live_course_unique"), "enrollment_live_course_unique")).toBe(true);
  });

  it("rejects a unique violation from a different constraint", () => {
    // The same statement can break some other uniqueness, and "already
    // enrolled" would then be the wrong thing to say.
    expect(isUniqueViolation(wrapped("23505", "some_other_unique"), "enrollment_live_course_unique")).toBe(false);
  });

  it("rejects a constraint match when none is reported", () => {
    expect(isUniqueViolation(wrapped("23505"), "enrollment_live_course_unique")).toBe(false);
  });

  it("rejects other database errors", () => {
    // 42702 is the ambiguous-column error, not something to swallow.
    expect(isUniqueViolation(wrapped("42702"))).toBe(false);
  });

  it("rejects anything that is not a database error", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });

  it("does not loop forever on a self-referencing cause", () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isUniqueViolation(cyclic)).toBe(false);
  });
});
