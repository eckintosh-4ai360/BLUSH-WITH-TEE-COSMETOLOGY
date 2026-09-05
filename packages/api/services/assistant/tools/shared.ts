/** Small helpers shared by every tool in the catalogue. */

/**
 * Escapes a caller-supplied search term for `ilike`.
 *
 * The value comes from a language model reading a member of staff, so it can
 * contain anything. Without this a stray `%` turns a name search into a table
 * scan that matches everybody.
 */
export function likeTerm(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

/** Midnight, `days` ago - the start of a rolling window. */
export function since(now: Date, days: number): Date {
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return from;
}

/** The first moment of the current month. */
export function startOfThisMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Postgres `date` columns compare against a plain ISO day. */
export function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
