"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

export type SeriesKey = {
  key: string;
  label: string;
  color: string;
  /** Rendered per cell in the table view; defaults to a plain number. */
  format?: (value: number) => string;
};

type ChartFrameProps = {
  title: string;
  subtitle?: string;
  /** Identity channel. Always shown for two or more series. */
  series: SeriesKey[];
  /** Rows behind the plot, exposed as an accessible table on demand. */
  rows?: Array<Record<string, string | number>>;
  categoryKey?: string;
  categoryLabel?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Shared chart shell: heading, legend, and a table view of the same numbers.
 *
 * The table is not decoration - it is the relief path for readers who cannot
 * separate two marks by colour, and the accessible equivalent of the plot.
 */
export function ChartFrame({
  title,
  subtitle,
  series,
  rows,
  categoryKey = "label",
  categoryLabel = "Period",
  isLoading,
  isEmpty,
  emptyMessage = "No data for this period yet.",
  action,
  className,
  children,
}: ChartFrameProps) {
  const [showTable, setShowTable] = React.useState(false);
  const tableId = React.useId();
  const canShowTable = Boolean(rows?.length);

  return (
    <section
      className={cn(
        "admin-glass-card rounded-[1.45rem] border p-5 sm:p-6",
        className
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {canShowTable ? (
            <button
              type="button"
              onClick={() => setShowTable(value => !value)}
              aria-expanded={showTable}
              aria-controls={tableId}
              className="rounded-full border border-white/70 bg-white/45 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showTable ? "Show chart" : "Show table"}
            </button>
          ) : null}
        </div>
      </header>

      {/* A single series is named by the title; a legend box would restate it. */}
      {series.length > 1 ? (
        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {series.map(item => (
            <li
              key={item.key}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-[1.15rem] bg-white/55" />
        ) : isEmpty ? (
          <p className="flex h-[260px] items-center justify-center rounded-[1.15rem] border border-white/60 bg-white/35 px-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : showTable && rows ? (
          <ChartTable
            id={tableId}
            rows={rows}
            series={series}
            categoryKey={categoryKey}
            categoryLabel={categoryLabel}
          />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function ChartTable({
  id,
  rows,
  series,
  categoryKey,
  categoryLabel,
}: {
  id: string;
  rows: Array<Record<string, string | number>>;
  series: SeriesKey[];
  categoryKey: string;
  categoryLabel: string;
}) {
  return (
    <div
      id={id}
      className="max-h-[260px] overflow-auto rounded-[1.15rem] border border-white/60 bg-white/35"
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-muted/70 backdrop-blur">
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-left font-medium text-muted-foreground first:pl-4 last:pr-4"
            >
              {categoryLabel}
            </th>
            {series.map(item => (
              <th
                key={item.key}
                scope="col"
                className="px-3 py-2 text-right font-medium text-muted-foreground first:pl-4 last:pr-4"
              >
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border/50">
              <th
                scope="row"
                className="px-3 py-2 text-left font-normal text-foreground first:pl-4 last:pr-4"
              >
                {String(row[categoryKey] ?? "-")}
              </th>
              {series.map(item => {
                const value = Number(row[item.key] ?? 0);
                return (
                  <td
                    key={item.key}
                    className="px-3 py-2 text-right tabular-nums text-foreground first:pl-4 last:pr-4"
                  >
                    {item.format
                      ? item.format(value)
                      : value.toLocaleString("en-GH")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hover card shared by every chart, so tooltips read identically everywhere. */
export function VizTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    dataKey?: string | number;
    value?: number;
    color?: string;
  }>;
  label?: string | number;
  format?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-white/70 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl dark:border-border/70 dark:bg-popover/90">
      {label != null ? (
        <p className="mb-1.5 text-xs font-medium text-foreground">
          {String(label)}
        </p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li
            key={`${entry.dataKey}-${index}`}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="mr-2">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {format
                ? format(Number(entry.value ?? 0))
                : Number(entry.value ?? 0).toLocaleString("en-GH")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
