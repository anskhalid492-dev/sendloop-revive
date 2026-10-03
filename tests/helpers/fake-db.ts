/**
 * Minimal in-memory PostgREST-style client for automation tests. Records
 * every write so tests can prove a code path wrote nothing. Supports the
 * subset used by the automation engine: select/eq/neq/in/is/order/limit/
 * maybeSingle/insert/update/or(ignored), count head queries and unique keys.
 */
type Row = Record<string, unknown>;

export type FakeDb = {
  tables: Record<string, Row[]>;
  writes: { table: string; op: "insert" | "update" | "delete" | "rpc"; value: unknown }[];
  client: unknown;
};

export function fakeDb(tables: Record<string, Row[]>, unique: Record<string, string[]> = {}): FakeDb {
  const writes: FakeDb["writes"] = [];
  const get = (row: Row, key: string) => {
    if (key.includes("->>")) {
      const [col, prop] = key.split("->>");
      return ((row[col!] ?? {}) as Row)[prop!];
    }
    return row[key];
  };

  const from = (table: string) => {
    tables[table] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | Row[] | null = null;
    let limit = Infinity;
    let head = false;
    let returning = false;
    let single = false;

    const run = () => {
      const rows = tables[table]!;
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload!];
        for (const r of list) {
          for (const key of unique[table] ?? []) {
            if (rows.some((x) => x[key] === r[key])) return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
        }
        const inserted = list.map((r) => ({ id: r["id"] ?? crypto.randomUUID(), ...r }));
        rows.push(...inserted);
        writes.push({ table, op: "insert", value: inserted });
        return { data: single ? inserted[0] : inserted, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        if (matched.length) writes.push({ table, op: "update", value: payload });
        return { data: returning ? matched : null, error: null };
      }
      const out = matched.slice(0, limit);
      if (head) return { data: null, count: matched.length, error: null };
      return { data: single ? (out[0] ?? null) : out, count: matched.length, error: null };
    };

    const b: Record<string, unknown> = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (op !== "select") returning = true;
        if (opts?.head) head = true;
        return b;
      },
      insert: (v: Row | Row[]) => ((op = "insert"), (payload = v), b),
      update: (v: Row) => ((op = "update"), (payload = v), b),
      eq: (k: string, v: unknown) => (filters.push((r) => get(r, k) === v), b),
      neq: (k: string, v: unknown) => (filters.push((r) => get(r, k) !== v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(get(r, k))), b),
      is: (k: string, v: unknown) => (filters.push((r) => (get(r, k) ?? null) === v), b),
      or: () => b,
      order: () => b,
      limit: (n: number) => ((limit = n), b),
      maybeSingle: () => ((single = true), b),
      single: () => ((single = true), b),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
    };
    return b;
  };

  const client = {
    from,
    rpc: async (name: string, args: unknown) => {
      writes.push({ table: name, op: "rpc", value: args });
      return { data: [], error: null };
    },
  };
  return { tables, writes, client };
}
