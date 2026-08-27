/**
 * CSV reading and template writing for bulk import.
 *
 * Hand-written rather than pulled from a library because the requirement is
 * small and fixed — RFC 4180 with a header row — and because the failure modes
 * that matter here are the ones a naive `split(",")` gets wrong on real
 * spreadsheet exports:
 *
 *   A quoted field containing a comma        "Osu, Accra"
 *   A quoted field containing a newline      "Line one\nLine two"
 *   An escaped quote inside a quoted field   "She said ""yes"""
 *   A byte-order mark Excel writes first     ﻿SKU,Name
 *   Windows line endings                     \r\n
 *
 * Each of those silently corrupts a row rather than failing loudly, which is
 * the worst way for an import to go wrong.
 */

import {
  headerLookup,
  normaliseHeader,
  type ImportColumn,
} from "@blush/shared/imports";

export type ParsedCsv = {
  /** Headings exactly as they appeared, for reporting unknown columns. */
  headers: string[];
  rows: string[][];
};

/** Splits CSV text into rows of raw cells. Blank lines are dropped. */
export function parseCsv(text: string): ParsedCsv {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];

  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };

  const endRow = () => {
    endField();
    // A trailing newline produces one empty cell, which is not a row.
    if (row.length > 1 || row[0]?.trim() !== "") rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      endField();
      index += 1;
      continue;
    }

    if (char === "\r") {
      // Treat \r\n and a lone \r as one break.
      if (input[index + 1] === "\n") index += 1;
      endRow();
      index += 1;
      continue;
    }

    if (char === "\n") {
      endRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // Whatever is left when the text runs out is the final row.
  if (field !== "" || row.length) endRow();

  const [headers = [], ...body] = rows;
  return { headers, rows: body };
}

export type MappedRows = {
  rows: Array<Record<string, string>>;
  /** Required columns the file does not have. */
  missingColumns: string[];
  /** Headings present in the file that mean nothing to us. */
  unknownColumns: string[];
};

/**
 * Turns parsed cells into field objects using a column spec.
 *
 * A row shorter than the header is padded rather than rejected: spreadsheets
 * routinely omit trailing empty cells, and treating that as malformed would
 * reject files that are perfectly readable.
 */
export function mapRows(parsed: ParsedCsv, columns: ImportColumn[]): MappedRows {
  const lookup = headerLookup(columns);

  const keyByIndex = parsed.headers.map(header => lookup.get(normaliseHeader(header)) ?? null);

  const present = new Set(keyByIndex.filter((key): key is string => key !== null));

  const missingColumns = columns
    .filter(column => column.required && !present.has(column.key))
    .map(column => column.header);

  const unknownColumns = parsed.headers.filter(
    (header, position) => keyByIndex[position] === null && header.trim() !== "",
  );

  const rows = parsed.rows
    .map(cells => {
      const row: Record<string, string> = {};
      keyByIndex.forEach((key, position) => {
        if (key) row[key] = (cells[position] ?? "").trim();
      });
      return row;
    })
    // A row where every mapped cell is blank is spreadsheet padding, not data.
    .filter(row => Object.values(row).some(value => value !== ""));

  return { rows, missingColumns, unknownColumns };
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Builds the downloadable template: the headings, then one example row.
 *
 * The example is real data rather than placeholder text, so it can be edited
 * in place instead of deleted and retyped, and so the expected date and number
 * formats are visible rather than described.
 */
export function buildTemplateCsv(columns: ImportColumn[]): string {
  const headers = columns.map(column => escapeCsv(column.header)).join(",");
  const example = columns.map(column => escapeCsv(column.example)).join(",");
  return `${headers}\n${example}\n`;
}

/** Hands the browser a file. Excel needs the BOM to read UTF-8 correctly. */
export function downloadTemplate(fileName: string, columns: ImportColumn[]) {
  const blob = new Blob(["﻿", buildTemplateCsv(columns)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
