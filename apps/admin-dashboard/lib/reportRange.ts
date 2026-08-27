/**
 * The date window a report is run for.
 *
 * Presets rather than two date pickers by default, because the windows people
 * actually ask for are the same handful every time, and "this month" typed as
 * two dates is a chance to get one of them wrong.
 */

export type RangeKey =
  | "this_month"
  | "last_month"
  | "last_3"
  | "last_6"
  | "last_12"
  | "this_year"
  | "all";

export const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3", label: "Last 3 months" },
  { key: "last_6", label: "Last 6 months" },
  { key: "last_12", label: "Last 12 months" },
  { key: "this_year", label: "This year" },
  { key: "all", label: "All time" },
];

export type ResolvedRange = { dateFrom?: Date; dateTo?: Date; label: string };

/**
 * Turns a preset into concrete bounds.
 *
 * `dateTo` is the last millisecond of the final day, not midnight at its
 * start — a report run for "this month" on the 20th must include everything
 * recorded on the 20th, and an exclusive midnight bound silently drops it.
 */
export function resolveRange(key: RangeKey, now = new Date()): ResolvedRange {
  const label = RANGE_OPTIONS.find(option => option.key === key)?.label ?? "All time";
  const startOfMonth = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  switch (key) {
    case "this_month":
      return { dateFrom: startOfMonth(0), dateTo: endOfToday, label };
    case "last_month":
      return {
        dateFrom: startOfMonth(-1),
        // The last millisecond before this month begins.
        dateTo: new Date(startOfMonth(0).getTime() - 1),
        label,
      };
    case "last_3":
      return { dateFrom: startOfMonth(-2), dateTo: endOfToday, label };
    case "last_6":
      return { dateFrom: startOfMonth(-5), dateTo: endOfToday, label };
    case "last_12":
      return { dateFrom: startOfMonth(-11), dateTo: endOfToday, label };
    case "this_year":
      return {
        dateFrom: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        dateTo: endOfToday,
        label,
      };
    case "all":
    default:
      return { label };
  }
}

/** How the window is described on the exported file. */
export function describeRange(range: ResolvedRange): string {
  if (!range.dateFrom && !range.dateTo) return "All time";
  const format = (value: Date) => value.toLocaleDateString("en-GB");
  if (range.dateFrom && range.dateTo) {
    return `${format(range.dateFrom)} to ${format(range.dateTo)}`;
  }
  return range.dateFrom ? `From ${format(range.dateFrom)}` : `Up to ${format(range.dateTo as Date)}`;
}
