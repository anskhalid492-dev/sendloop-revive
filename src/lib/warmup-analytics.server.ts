/**
 * Admin Warmup Analytics reads. Server-only; callers must already have passed
 * assertSuperAdmin. Reads only the existing `warmup_daily_stats` rollup (one
 * row per mailbox per UTC day, indexed by (sending_account_id, day)) plus
 * non-secret mailbox/workspace labels — never raw warmup emails or credentials.
 * Every read is a fixed number of batched queries (no per-row lookups).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chunk, fetchAllRows } from "@/lib/supabase-batch";
import {
  buildSeries,
  groupTotals,
  isoDay,
  monthStart,
  paginate,
  totalsOf,
  warmupState,
  weekStart,
  type StatRow,
} from "@/lib/warmup-analytics";

const db = () => supabaseAdmin as any;
const STAT_COLS = "sending_account_id, workspace_id, day, sent, delivered, failed, bounced";

async function statsInRange(from: string, to: string): Promise<StatRow[]> {
  return fetchAllRows<StatRow>(() =>
    db().from("warmup_daily_stats").select(STAT_COLS).gte("day", from).lte("day", to).order("id"),
  );
}

async function names(table: "workspaces", ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unique = [...new Set(ids.filter(Boolean))];
  await Promise.all(
    chunk(unique).map(async (part) => {
      const { data, error } = await db().from(table).select("id, name").in("id", part);
      if (error) throw new Error(error.message);
      for (const w of data ?? []) out[w.id] = w.name;
    }),
  );
  return out;
}

export async function warmupAnalyticsOverview(from: string, to: string) {
  const today = isoDay(new Date());
  const [rangeRows, allTime, firstDay] = await Promise.all([
    statsInRange(from, to),
    fetchAllRows<{ day: string; sent: number }>(() =>
      db().from("warmup_daily_stats").select("day, sent").gt("sent", 0).order("id"),
    ),
    db().from("warmup_daily_stats").select("day").gt("sent", 0).order("day", { ascending: true }).limit(1),
  ]);
  if (firstDay.error) throw new Error(firstDay.error.message);

  const sumFrom = (start: string) =>
    allTime.reduce((s, r) => (r.day >= start && r.day <= today ? s + (Number(r.sent) || 0) : s), 0);

  return {
    today,
    cards: {
      today: sumFrom(today),
      week: sumFrom(weekStart(today)),
      month: sumFrom(monthStart(today)),
      allTime: allTime.reduce((s, r) => s + (Number(r.sent) || 0), 0),
      dataSince: (firstDay.data?.[0]?.day as string | undefined) ?? null,
    },
    range: { from, to, ...totalsOf(rangeRows) },
    series: buildSeries(rangeRows, from, to),
  };
}

export async function warmupAnalyticsWorkspaces(from: string, to: string, page: number, pageSize: number) {
  const [rows, settings] = await Promise.all([
    statsInRange(from, to),
    fetchAllRows<{ workspace_id: string }>(() => db().from("warmup_settings").select("workspace_id").order("id")),
  ]);
  const mailboxCount: Record<string, number> = {};
  for (const s of settings) mailboxCount[s.workspace_id] = (mailboxCount[s.workspace_id] ?? 0) + 1;

  const totals = groupTotals(rows, (r) => r.workspace_id);
  const ranked = [...totals.entries()]
    .filter(([, t]) => t.sent > 0 || t.failed > 0)
    .sort((a, b) => b[1].sent - a[1].sent);
  const pageData = paginate(ranked, page, pageSize);
  const labels = await names("workspaces", pageData.rows.map(([id]) => id));
  return {
    ...pageData,
    rows: pageData.rows.map(([id, t]) => ({
      workspaceId: id,
      workspaceName: labels[id] ?? "—",
      mailboxes: mailboxCount[id] ?? 0,
      ...t,
    })),
  };
}

export async function warmupAnalyticsMailboxes(input: {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  search: string | null;
  status: "all" | "warming" | "paused";
}) {
  const [rows, settings] = await Promise.all([
    statsInRange(input.from, input.to),
    fetchAllRows<{ sending_account_id: string; workspace_id: string; enabled: boolean; paused_by_system: boolean | null }>(
      () => db().from("warmup_settings").select("sending_account_id, workspace_id, enabled, paused_by_system").order("id"),
    ),
  ]);
  const totals = groupTotals(rows, (r) => r.sending_account_id);
  const accountIds = [...new Set([...settings.map((s) => s.sending_account_id), ...totals.keys()])];

  const accounts: Record<string, any> = {};
  await Promise.all(
    chunk(accountIds).map(async (part) => {
      const { data, error } = await db()
        .from("sending_accounts")
        .select("id, from_email, workspace_id, warmup_status, warmup_daily_target, last_sent_at")
        .in("id", part);
      if (error) throw new Error(error.message);
      for (const a of data ?? []) accounts[a.id] = a;
    }),
  );
  const settingsById = new Map(settings.map((s) => [s.sending_account_id, s]));
  const workspaceIds = accountIds.map((id) => accounts[id]?.workspace_id ?? settingsById.get(id)?.workspace_id);
  const labels = await names("workspaces", workspaceIds as string[]);

  const term = input.search?.trim().toLowerCase() || null;
  const all = accountIds
    .map((id) => {
      const a = accounts[id];
      const s = settingsById.get(id);
      const t = totals.get(id) ?? { sent: 0, delivered: 0, failed: 0, deliveryRate: null };
      const workspaceId = a?.workspace_id ?? s?.workspace_id ?? null;
      return {
        accountId: id,
        email: (a?.from_email as string | undefined) ?? "—",
        workspaceName: (workspaceId && labels[workspaceId]) || "—",
        state: s ? warmupState(s, a?.warmup_status) : (a?.warmup_status ?? "not_started"),
        dailyTarget: (a?.warmup_daily_target as number | null) ?? null,
        lastActivityAt: (a?.last_sent_at as string | null) ?? null,
        ...t,
      };
    })
    .filter((r) => (input.status === "all" ? true : r.state === input.status))
    .filter((r) => !term || r.email.toLowerCase().includes(term) || r.workspaceName.toLowerCase().includes(term))
    .sort((a, b) => b.sent - a.sent || a.email.localeCompare(b.email));
  return paginate(all, input.page, input.pageSize);
}
