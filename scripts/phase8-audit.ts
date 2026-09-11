/**
 * Phase 8 — final production audit (READ ONLY).
 * Compares NEW vs OLD Supabase projects and probes integrity.
 * Usage: bun scripts/phase8-audit.ts
 */

const NEW_URL = "https://rihgzkofoxcjljlbvbya.supabase.co";
// Historical script: pass the retired project's URL/key via env when re-running.
const OLD_URL = process.env["OLD_SUPABASE_URL"]!;
const NEW_KEY = process.env["SB_SERVICE_ROLE_KEY"]!;
const OLD_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

async function count(base: string, key: string, table: string, schema = "public") {
  const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      "Accept-Profile": schema,
    },
  });
  if (!res.ok) return `ERR ${res.status}`;
  const cr = res.headers.get("content-range") ?? "";
  return cr.split("/")[1] ?? "?";
}

async function authUsers(base: string, key: string) {
  const res = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { users: [] as any[], err: `${res.status}` };
  const j = (await res.json()) as any;
  return { users: (j.users ?? []) as any[] };
}

const TABLES = [
  "profiles",
  "workspaces",
  "workspace_members",
  "leads",
  "campaigns",
  "campaign_messages",
  "campaign_recipients",
  "sending_accounts",
  "sending_domains",
  "conversations",
  "conversation_messages",
  "warmup_jobs",
  "warmup_daily_stats",
  "warmup_recipients",
  "plans",
  "plan_features",
  "plan_grants",
  "workspace_subscriptions",
  "blog_posts",
  "email_providers",
  "email_events",
  "user_roles",
];

async function main() {
  console.log("=== 1. TABLE COUNTS (NEW vs OLD) ===");
  let mismatches = 0;
  for (const t of TABLES) {
    const [n, o] = await Promise.all([
      count(NEW_URL, NEW_KEY, t),
      count(OLD_URL, OLD_KEY, t),
    ]);
    const ok = n === o;
    if (!ok) mismatches++;
    console.log(`${ok ? "PASS" : "DIFF"}  ${t.padEnd(26)} new=${n} old=${o}`);
  }
  console.log(`mismatches: ${mismatches}`);

  console.log("\n=== 2. AUTH USERS / UUIDS ===");
  const [nu, ou] = await Promise.all([authUsers(NEW_URL, NEW_KEY), authUsers(OLD_URL, OLD_KEY)]);
  console.log(`new users=${nu.users.length} old users=${ou.users.length}`);
  const nIds = new Set(nu.users.map((u) => u.id));
  const missing = ou.users.filter((u) => !nIds.has(u.id));
  console.log(`UUIDs present in OLD but missing in NEW: ${missing.length}`, missing.slice(0, 5).map((u) => u.email));
  const emails = nu.users.map((u) => (u.email ?? "").toLowerCase()).filter(Boolean);
  const dupes = emails.filter((e, i) => emails.indexOf(e) !== i);
  console.log(`duplicate emails in NEW: ${dupes.length}`, dupes);
  const identCount = nu.users.reduce((a, u) => a + (u.identities?.length ?? 0), 0);
  const oldIdent = ou.users.reduce((a, u) => a + (u.identities?.length ?? 0), 0);
  console.log(`identities new=${identCount} old=${oldIdent}`);
  const providers = new Set(nu.users.flatMap((u: any) => (u.identities ?? []).map((i: any) => i.provider)));
  console.log("identity providers in NEW:", [...providers].join(", "));

  console.log("\n=== 3. ORPHAN / FK CHECKS (NEW) ===");
  const q = async (path: string) => {
    const r = await fetch(`${NEW_URL}/rest/v1/${path}`, {
      headers: { apikey: NEW_KEY, Authorization: `Bearer ${NEW_KEY}` },
    });
    return r.ok ? await r.json() : `ERR ${r.status} ${await r.text()}`;
  };
  const wsIds = new Set((await q("workspaces?select=id")).map((w: any) => w.id));
  for (const t of ["leads", "campaigns", "sending_accounts", "conversations", "workspace_members"]) {
    const rows = await q(`${t}?select=id,workspace_id`);
    if (typeof rows === "string") { console.log(`${t}: ${rows}`); continue; }
    const orphans = rows.filter((r: any) => r.workspace_id && !wsIds.has(r.workspace_id));
    console.log(`${orphans.length === 0 ? "PASS" : "WARN"}  ${t}: ${orphans.length} orphan rows (of ${rows.length})`);
  }
  const memberUserIds = (await q("workspace_members?select=user_id")).map((m: any) => m.user_id);
  const orphanMembers = memberUserIds.filter((id: string) => !nIds.has(id));
  console.log(`${orphanMembers.length === 0 ? "PASS" : "WARN"}  workspace_members with no auth user: ${orphanMembers.length}`);

  console.log("\n=== 4. RLS COVERAGE (NEW, via anon probe) ===");
  const anonKey = process.env["NEW_ANON_KEY"] ?? "";
  if (anonKey) {
    for (const t of ["leads", "campaigns", "conversations", "sending_accounts", "workspaces", "profiles", "email_providers", "user_roles"]) {
      const r = await fetch(`${NEW_URL}/rest/v1/${t}?select=id&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const body = r.ok ? await r.json() : null;
      const leaked = Array.isArray(body) && body.length > 0;
      console.log(`${leaked ? "FAIL" : "PASS"}  anon read ${t}: status=${r.status} rows=${Array.isArray(body) ? body.length : "-"}`);
    }
  } else console.log("skip (NEW_ANON_KEY not set)");

  console.log("\n=== 5. PLANS ===");
  const plans = await q("plans?select=name,slug,monthly_email_limit,lead_limit,mailbox_limit,domain_limit,is_active&order=sort_order");
  console.log(JSON.stringify(plans, null, 1).slice(0, 3000));

  console.log("\n=== 6. STORAGE BUCKETS (NEW) ===");
  const b = await fetch(`${NEW_URL}/storage/v1/bucket`, {
    headers: { apikey: NEW_KEY, Authorization: `Bearer ${NEW_KEY}` },
  });
  const buckets = b.ok ? await b.json() : await b.text();
  console.log(Array.isArray(buckets) ? buckets.map((x: any) => `${x.name} public=${x.public}`).join("\n") : buckets);

  console.log("\n=== 7. WARMUP vs CAMPAIGN SEPARATION ===");
  const om = await q("outbound_messages?select=kind");
  if (Array.isArray(om)) {
    const byKind: Record<string, number> = {};
    om.forEach((r: any) => (byKind[r.kind] = (byKind[r.kind] ?? 0) + 1));
    console.log("outbound_messages by kind:", byKind);
  } else console.log("outbound_messages:", om);
  const wstats = await q("warmup_daily_stats?select=day,sent,inbox,spam,replies&order=day.desc&limit=3");
  console.log("warmup_daily_stats latest:", JSON.stringify(wstats));

  console.log("\n=== 8. RETENTION CONFIG ===");
  const ws = await q("workspaces?select=id,lead_retention_days&limit=25");
  if (Array.isArray(ws)) {
    const vals = [...new Set(ws.map((w: any) => w.lead_retention_days))];
    console.log("distinct lead_retention_days:", vals);
  } else console.log(ws);
  console.log("lead_retention_runs:", JSON.stringify(await q("lead_retention_runs?select=*&order=created_at.desc&limit=3")).slice(0, 800));

  console.log("\n=== 9. RECENT ACTIVITY (NEW) ===");
  for (const t of [
    "campaign_messages?select=id,status,sent_at&order=created_at.desc&limit=5",
    "email_events?select=id,event_type,created_at&order=created_at.desc&limit=5",
    "conversation_messages?select=id,direction,created_at&order=created_at.desc&limit=5",
  ]) {
    console.log(t.split("?")[0], JSON.stringify(await q(t)).slice(0, 600));
  }

  console.log("\n=== 10. OLD PROJECT TRAFFIC PROBE ===");
  for (const t of ["campaign_messages", "email_events", "conversation_messages"]) {
    const r = await fetch(`${OLD_URL}/rest/v1/${t}?select=created_at&order=created_at.desc&limit=1`, {
      headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}` },
    });
    console.log(`OLD ${t} latest:`, r.ok ? JSON.stringify(await r.json()) : r.status);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
