/**
 * Collects every row behind a paginated list query, for export.
 *
 * An export that only covers the page on screen is a trap: the file looks
 * complete and silently omits everything after row 25. The table still pages
 * on the server (§43), so export walks the same filtered query page by page
 * rather than asking for an unbounded result set.
 */

/** The largest page every list procedure accepts (`listInputSchema`). */
const EXPORT_PAGE_SIZE = 100;

/** Ceiling so a mistyped filter cannot page through the whole database. */
export const MAX_EXPORT_ROWS = 20000;

export type ExportPage<T> = { rows: T[]; hasMore: boolean };

export async function collectAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<ExportPage<T>>,
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 1; all.length < MAX_EXPORT_ROWS; page++) {
    const result = await fetchPage(page, EXPORT_PAGE_SIZE);
    all.push(...result.rows);
    // `hasMore` is the server's word on it; the empty check stops a loop that
    // would otherwise spin if a procedure ever reported it wrongly.
    if (!result.hasMore || !result.rows.length) break;
  }

  return all.slice(0, MAX_EXPORT_ROWS);
}
