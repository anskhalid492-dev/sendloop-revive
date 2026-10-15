/**
 * Batching helpers for PostgREST reads.
 *
 * Two hard limits bite on large campaigns:
 *  1. `in.(...)` filters travel in the URL. Roughly 1,000 UUIDs produce a ~37KB
 *     URL, which the API gateway rejects with a bare HTTP 400 "Bad Request".
 *  2. A plain `select()` returns at most 1,000 rows, silently truncating.
 *
 * `chunk` keeps every `in.()` filter small; `fetchAllRows` pages through a
 * query so counts and id sets are complete.
 */

/** Safe number of ids per `in.()` filter (~150 UUIDs ≈ 5.6KB URL). */
export const ID_FILTER_CHUNK = 150;

/** PostgREST page size used when reading every row of a table slice. */
export const ROW_PAGE_SIZE = 1000;

export function chunk<T>(items: readonly T[], size: number = ID_FILTER_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[]);
  return out;
}

/**
 * Read every row of a query by paging with `.range()`.
 * `build` must return a fresh query builder on each call.
 */
export async function fetchAllRows<Row>(
  // The generated Supabase types make these generic builders very noisy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
  pageSize: number = ROW_PAGE_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Run an id-filtered read in URL-safe chunks and concatenate the results.
 * `build` receives one chunk of ids at a time.
 */
export async function fetchByIds<Row>(
  ids: readonly string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (idChunk: string[]) => any,
  size: number = ID_FILTER_CHUNK,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const idChunk of chunk(ids, size)) {
    const { data, error } = await build(idChunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

/**
 * Like `fetchByIds`, but pages every chunk with `.range()` so a chunk that
 * matches more than one PostgREST page (1,000 rows) is never truncated.
 */
export async function fetchAllByIds<Row>(
  ids: readonly string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (idChunk: string[]) => any,
  size: number = ID_FILTER_CHUNK,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const idChunk of chunk(ids, size)) {
    rows.push(...(await fetchAllRows<Row>(() => build(idChunk))));
  }
  return rows;
}
