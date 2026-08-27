/**
 * CSV and PDF writers shared by every table that exports.
 *
 * These started inside DataTable. They live here because the reports screen
 * needs the same two files from data that never goes through DataTable —
 * summary reports are a handful of computed rows, not a paginated feed — and
 * an export that formats differently depending on which screen produced it is
 * a bug waiting to be reported as one.
 */

export type ExportColumn<T> = {
  key: string;
  header: string;
  /** Plain value for the file; defaults to the value at `key`. */
  value?: (row: T) => string | number | null | undefined;
};

/** A line printed above the table, e.g. the filters a report was run with. */
export type ExportMeta = { label: string; value: string };

function cellValue<T>(row: T, column: ExportColumn<T>): string {
  const raw = column.value
    ? column.value(row)
    : ((row as Record<string, unknown>)[column.key] ?? "");
  return raw === null || raw === undefined ? "" : String(raw);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Quotes every field and defuses formula characters.
 *
 * A cell beginning `=`, `+`, `-` or `@` is executed by Excel and Sheets when
 * the file is opened, so an exported value like `=1+1` — or something worse
 * that a customer typed into a name field — is prefixed with an apostrophe and
 * opens as text (§65).
 */
function escapeCsv(input: unknown): string {
  const raw = input === null || input === undefined ? "" : String(input);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function downloadCsv<T>(
  fileName: string,
  columns: ExportColumn<T>[],
  rows: T[],
  meta: ExportMeta[] = [],
) {
  const preamble = meta.map(entry => `${escapeCsv(entry.label)},${escapeCsv(entry.value)}`);
  const header = columns.map(column => escapeCsv(column.header)).join(",");
  const body = rows.map(row =>
    columns.map(column => escapeCsv(cellValue(row, column))).join(","),
  );

  const lines = [...preamble, ...(preamble.length ? [""] : []), header, ...body];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}-${stamp()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Landscape PDF with a title block naming what was run, by whom and when
 * (§42).
 *
 * jsPDF is imported on demand so screens that never export one do not carry
 * it, and so the reports page stays quick to open.
 */
export async function downloadPdf<T>(
  fileName: string,
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  meta: ExportMeta[] = [],
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: columns.length > 5 ? "landscape" : "portrait" });
  const generatedAt = new Date();

  doc.setFontSize(14);
  doc.setTextColor(40, 35, 48);
  doc.text(title, 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(130, 122, 138);
  doc.text(
    `Exported ${generatedAt.toLocaleString("en-GB")} · ${rows.length} row${rows.length === 1 ? "" : "s"}`,
    14,
    22,
  );

  let cursor = 22;
  for (const entry of meta) {
    cursor += 5;
    doc.text(`${entry.label}: ${entry.value}`, 14, cursor);
  }

  autoTable(doc, {
    startY: cursor + 5,
    head: [columns.map(column => column.header)],
    body: rows.map(row => columns.map(column => cellValue(row, column))),
    styles: { fontSize: 8, cellPadding: 3, textColor: [70, 62, 78] },
    headStyles: { fillColor: [95, 82, 119], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 244, 249] },
    // Page numbers, so a printed report cannot be quietly reordered.
    didDrawPage: data => {
      const pageCount = doc.getNumberOfPages();
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor(150, 145, 155);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageSize.getWidth() - 14,
        pageSize.getHeight() - 8,
        { align: "right" },
      );
    },
  });

  doc.save(`${fileName}-${stamp()}.pdf`);
}
