import type { LowStockRow } from "./lowStock";

/**
 * The low-stock report, as a PDF, built on the server.
 *
 * The dashboard already exports tables to PDF from the browser (see
 * `lib/exportTable.ts`), and this deliberately looks like those: same title
 * block, same table styling, same page numbering. An alert a shopkeeper opens
 * on their phone at six in the morning should not look like a different
 * system's document from the one they export at their desk.
 *
 * jsPDF is imported on demand. This runs a few times a week at most, and a
 * serverless function should not carry a PDF engine into every request that
 * merely records a sale.
 */

/** Currency, written the way the rest of the dashboard writes it. */
function cedis(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
}

export type LowStockPdfMeta = {
  schoolName: string;
  generatedAt: Date;
  /** Who pressed the button, when a person did. */
  requestedBy?: string | null;
};

export async function buildLowStockPdf(
  rows: LowStockRow[],
  meta: LowStockPdfMeta,
): Promise<Buffer> {
  // The named export, not the default: under a plain Node ESM loader `default`
  // is the CommonJS namespace object rather than the constructor, and this
  // module is run by the test suite as well as by the bundler.
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule.autoTable;

  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.setTextColor(40, 35, 48);
  doc.text(`${meta.schoolName} - low stock report`, 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(130, 122, 138);
  doc.text(
    `Generated ${meta.generatedAt.toLocaleString("en-GB")} · ${rows.length} item${rows.length === 1 ? "" : "s"} at or below reorder level`,
    14,
    22,
  );

  let cursor = 22;
  if (meta.requestedBy) {
    cursor += 5;
    doc.text(`Requested by: ${meta.requestedBy}`, 14, cursor);
  }

  const totalShortfall = rows.reduce((sum, row) => sum + row.shortfall, 0);
  const restockValue = rows.reduce((sum, row) => sum + row.shortfall * row.unitCost, 0);

  cursor += 5;
  doc.text(
    `Units needed to reach reorder level: ${totalShortfall} · Approximate cost at last unit cost: ${cedis(restockValue)}`,
    14,
    cursor,
  );

  autoTable(doc, {
    startY: cursor + 5,
    head: [
      ["SKU", "Item", "Category", "Supplier", "On hand", "Reorder at", "Short by", "Unit cost"],
    ],
    body: rows.map(row => [
      row.sku,
      row.name,
      row.category,
      row.supplier ?? "-",
      String(row.quantityOnHand),
      String(row.reorderLevel),
      String(row.shortfall),
      cedis(row.unitCost),
    ]),
    styles: { fontSize: 8, cellPadding: 3, textColor: [70, 62, 78] },
    headStyles: { fillColor: [95, 82, 119], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 244, 249] },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    // An item that is completely gone is not the same problem as one that is
    // merely getting low, and the person reading this is deciding what to buy
    // first.
    didParseCell: data => {
      if (data.section === "body" && data.column.index === 4 && data.cell.raw === "0") {
        data.cell.styles.textColor = [176, 42, 55];
        data.cell.styles.fontStyle = "bold";
      }
    },
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

  return Buffer.from(doc.output("arraybuffer"));
}
