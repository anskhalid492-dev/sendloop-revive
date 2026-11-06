/** Isolated throwaway-account fixture; never connects to a real backend. */
export function messageDb(tables: Record<string, Record<string, unknown>[]>, updates: Record<string, unknown>[] = [], beforeWrite?: () => void) {
  return { from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let patch: Record<string, unknown> | undefined;
    let ran = false;
    const run = () => {
      if (patch && !ran) beforeWrite?.();
      const rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
      if (patch && !ran) {
        for (const row of rows) { updates.push({ id: row.id, ...patch }); Object.assign(row, patch); }
        ran = true;
      }
      return { data: rows, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, lte: () => api,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return api; },
      is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return api; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return api; },
      update: (value: Record<string, unknown>) => { patch = value; return api; },
      maybeSingle: async () => { const result = run(); return { ...result, data: result.data[0] ? { ...result.data[0] } : null }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return api;
  } };
}