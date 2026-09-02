import { describe, expect, it } from "vitest";
import { classifyStorageKey } from "./storageAccess";

/**
 * The classification is what decides whether a file is served without a
 * session, so the cases that matter are the ones where a private key could be
 * mistaken for a public one.
 */
describe("classifyStorageKey", () => {
  const folder = "image/blush-with-tee";

  it("treats marketing media as public", () => {
    for (const purpose of ["product", "gallery", "brochure"]) {
      expect(classifyStorageKey(`${folder}/media/${purpose}/1712-shot_ab12cd34`)).toBe("public");
    }
  });

  it("treats admissions documents as applicant-owned", () => {
    expect(classifyStorageKey(`${folder}/applications/12/1712-transcript_ab12cd34`)).toBe(
      "application",
    );
  });

  it("keeps receipts and profile photos behind a session", () => {
    for (const purpose of ["receipt", "profile", "other"]) {
      expect(classifyStorageKey(`${folder}/media/${purpose}/1712-file_ab12cd34`)).toBe("internal");
    }
  });

  it("holds generated reports to a back-office permission", () => {
    // Not `internal`: that class is satisfied by any session, and a storefront
    // customer has one. This report names suppliers and unit costs, and its
    // address goes out by SMS.
    expect(classifyStorageKey(`${folder}/reports/low-stock-2026-09-02_ab12cd34`)).toBe("report");
  });

  it("defaults an unrecognised path to internal rather than public", () => {
    expect(classifyStorageKey(`${folder}/exports/payroll-2026_ab12cd34`)).toBe("internal");
    expect(classifyStorageKey("")).toBe("internal");
  });

  it("does not let a public-looking segment inside a name open an application", () => {
    // A file an applicant named "media-product" must not become public.
    expect(
      classifyStorageKey(`${folder}/applications/12/1712-media-product-id_ab12cd34`),
    ).toBe("application");
  });

  it("matches only on a whole path segment", () => {
    expect(classifyStorageKey(`${folder}/notmedia/product/x_ab12`)).toBe("internal");
  });
});
