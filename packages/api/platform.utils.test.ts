import { describe, expect, it } from "vitest";
import {
  buildReference,
  buildSequentialNumber,
  calculateOrderTotal,
  canUsePortal,
  checkoutStockDeductions,
  inventoryBalanceAfter,
  safeFileName,
  slugify,
  validateDocumentUpload,
} from "./platform.utils";

/** Minimal payloads that carry a genuine file signature. */
const pdf = () => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("body")]);
const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("pixels"),
  ]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("pixels")]);
const asDataUrl = (mime: string, buffer: Buffer) =>
  `data:${mime};base64,${buffer.toString("base64")}`;

describe("portal access", () => {
  it("keeps the three portals separate", () => {
    expect(canUsePortal("student", "student")).toBe(true);
    expect(canUsePortal("student", "staff")).toBe(false);
    expect(canUsePortal("student", "admin")).toBe(false);
    expect(canUsePortal("staff", "staff")).toBe(true);
    expect(canUsePortal("staff", "admin")).toBe(false);
    expect(canUsePortal("user", "student")).toBe(false);
  });

  it("lets an administrator reach every portal", () => {
    expect(canUsePortal("admin", "student")).toBe(true);
    expect(canUsePortal("admin", "staff")).toBe(true);
    expect(canUsePortal("admin", "admin")).toBe(true);
  });
});

describe("checkout arithmetic", () => {
  it("totals from authoritative product prices, not client-supplied ones", () => {
    expect(
      calculateOrderTotal([
        { quantity: 2, sellingPrice: "12.50" },
        { quantity: 1, sellingPrice: 5 },
      ]),
    ).toBe(30);
  });

  it("keeps the shared balance non-negative for sales and classroom use", () => {
    expect(inventoryBalanceAfter(20, -2)).toBe(18);
    expect(inventoryBalanceAfter(18, 7)).toBe(25);
    expect(() => inventoryBalanceAfter(3, -4)).toThrow(/below zero/i);
  });

  it("rejects fractional stock", () => {
    expect(() => inventoryBalanceAfter(10, -1.5)).toThrow(/whole numbers/i);
  });

  it("plans a deduction for every checkout line and refuses to oversell", () => {
    expect(
      checkoutStockDeductions([
        { inventoryItemId: 1, quantityOnHand: 11, quantity: 2 },
        { inventoryItemId: 2, quantityOnHand: 5, quantity: 5 },
      ]),
    ).toEqual([
      { inventoryItemId: 1, remaining: 9 },
      { inventoryItemId: 2, remaining: 0 },
    ]);

    expect(() =>
      checkoutStockDeductions([{ inventoryItemId: 1, quantityOnHand: 1, quantity: 2 }]),
    ).toThrow(/below zero/i);
  });
});

describe("upload validation", () => {
  it("accepts the document types admissions actually needs", () => {
    expect(validateDocumentUpload("application/pdf", asDataUrl("application/pdf", pdf())).length).toBeGreaterThan(0);
    expect(validateDocumentUpload("image/png", asDataUrl("image/png", png())).length).toBeGreaterThan(0);
    expect(validateDocumentUpload("image/jpeg", asDataUrl("image/jpeg", jpeg())).length).toBeGreaterThan(0);
  });

  it("rejects a type that is not on the allow-list", () => {
    expect(() =>
      validateDocumentUpload("application/x-msdownload", asDataUrl("application/pdf", pdf())),
    ).toThrow(/Only PDF/i);
  });

  it("rejects content that does not match the declared type", () => {
    // The core of §58: a caller cannot smuggle a payload past the check by
    // simply claiming it is a PDF.
    const executable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(() =>
      validateDocumentUpload("application/pdf", executable.toString("base64")),
    ).toThrow(/do not match the declared file type/i);

    expect(() => validateDocumentUpload("image/png", jpeg().toString("base64"))).toThrow(
      /do not match the declared file type/i,
    );
  });

  it("rejects an empty upload and one over the size limit", () => {
    expect(() => validateDocumentUpload("application/pdf", "")).toThrow(/between 1 byte/i);

    const oversized = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(9 * 1024 * 1024)]);
    expect(() => validateDocumentUpload("application/pdf", oversized.toString("base64"))).toThrow(
      /8 MB/i,
    );
  });

  it("strips path and shell characters out of a filename", () => {
    expect(safeFileName("my government ID (final).pdf")).toBe("my-government-ID-final-.pdf");
    expect(safeFileName("")).toBe("upload");
  });

  it("removes the separators a path-traversal filename relies on", () => {
    const cleaned = safeFileName("../../etc/passwd");
    expect(cleaned).not.toContain("/");
    expect(cleaned).not.toContain("\\");
    expect(safeFileName("..\\..\\windows\\system32")).not.toContain("\\");
  });
});

describe("references and slugs", () => {
  it("builds a distinct, unambiguous human reference", () => {
    const references = Array.from({ length: 200 }, () => buildReference("PAY"));

    for (const value of references) {
      // Only the two delimiters, and no characters that transcribe two ways.
      expect(value).toMatch(/^PAY-\d{4}-[A-HJ-NP-Z2-9]{6}$/);
      expect(value.split("-")).toHaveLength(3);
    }

    expect(new Set(references).size).toBe(references.length);
  });

  it("builds a padded sequential document number", () => {
    expect(buildSequentialNumber("COS", 124)).toMatch(/^COS-\d{4}-00124$/);
  });

  it("makes SEO-friendly slugs", () => {
    expect(slugify("Professional Hair Artistry")).toBe("professional-hair-artistry");
    expect(slugify("  Nail Craft & Design!  ")).toBe("nail-craft-design");
    expect(slugify("!!!")).toBe("item");
  });
});

describe("upload size ceiling", () => {
  it("refuses an oversized base64 field before decoding it", () => {
    // One character over the ceiling: the point is that this is rejected on
    // length, not after allocating a buffer for it.
    const oversized = "A".repeat(MAX_UPLOAD_BASE64_LENGTH + 1);
    expect(() => validateDocumentUpload("image/png", oversized)).toThrow(
      /between 1 byte and 8 MB/,
    );
  });

  it("still accepts a real file well inside the ceiling", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    expect(validateDocumentUpload("image/png", png.toString("base64")).length).toBe(png.length);
  });
});
