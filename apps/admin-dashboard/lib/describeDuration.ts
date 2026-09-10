// A course length in the words the school advertises it in.
export function describeDuration(weeks: number): string {
  if (!Number.isFinite(weeks) || weeks < 1) return "\u2014";

  if (weeks % 52 === 0) return plural(weeks / 52, "year");

  if (weeks % 4 === 0) {
    const months = weeks / 4;
    return months % 12 === 0 ? plural(months / 12, "year") : plural(months, "month");
  }

  return plural(weeks, "week");
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// The distinct lengths on offer, shortest first, ready for a filter menu.
export function durationFilterOptions(
  programmes: { durationWeeks: number }[] | undefined,
): { weeks: number; label: string }[] {
  const weeks = [...new Set((programmes ?? []).map(item => item.durationWeeks))]
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return weeks.map(value => ({ weeks: value, label: describeDuration(value) }));
}
