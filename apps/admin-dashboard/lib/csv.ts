// CSV reading and template writing for bulk import.

import {
  headerLookup,
  normaliseHeader,
  type ImportColumn,
} from "@blush/shared/imports";

export type ParsedCsv = {
  // Headings exactly as they appeared, for reporting unknown columns.
  headers: string[];
  rows: string[][];
};

// Splits CSV text into rows of raw cells.
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
  // Required columns the file does not have.
  missingColumns: string[];
  // Headings present in the file that mean nothing to us.
  unknownColumns: string[];
};

// Turns parsed cells into field objects using a column spec.
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

// Builds the downloadable template.
export function buildTemplateCsv(columns: ImportColumn[]): string {
  const headers = columns.map(column => escapeCsv(column.header)).join(",");
  const example = columns.map(column => escapeCsv(column.example)).join(",");
  return `${headers}\n${example}\n`;
}

// Hands the browser a file.
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
