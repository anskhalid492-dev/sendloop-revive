/**
 * In-memory PostgREST-style client that counts every read/write per table.
 * Supports what scheduleFollowUps uses: select/eq/in/order/range/maybeSingle,
 * update, and upsert with ignoreDuplicates on a composite unique key.
 */
type Row = Record<string, unknown>;

export type Op = { table: string; op: "select" | "update" | "upsert"; rows: number };

export function countingDb(tables: Record<string, Row[]>, unique: Record<string, string[]> = {}) {
  const ops: Op[] = [];
  const from = (table: string) => {
    tables[table] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let ignoreDup = false;
    let range: [number, number] | null = null;
    let single = false;

    const run = () => {
      const rows = tables[table]!;
      if (op === "upsert") {
        const list = Array.isArray(payload) ? payload : [payload!];
        const key = unique[table] ?? [];
        let written = 0;
        for (const r of list) {
          const dup = key.length && rows.some((x) => key.every((k) => x[k] === r[k]));
          if (dup) {
            if (ignoreDup) continue;
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          rows.push({ id: crypto.randomUUID(), ...r });
          written += 1;
        }
        ops.push({ table, op, rows: written });
        return { data: null, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        ops.push({ table, op, rows: matched.length });
        return { data: null, error: null };
      }
      const out = range ? matched.slice(range[0], range[1] + 1) : matched;
      ops.push({ table, op, rows: out.length });
      return { data: single ? (out[0] ?? null) : out, error: null };
    };

    const b: Record<string, unknown> = {
      select: () => b,
      update: (v: Row) => ((op = "update"), (payload = v), b),
      upsert: (v: Row[], o?: { ignoreDuplicates?: boolean }) => (
        (op = "upsert"), (payload = v), (ignoreDup = Boolean(o?.ignoreDuplicates)), b
      ),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      order: () => b,
      limit: () => b,
      range: (a: number, z: number) => ((range = [a, z]), b),
      maybeSingle: () => ((single = true), b),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve().then(run).then(res, rej),
    };
    return b;
  };
  return { tables, ops, client: { from } };
}

export function summarize(ops: Op[]) {
  const sel = (t: string) => ops.filter((o) => o.op === "select" && o.table === t);
  const writes = ops.filter((o) => o.op !== "select");
  return {
    recipientsScanned: sel("campaign_recipients").reduce((n, o) => n + o.rows, 0),
    leadLookups: sel("leads").length,
    leadRowsRead: sel("leads").reduce((n, o) => n + o.rows, 0),
    writeCalls: writes.filter((o) => o.rows > 0).length,
    rowsWritten: writes.reduce((n, o) => n + o.rows, 0),
    jobsCreated: ops.filter((o) => o.op === "upsert").reduce((n, o) => n + o.rows, 0),
  };
}
