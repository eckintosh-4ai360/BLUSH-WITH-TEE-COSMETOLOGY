import { describe, expect, it } from "vitest";
import { likePattern, listInputSchema, paginate, paginationBounds } from "./pagination";

describe("list queries", () => {
  it("caps the page size so a client cannot ask for the whole table", () => {
    expect(() => listInputSchema.parse({ pageSize: 5000 })).toThrow();
    expect(paginationBounds({ page: 1, pageSize: 5000 }).limit).toBe(100);
  });

  it("defaults to a bounded first page", () => {
    const parsed = listInputSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.sortDir).toBe("desc");
  });

  it("computes the offset from the page number", () => {
    expect(paginationBounds({ page: 3, pageSize: 25 }).offset).toBe(50);
    expect(paginationBounds({ page: 1, pageSize: 25 }).offset).toBe(0);
  });

  it("treats a page below one as the first page", () => {
    expect(paginationBounds({ page: 0, pageSize: 10 }).offset).toBe(0);
    expect(paginationBounds({ page: -5, pageSize: 10 }).page).toBe(1);
  });

  it("reports whether more pages follow", () => {
    expect(paginate([], 120, { page: 1, pageSize: 25 })).toMatchObject({
      total: 120,
      totalPages: 5,
      hasMore: true,
    });
    expect(paginate([], 120, { page: 5, pageSize: 25 }).hasMore).toBe(false);
  });

  it("reports one page when there is nothing to show", () => {
    expect(paginate([], 0, { page: 1, pageSize: 25 })).toMatchObject({
      totalPages: 1,
      hasMore: false,
    });
  });

  it("escapes wildcards a user types so they match literally", () => {
    // Without escaping, searching for "50%" would match every row.
    expect(likePattern("50%")).toBe("%50\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("back\\slash")).toBe("%back\\\\slash%");
    expect(likePattern("Ama")).toBe("%Ama%");
  });
});
