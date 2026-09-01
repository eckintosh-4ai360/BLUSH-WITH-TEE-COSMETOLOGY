"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileDown,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@blush/ui/components/ui/dropdown-menu";
import { Input } from "@blush/ui/components/ui/input";
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
import { downloadCsv, downloadPdf } from "@/lib/exportTable";

export type Column<T> = {
  key: string;
  header: string;
  /** How the cell renders. Defaults to the raw value at `key`. */
  cell?: (row: T) => ReactNode;
  /** Plain value used for CSV export; defaults to the value at `key`. */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  /** Hidden by default but available from the column menu. */
  optional?: boolean;
  className?: string;
};

export type PaginatedResult<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

type DataTableProps<T> = {
  title: string;
  description?: string;
  columns: Column<T>[];
  data: PaginatedResult<T> | undefined;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: { message: string } | null;
  /** Current search term, owned by the page so it can drive the query. */
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  page: number;
  onPageChange: (page: number) => void;
  /** Filter controls, rendered in one row above the table. */
  filters?: ReactNode;
  actions?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string | number;
  emptyMessage?: string;
  /** Adds CSV/PDF export of every row matching the current filters. */
  exportFileName?: string;
  /** Heading printed on the PDF export; defaults to `title`. */
  pdfTitle?: string;
  /**
   * Fetches every row behind the current filters, so export is not limited to
   * the page on screen. Without it, export falls back to the visible page.
   */
  fetchAllRows?: () => Promise<T[]>;
  /** Summary line under the table, e.g. a filtered total. */
  footer?: ReactNode;
};

/**
 * The one table every admin list uses (§43).
 *
 * Paging, filtering and sorting all happen on the server - this component only
 * reports what the user asked for. It never receives an unbounded result set,
 * so a table with a hundred thousand rows behaves the same as one with ten.
 */
export function DataTable<T>({
  title,
  description,
  columns,
  data,
  isLoading,
  isFetching,
  error,
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  page,
  onPageChange,
  filters,
  actions,
  onRowClick,
  rowKey,
  emptyMessage = "Nothing matches these filters yet.",
  exportFileName,
  pdfTitle,
  fetchAllRows,
  footer,
}: DataTableProps<T>) {
  const [exporting, setExporting] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter(column => column.optional).map(column => column.key)),
  );
  const [draft, setDraft] = useState(search);

  // Debounce typing so each keystroke is not a query.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== search) onSearchChange(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, onSearchChange, search]);

  useEffect(() => setDraft(search), [search]);

  const visible = useMemo(
    () => columns.filter(column => !hidden.has(column.key)),
    [columns, hidden],
  );

  const rows = data?.rows ?? [];
  const showSkeleton = isLoading && !data;

  /**
   * Runs an export over every row matching the current filters, not just the
   * page on screen. Failure is surfaced rather than leaving a silent no-op.
   */
  const runExport = async (write: (rows: T[]) => void | Promise<void>) => {
    setExporting(true);
    try {
      await write(fetchAllRows ? await fetchAllRows() : rows);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "That export could not be produced.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 pr-9"
            aria-label={searchPlaceholder}
          />
          {draft ? (
            <button
              type="button"
              onClick={() => setDraft("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {filters}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Columns3 className="h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columns.map(column => (
              <DropdownMenuCheckboxItem
                key={column.key}
                checked={!hidden.has(column.key)}
                onCheckedChange={checked =>
                  setHidden(current => {
                    const next = new Set(current);
                    if (checked) next.delete(column.key);
                    else next.add(column.key);
                    return next;
                  })
                }
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {exportFileName ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!rows.length || exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                {exporting ? "Exporting..." : "Export"}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {data?.total
                  ? `All ${data.total.toLocaleString("en-GH")} matching rows`
                  : "Matching rows"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  runExport(all => downloadCsv(exportFileName, visible, all))
                }
              >
                <FileDown className="h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  runExport(all => downloadPdf(exportFileName, pdfTitle ?? title, visible, all))
                }
              >
                <FileText className="h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {visible.map(column => (
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
              {showSkeleton ? (
                Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}>
                    {visible.map(column => (
                      <TableCell key={column.key}>
                        <Skeleton className="h-4 w-full max-w-[10rem]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={visible.length} className="py-12 text-center">
                    <p className="text-sm font-medium text-destructive">
                      This list could not be loaded.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell
                    colSpan={visible.length}
                    className="py-14 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(row => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                  >
                    {visible.map(column => (
                      <TableCell
                        key={column.key}
                        className={`${column.align === "right" ? "text-right tabular-nums" : ""} ${column.className ?? ""}`}
                      >
                        {column.cell
                          ? column.cell(row)
                          : String((row as Record<string, unknown>)[column.key] ?? "-")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {isFetching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            ) : data?.total ? (
              <>
                Showing {(data.page - 1) * data.pageSize + 1}
                {"-"}
                {Math.min(data.page * data.pageSize, data.total)} of{" "}
                {data.total.toLocaleString("en-GH")}
              </>
            ) : (
              "No results"
            )}
          </p>

          <div className="flex items-center gap-2">
            {footer}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {data?.page ?? page} of {data?.totalPages ?? 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={!data?.hasMore}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
