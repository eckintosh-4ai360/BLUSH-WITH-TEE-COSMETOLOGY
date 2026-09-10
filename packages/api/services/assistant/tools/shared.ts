import { and, ilike, or, type SQL } from "drizzle-orm";

// Small helpers shared by every tool in the catalogue.

type Searchable = Parameters<typeof ilike>[0];

// More than this and the query costs more than the extra precision is worth.
const MAX_SEARCH_WORDS = 6;

// Matches a search phrase word by word across several columns.
export function matchesWords(columns: Searchable[], term: string): SQL | undefined {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS);
  if (!words.length || !columns.length) return undefined;

  return and(
    ...words.map(word => or(...columns.map(column => ilike(column, likeTerm(word))))!),
  );
}

// Escapes a caller-supplied search term for ilike.
export function likeTerm(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

// Midnight, days ago - the start of a rolling window.
export function since(now: Date, days: number): Date {
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return from;
}

// The first moment of the current month.
export function startOfThisMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// Postgres date columns compare against a plain ISO day.
export function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
