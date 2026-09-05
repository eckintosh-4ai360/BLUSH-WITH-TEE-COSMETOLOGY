import { and, ilike, or, type SQL } from "drizzle-orm";

/** Small helpers shared by every tool in the catalogue. */

type Searchable = Parameters<typeof ilike>[0];

/** More than this and the query costs more than the extra precision is worth. */
const MAX_SEARCH_WORDS = 6;

/**
 * Matches a search phrase word by word across several columns.
 *
 * A single `ilike '%ultimate cosmetology%'` looks reasonable and fails on the
 * first real question: the course is called "Ultimate Full Cosmetology Course",
 * so the phrase never appears and the assistant reports there is no such
 * course. Requiring each word somewhere in the row, rather than all of them
 * adjacently, is what the person asking meant.
 */
export function matchesWords(columns: Searchable[], term: string): SQL | undefined {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS);
  if (!words.length || !columns.length) return undefined;

  return and(
    ...words.map(word => or(...columns.map(column => ilike(column, likeTerm(word))))!),
  );
}

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
