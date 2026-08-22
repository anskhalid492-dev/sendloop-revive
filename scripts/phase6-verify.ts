/**
 * PHASE 6 — cutover verification against the NEW backend project.
 *
 * Read-only. It never writes, never deletes and never touches the OLD project
 * beyond counting rows (rollback environment must stay intact).
 *
 * Usage:
 *   NEW_SUPABASE_URL=https://rihgzkofoxcjljlbvbya.supabase.co \
 *   NEW_SERVICE_ROLE_KEY=... \
 *   PROVIDER_CREDENTIALS_KEY=<byte-identical production value> \
 *   [OLD_SUPABASE_URL=... OLD_SERVICE_ROLE_KEY=...] \
 *   bun scripts/phase6-verify.ts
 */
import { createDecipheriv, createHash } from "node:crypto";

const NEW_URL = must("NEW_SUPABASE_URL");
const NEW_KEY = must("NEW_SERVICE_ROLE_KEY");
const OLD_URL = process.env["OLD_SUPABASE_URL"];
const OLD_KEY = process.env["OLD_SERVICE_ROLE_KEY"];

function must(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(2);
  }
  return v;
}

const results: Array<{ area: string; ok: boolean; detail: string }> = [];
function record(area: string, ok: boolean, detail: string) {
  results.push({ area, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${area} — ${detail}`);
}

async function rest(url: string, key: string, path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  const body = res.ok ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, body, count: range ? Number(range.split("/")[1]) : null };
}

async function authUsers(url: string, key: string, perPage = 200) {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=${perPage}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`auth admin ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { users: Array<{ id: string; email: string | null }> };
  return json.users ?? [];
}

function decrypt(stored: string): unknown {
  const secret = must("PROVIDER_CREDENTIALS_KEY");
  const buf = Buffer.from(stored, "base64");
  const d = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
}

async function main() {
  // 1. Connectivity + schema presence
  const flags = await rest(NEW_URL, NEW_KEY, "rpc/public_platform_flags");
  record("connection", flags.ok, flags.ok ? `new project reachable (${NEW_URL})` : JSON.stringify(flags.body).slice(0, 200));

  // 2. Auth users and UUID preservation
  let newUsers: Array<{ id: string; email: string | null }> = [];
  try {
    newUsers = await authUsers(NEW_URL, NEW_KEY);
    record("auth.users", newUsers.length > 0, `${newUsers.length} users present in the new project`);
  } catch (e) {
    record("auth.users", false, (e as Error).message);
  }
  if (OLD_URL && OLD_KEY) {
    try {
      const oldUsers = await authUsers(OLD_URL, OLD_KEY);
      const newIds = new Set(newUsers.map((u) => u.id));
      const missing = oldUsers.filter((u) => !newIds.has(u.id));
      const dupEmails = new Set<string>();
      const seen = new Set<string>();
      for (const u of newUsers) {
        const e = (u.email ?? "").toLowerCase();
        if (!e) continue;
        if (seen.has(e)) dupEmails.add(e);
        seen.add(e);
      }
      record(
        "auth.uuid-preservation",
        missing.length === 0 && dupEmails.size === 0,
        `old=${oldUsers.length} new=${newUsers.length} missing=${missing.length} duplicateEmails=${dupEmails.size}`,
      );
    } catch (e) {
      record("auth.uuid-preservation", false, (e as Error).message);
    }
  }

  // 3. Provider credential decryption with the unchanged PROVIDER_CREDENTIALS_KEY
  const secrets = await rest(NEW_URL, NEW_KEY, "email_provider_secrets?select=provider_id,credentials_ciphertext&limit=20");
  if (!secrets.ok) {
    record("provider-credentials", false, JSON.stringify(secrets.body).slice(0, 200));
  } else {
    const rows = secrets.body as Array<{ provider_id: string; credentials_ciphertext: string }>;
    let okCount = 0;
    const failed: string[] = [];
    for (const r of rows) {
      try {
        decrypt(r.credentials_ciphertext);
        okCount++;
      } catch {
        failed.push(r.provider_id);
      }
    }
    record(
      "provider-credentials",
      rows.length > 0 && failed.length === 0,
      `${okCount}/${rows.length} decrypted${failed.length ? ` — failed: ${failed.join(", ")}` : ""}`,
    );
  }

  // 4. Core data tables
  const tables = [
    "workspaces",
    "profiles",
    "leads",
    "campaigns",
    "campaign_messages",
    "sending_accounts",
    "conversations",
    "warmup_jobs",
    "plans",
    "billing_subscriptions",
    "blog_posts",
  ];
  for (const t of tables) {
    const r = await rest(NEW_URL, NEW_KEY, `${t}?select=id&limit=1`);
    let detail = r.ok ? `rows=${r.count ?? "?"}` : JSON.stringify(r.body).slice(0, 160);
    if (OLD_URL && OLD_KEY && r.ok) {
      const o = await rest(OLD_URL, OLD_KEY, `${t}?select=id&limit=1`);
      detail += ` (old=${o.count ?? "?"})`;
    }
    record(`table:${t}`, r.ok, detail);
  }

  // 5. Storage buckets
  const buckets = await fetch(`${NEW_URL}/storage/v1/bucket`, {
    headers: { apikey: NEW_KEY, Authorization: `Bearer ${NEW_KEY}` },
  });
  if (buckets.ok) {
    const list = (await buckets.json()) as Array<{ name: string; public: boolean }>;
    record("storage", list.length > 0, list.map((b) => `${b.name}${b.public ? "(public)" : ""}`).join(", ") || "no buckets");
  } else {
    record("storage", false, `${buckets.status}`);
  }

  // 6. Cron jobs still registered in the new project, and where they point
  const cron = await rest(NEW_URL, NEW_KEY, "rpc/admin_list_cron_jobs");
  if (cron.ok) {
    const jobs = cron.body as Array<{ jobname?: string; command?: string }>;
    const stale = jobs.filter((j) => (j.command ?? "").includes("ciaxsdojimcupxzpbpev"));
    record("cron", stale.length === 0, `${jobs.length} jobs; ${stale.length} still referencing the OLD project`);
  } else {
    record("cron", false, "could not read cron jobs from the new project (expected until Phase 7 creates them)");
  }

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) {
    console.log("STOP — do not complete the cutover until these pass:");
    for (const f of failures) console.log(`  - ${f.area}: ${f.detail}`);
    process.exit(1);
  }
  console.log("All checks passed — safe to deploy the cutover build.");
}

void main();
