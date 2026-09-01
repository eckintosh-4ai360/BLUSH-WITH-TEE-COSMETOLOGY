/**
 * A course length in the words the school advertises it in.
 *
 * The timetable is built in weeks, but the prospectus says "three months" and
 * "one year", and the Programmes screen is the prospectus. A year is worth
 * checking for twice: the one-year course is timetabled as 48 teaching weeks,
 * not 52, so it arrives here as twelve months rather than as a year.
 */
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

/**
 * The distinct lengths on offer, shortest first, ready for a filter menu.
 *
 * Built from the programmes themselves rather than a fixed list, so a filter
 * never offers a length nothing is taught in - and a new programme of a new
 * length appears without anyone remembering to add it here.
 */
export function durationFilterOptions(
  programmes: { durationWeeks: number }[] | undefined,
): { weeks: number; label: string }[] {
  const weeks = [...new Set((programmes ?? []).map(item => item.durationWeeks))]
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return weeks.map(value => ({ weeks: value, label: describeDuration(value) }));
}
