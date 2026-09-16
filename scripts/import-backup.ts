/**
 * RESTORE from a manual export produced by scripts/export-backup.ts.
 *
 * DANGEROUS by nature — it writes rows. Guard rails:
 *   - refuses to run without CONFIRM=yes
 *   - never deletes or truncates anything
 *   - upserts on primary key (existing rows are updated, missing rows inserted)
 *   - dry-run by default (prints what it WOULD write)
 *
 * Usage (dry run):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DIR=/mnt/documents/backups/<stamp> \
 *   bun scripts/import-backup.ts
 *
 * Usage (apply, one table at a time is strongly recommended):
 *   ... DIR=... ONLY=leads CONFIRM=yes APPLY=1 bun scripts/import-backup.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const URL_ = must("SUPABASE_URL");
const KEY = must("SUPABASE_SERVICE_ROLE_KEY");
const DIR = must("DIR");
const APPLY = process.env["APPLY"] === "1";
const CONFIRMED = process.env["CONFIRM"] === "yes";
const ONLY = (process.env["ONLY"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CHUNK = 500;

function must(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(2);
  }
  return v;
}

if (APPLY && !CONFIRMED) {
  console.error("APPLY=1 requires CONFIRM=yes. Refusing to write.");
  process.exit(2);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=minimal",
};

async function upsert(table: string, rows: unknown[]) {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
}

async function main() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".ndjson"))
    .filter((f) => (ONLY.length === 0 ? true : ONLY.includes(f.replace(/\.ndjson$/, ""))))
    .sort();

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${files.length} file(s) from ${DIR}\n`);

  for (const file of files) {
    const table = file.replace(/\.ndjson$/, "");
    const rows = readFileSync(join(DIR, file), "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as unknown);

    if (!APPLY) {
      console.log(`  would upsert ${rows.length} rows into ${table}`);
      continue;
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      await upsert(table, rows.slice(i, i + CHUNK));
    }
    console.log(`  ok  ${table} — ${rows.length} rows upserted`);
  }

  if (!APPLY) console.log("\nNothing was written. Re-run with CONFIRM=yes APPLY=1 to restore.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
