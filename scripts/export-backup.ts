/**
 * MANUAL DATA EXPORT (backup) — read-only.
 *
 * Writes every row of every public table to newline-delimited JSON files,
 * one file per table, plus a manifest with row counts.
 *
 * It NEVER writes to the database. Safe to run against production.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   [OUT_DIR=/mnt/documents/backups] \
 *   [ONLY=leads,campaigns] \
 *   bun scripts/export-backup.ts
 */
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL_ = must("SUPABASE_URL");
const KEY = must("SUPABASE_SERVICE_ROLE_KEY");
const PAGE = 1000;
const ONLY = (process.env["ONLY"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function must(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(2);
  }
  return v;
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/** Discover tables from the PostgREST OpenAPI document (no schema access needed). */
async function listTables(): Promise<string[]> {
  const res = await fetch(`${URL_}/rest/v1/`, { headers });
  if (!res.ok) throw new Error(`Table discovery failed: ${res.status} ${await res.text()}`);
  const spec = (await res.json()) as { paths?: Record<string, unknown> };
  return Object.keys(spec.paths ?? {})
    .filter((p) => p.startsWith("/") && p.length > 1 && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .filter((t) => (ONLY.length === 0 ? true : ONLY.includes(t)))
    .sort();
}

async function exportTable(table: string, dir: string): Promise<number> {
  const file = join(dir, `${table}.ndjson`);
  const out = createWriteStream(file, { flags: "w" });
  let offset = 0;
  let total = 0;

  for (;;) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
      headers: { ...headers, Range: `${offset}-${offset + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) {
      out.end();
      throw new Error(`${table}: ${res.status} ${await res.text()}`);
    }
    const rows = (await res.json()) as unknown[];
    for (const row of rows) out.write(`${JSON.stringify(row)}\n`);
    total += rows.length;
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });
  return total;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = process.env["OUT_DIR"] ?? "/mnt/documents/backups";
  const dir = join(root, stamp);
  mkdirSync(dir, { recursive: true });

  const tables = await listTables();
  console.log(`Exporting ${tables.length} tables to ${dir}`);

  const counts: Record<string, number> = {};
  const failures: Array<{ table: string; error: string }> = [];

  for (const table of tables) {
    try {
      const n = await exportTable(table, dir);
      counts[table] = n;
      console.log(`  ok    ${table} — ${n} rows`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ table, error: msg });
      console.log(`  FAIL  ${table} — ${msg}`);
    }
  }

  const manifest = {
    exported_at: new Date().toISOString(),
    source_url: URL_,
    format: "ndjson (one JSON object per line)",
    table_count: Object.keys(counts).length,
    row_total: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    failures,
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nDone. ${manifest.row_total} rows across ${manifest.table_count} tables.`);
  console.log(`Manifest: ${join(dir, "manifest.json")}`);
  if (failures.length > 0) {
    console.log(`${failures.length} table(s) failed — see manifest.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
