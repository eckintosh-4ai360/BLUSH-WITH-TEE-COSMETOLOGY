import { describe, expect, it } from "vitest";
import { PRODUCT_IMPORT_COLUMNS, STUDENT_IMPORT_COLUMNS } from "@blush/shared/imports";
import { buildTemplateCsv, mapRows, parseCsv } from "./csv";

/**
 * The cases here are the ones that corrupt a row silently rather than failing
 * loudly — which is how a bad import gets discovered a week later.
 */

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("SKU,Name\nA-1,Serum\nA-2,Cleanser");
    expect(headers).toEqual(["SKU", "Name"]);
    expect(rows).toEqual([
      ["A-1", "Serum"],
      ["A-2", "Cleanser"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    const { rows } = parseCsv('Name,Address\nAma,"Osu, Accra"');
    expect(rows[0]).toEqual(["Ama", "Osu, Accra"]);
  });

  it("keeps a newline inside a quoted field", () => {
    const { rows } = parseCsv('Name,Note\nAma,"Line one\nLine two"');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toBe("Line one\nLine two");
  });

  it("unescapes a doubled quote", () => {
    const { rows } = parseCsv('Name,Note\nAma,"She said ""yes"""');
    expect(rows[0]?.[1]).toBe('She said "yes"');
  });

  it("strips the byte-order mark Excel writes", () => {
    const { headers } = parseCsv("﻿SKU,Name\nA-1,Serum");
    expect(headers[0]).toBe("SKU");
  });

  it("handles Windows line endings", () => {
    const { rows } = parseCsv("SKU,Name\r\nA-1,Serum\r\nA-2,Cleanser\r\n");
    expect(rows).toEqual([
      ["A-1", "Serum"],
      ["A-2", "Cleanser"],
    ]);
  });

  it("does not invent a row from a trailing newline", () => {
    const { rows } = parseCsv("SKU,Name\nA-1,Serum\n");
    expect(rows).toHaveLength(1);
  });

  it("reads a final row with no trailing newline", () => {
    const { rows } = parseCsv("SKU,Name\nA-1,Serum");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["A-1", "Serum"]);
  });

  it("keeps empty cells in position rather than collapsing them", () => {
    const { rows } = parseCsv("A,B,C\n1,,3");
    expect(rows[0]).toEqual(["1", "", "3"]);
  });

  it("returns nothing useful for an empty file rather than throwing", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("mapRows", () => {
  it("matches headings regardless of case, spacing or underscores", () => {
    const parsed = parseCsv("full_name,EMAIL,  Phone  \nAma,a@b.com,024");
    const { rows, missingColumns } = mapRows(parsed, STUDENT_IMPORT_COLUMNS);
    expect(missingColumns).toEqual([]);
    expect(rows[0]).toMatchObject({ fullName: "Ama", email: "a@b.com", phone: "024" });
  });

  it("names the required columns a file is missing", () => {
    const parsed = parseCsv("Full name\nAma");
    const { missingColumns } = mapRows(parsed, STUDENT_IMPORT_COLUMNS);
    expect(missingColumns).toEqual(["Email", "Phone"]);
  });

  it("reports headings it does not recognise instead of ignoring them", () => {
    const parsed = parseCsv("Full name,Email,Phone,Favourite colour\nAma,a@b.com,024,blue");
    const { unknownColumns } = mapRows(parsed, STUDENT_IMPORT_COLUMNS);
    expect(unknownColumns).toEqual(["Favourite colour"]);
  });

  it("pads a row that omits trailing empty cells", () => {
    const parsed = parseCsv("Full name,Email,Phone,Gender\nAma,a@b.com,024");
    const { rows } = mapRows(parsed, STUDENT_IMPORT_COLUMNS);
    expect(rows[0]?.gender).toBe("");
  });

  it("drops spreadsheet padding rows where every cell is blank", () => {
    const parsed = parseCsv("Full name,Email,Phone\nAma,a@b.com,024\n,,\n,,");
    const { rows } = mapRows(parsed, STUDENT_IMPORT_COLUMNS);
    expect(rows).toHaveLength(1);
  });

  it("trims surrounding whitespace from values", () => {
    const parsed = parseCsv("Full name,Email,Phone\n  Ama  ,  a@b.com ,024");
    const { rows } = mapRows(parsed, STUDENT_IMPORT_COLUMNS);
    expect(rows[0]).toMatchObject({ fullName: "Ama", email: "a@b.com" });
  });
});

describe("buildTemplateCsv", () => {
  it("round-trips through the parser, so the template we hand out is one we accept", () => {
    for (const columns of [STUDENT_IMPORT_COLUMNS, PRODUCT_IMPORT_COLUMNS]) {
      const parsed = parseCsv(buildTemplateCsv(columns));
      const { missingColumns, unknownColumns, rows } = mapRows(parsed, columns);

      expect(missingColumns).toEqual([]);
      expect(unknownColumns).toEqual([]);
      expect(rows).toHaveLength(1);
    }
  });

  it("fills every required column in the example row", () => {
    const parsed = parseCsv(buildTemplateCsv(PRODUCT_IMPORT_COLUMNS));
    const { rows } = mapRows(parsed, PRODUCT_IMPORT_COLUMNS);

    for (const column of PRODUCT_IMPORT_COLUMNS.filter(c => c.required)) {
      expect(rows[0]?.[column.key]).not.toBe("");
    }
  });
});
