// Collects every row behind a paginated list query, for export.
const EXPORT_PAGE_SIZE = 100;

// Ceiling so a mistyped filter cannot page through the whole database.
export const MAX_EXPORT_ROWS = 20000;

export type ExportPage<T> = { rows: T[]; hasMore: boolean };

export async function collectAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<ExportPage<T>>,
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 1; all.length < MAX_EXPORT_ROWS; page++) {
    const result = await fetchPage(page, EXPORT_PAGE_SIZE);
    all.push(...result.rows);
    // HasMore is the server's word on it.
    if (!result.hasMore || !result.rows.length) break;
  }

  return all.slice(0, MAX_EXPORT_ROWS);
}
