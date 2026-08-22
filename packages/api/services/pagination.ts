import { z } from "zod";

/**
 * Shared list-query contract (§43). Every admin table paginates, filters and
 * sorts on the server - the client never receives an unbounded result set.
 */
export const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().max(48).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type ListInput = z.infer<typeof listInputSchema>;

export type Paginated<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function paginationBounds(input: Pick<ListInput, "page" | "pageSize">) {
  const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
  const page = Math.max(input.page, 1);
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
}

export function paginate<T>(
  rows: T[],
  total: number,
  input: Pick<ListInput, "page" | "pageSize">,
): Paginated<T> {
  const { page, pageSize } = paginationBounds(input);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  return { rows, page, pageSize, total, totalPages, hasMore: page < totalPages };
}

/**
 * Escapes a user search term for a SQL LIKE pattern so `%` and `_` typed by a
 * user match literally instead of turning into wildcards.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

/** Resolves a client-supplied sort key against an allow-list of columns. */
export function resolveSort<T extends Record<string, unknown>>(
  columns: T,
  sortBy: string | undefined,
  fallback: keyof T,
): T[keyof T] {
  if (sortBy && sortBy in columns) return columns[sortBy as keyof T];
  return columns[fallback];
}
