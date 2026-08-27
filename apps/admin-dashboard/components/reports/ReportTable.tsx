"use client";

import { useState, type ReactNode } from "react";
import { FileDown, FileText, Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Card } from "@blush/ui/components/ui/card";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blush/ui/components/ui/table";
import {
  downloadCsv,
  downloadPdf,
  type ExportColumn,
  type ExportMeta,
} from "@/lib/exportTable";

export type ReportColumn<T> = ExportColumn<T> & {
  cell?: (row: T) => ReactNode;
  align?: "left" | "right";
};

/**
 * A summary report: every row at once, with the same CSV and PDF export the
 * paginated tables offer.
 *
 * Deliberately not DataTable. These reports are aggregates — a dozen rows of
 * arithmetic across the whole database — so paging, per-column search and
 * server sorting would be machinery with nothing to do. What they do share is
 * the export, which comes from the same module either way.
 */
export function ReportTable<T>({
  title,
  description,
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  exportFileName,
  meta = [],
  footer,
  emptyMessage = "Nothing to report for this period.",
}: {
  title: string;
  description?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  error?: { message: string } | null;
  exportFileName: string;
  /** Printed above the table in the exported file, e.g. the date range used. */
  meta?: ExportMeta[];
  /** Totals row rendered under the table. */
  footer?: ReactNode;
  emptyMessage?: string;
}) {
  const [exporting, setExporting] = useState(false);

  const runExport = async (write: () => void | Promise<void>) => {
    if (!rows.length) {
      toast.error("There is nothing to export yet.");
      return;
    }
    setExporting(true);
    try {
      await write();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "That export could not be produced.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={exporting || isLoading}
            onClick={() => runExport(() => downloadCsv(exportFileName, columns, rows, meta))}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={exporting || isLoading}
            onClick={() =>
              runExport(() => downloadPdf(exportFileName, title, columns, rows, meta))
            }
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="p-6 text-sm text-destructive">
          {error.message}
        </p>
      ) : !rows.length ? (
        <p className="p-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(column => (
                  <TableHead
                    key={column.key}
                    className={column.align === "right" ? "text-right" : undefined}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={rowKey(row)}>
                  {columns.map(column => (
                    <TableCell
                      key={column.key}
                      className={
                        column.align === "right" ? "text-right tabular-nums" : undefined
                      }
                    >
                      {column.cell
                        ? column.cell(row)
                        : String((row as Record<string, unknown>)[column.key] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {footer && !isLoading && rows.length ? (
        <div className="border-t border-border/60 bg-muted/30 px-5 py-3 text-sm">{footer}</div>
      ) : null}
    </Card>
  );
}
