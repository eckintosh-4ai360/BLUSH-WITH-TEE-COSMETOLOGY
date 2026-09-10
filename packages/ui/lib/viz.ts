// Data visualization tokens and palettes.

// Categorical palette slots assigned by entity.
export const SERIES = [
  "var(--viz-series-1)",
  "var(--viz-series-2)",
  "var(--viz-series-3)",
  "var(--viz-series-4)",
] as const;

export const VIZ = {
  series: SERIES,
  grid: "var(--viz-grid)",
  axis: "var(--viz-axis)",
  surface: "var(--viz-surface)",
  muted: "var(--viz-muted)",
} as const;

// Bar and column geometry tokens.
export const MARKS = {
  // Maximum fill ratio for chart bands.
  maxBarSize: 24,
  // Border radius for bar data ends.
  columnRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadius: [0, 4, 4, 0] as [number, number, number, number],
  lineWidth: 2,
  dotRadius: 4,
  // Spacing between adjacent chart bars.
  gap: 2,
  areaOpacity: 0.1,
} as const;

const COMPACT = new Intl.NumberFormat("en-GH", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const PLAIN = new Intl.NumberFormat("en-GH");

// Formats metric values with unit suffixes.
export function compactNumber(value: number): string {
  return Math.abs(value) >= 10_000 ? COMPACT.format(value) : PLAIN.format(value);
}

export function formatMoney(value: number, currency = "GHS"): string {
  return `${currency} ${value.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Formats compact currency values for chart axis ticks.
export function compactMoney(value: number, currency = "GHS"): string {
  return `${currency} ${compactNumber(value)}`;
}
