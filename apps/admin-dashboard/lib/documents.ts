// Branded printable documents,,.

import type { jsPDF } from "jspdf";

export type SchoolProfile = {
  name?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
};

export type DocumentMeta = {
  // Sits under the letterhead, e.
  title: string;
  // The document's own number, printed top right.
  reference?: string;
  // Who ran it, recorded on the page so a printout is attributable.
  generatedBy?: string;
  // Short lines under the title, e.
  summary?: Array<[string, string]>;
  // Closing line, e.
  footerNote?: string;
  orientation?: "portrait" | "landscape";
};

export type DocumentTable = {
  caption?: string;
  head: string[];
  body: Array<Array<string | number>>;
  // Column indices rendered right-aligned, for money and counts.
  numericColumns?: number[];
  // Bold summary rows appended under the body, e.
  foot?: Array<Array<string | number>>;
};

const INK = { heading: [40, 35, 48], body: [70, 62, 78], muted: [130, 122, 138] } as const;
const BRAND: [number, number, number] = [95, 82, 119];

// GHS with thousands separators, matching what the tables on screen show.
export function money(value: number): string {
  return `GHS ${value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function documentDate(value: Date | string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

function drawLetterhead(doc: jsPDF, school: SchoolProfile, meta: DocumentMeta): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND);
  doc.text(school.name || "Blush With Tee", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK.muted);

  const contact = [school.address, school.phone, school.email, school.website]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) doc.text(contact, 14, 24);
  if (school.registrationNumber) {
    doc.text(`Reg. ${school.registrationNumber}`, 14, 28.5);
  }

  // Title on the left, the document's own reference on the right, so the eye finds the number.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK.heading);
  doc.text(meta.title, 14, 40);

  if (meta.reference) {
    doc.setFontSize(10);
    doc.text(meta.reference, pageWidth - 14, 40, { align: "right" });
  }

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.line(14, 43, pageWidth - 14, 43);

  let y = 50;

  if (meta.summary?.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const [label, value] of meta.summary) {
      doc.setTextColor(...INK.muted);
      doc.text(`${label}:`, 14, y);
      doc.setTextColor(...INK.body);
      doc.text(String(value), 45, y);
      y += 5.5;
    }
    y += 2;
  }

  return y;
}

// Footer on every page.
function drawFooters(doc: jsPDF, meta: DocumentMeta) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-GB");

  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK.muted);

    const left = meta.generatedBy
      ? `Generated ${generated} by ${meta.generatedBy}`
      : `Generated ${generated}`;
    doc.text(left, 14, pageHeight - 10);
    doc.text(`Page ${page} of ${total}`, pageWidth - 14, pageHeight - 10, { align: "right" });

    if (meta.footerNote && page === total) {
      doc.setFontSize(8.5);
      doc.setTextColor(...INK.body);
      doc.text(meta.footerNote, 14, pageHeight - 17);
    }
  }
}

// Builds a branded document and saves it.
export async function renderDocument({
  fileName,
  school,
  meta,
  tables = [],
  afterTables,
}: {
  fileName: string;
  school: SchoolProfile;
  meta: DocumentMeta;
  tables?: DocumentTable[];
  afterTables?: (doc: jsPDF, y: number) => void;
}): Promise<void> {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new JsPDF({ orientation: meta.orientation ?? "portrait" });
  let y = drawLetterhead(doc, school, meta);

  for (const table of tables) {
    if (table.caption) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK.heading);
      doc.text(table.caption, 14, y);
      y += 3;
    }

    const rightAligned = Object.fromEntries(
      (table.numericColumns ?? []).map(index => [index, { halign: "right" as const }]),
    );

    autoTable(doc, {
      startY: y + 2,
      head: [table.head],
      body: table.body.map(row => row.map(cell => String(cell))),
      foot: table.foot?.map(row => row.map(cell => String(cell))),
      styles: { fontSize: 8, cellPadding: 3, textColor: [...INK.body] },
      headStyles: { fillColor: [...BRAND], textColor: 255 },
      footStyles: { fillColor: [247, 244, 249], textColor: [...INK.heading], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 248, 251] },
      columnStyles: rightAligned,
      margin: { left: 14, right: 14 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  afterTables?.(doc, y);
  drawFooters(doc, meta);

  doc.save(`${fileName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Signature line, used by letters and certificates.
export function drawSignature(
  doc: jsPDF,
  y: number,
  name: string,
  title: string,
): void {
  doc.setDrawColor(...INK.muted);
  doc.setLineWidth(0.3);
  doc.line(14, y, 74, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK.heading);
  doc.text(name, 14, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK.muted);
  doc.text(title, 14, y + 9.5);
}
