/**
 * Data-visualisation tokens.
 *
 * The hex values live in `globals.css` so light and dark swap in one place;
 * everything here refers to them by role. Charts must never hard-code a hex.
 *
 * Both palettes were validated against their own surface for lightness band,
 * chroma floor, colour-vision-deficiency separation, normal-vision separation,
 * and contrast. Re-run that validation before changing any value.
 */

/** Categorical slots, in fixed order. Assign by entity, never by rank. */
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

/** Bar and column geometry, fixed across every chart. */
export const MARKS = {
  /** Never fill the band - the leftover is deliberate air. */
  maxBarSize: 24,
  /** Rounded data-end, square at the baseline. */
  columnRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadius: [0, 4, 4, 0] as [number, number, number, number],
  lineWidth: 2,
  dotRadius: 4,
  /** Surface gap between touching marks, and the ring around dots. */
  gap: 2,
  areaOpacity: 0.1,
} as const;

const COMPACT = new Intl.NumberFormat("en-GH", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const PLAIN = new Intl.NumberFormat("en-GH");

/** Axis ticks and stat-tile values: 1,284 / 12.9K / 4.2M. */
export function compactNumber(value: number): string {
  return Math.abs(value) >= 10_000 ? COMPACT.format(value) : PLAIN.format(value);
}

export function formatMoney(value: number, currency = "GHS"): string {
  return `${currency} ${value.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact money for axis ticks, where two decimals would be noise. */
export function compactMoney(value: number, currency = "GHS"): string {
  return `${currency} ${compactNumber(value)}`;
}
