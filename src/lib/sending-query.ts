/**
 * Server-side query helpers for the customer Email Accounts page.
 *
 * All reads go through the caller's authenticated Supabase client, so RLS keeps
 * results scoped to workspaces the user belongs to. Provider columns are never
 * selected.
 */
import {
  accountStatusOf,
  domainOf,
  healthBand,
  warmupProgress,
  type AccountStats,
  type AccountStatus,
  type EmailAccountRow,
  type EmailAccountSummary,
} from "@/lib/sending-model";

type Client = {
  from: (table: string) => any;
  rpc: (fn: string, args?: unknown) => any;
};

export const ACCOUNT_COLUMNS =
  "id, label, from_name, from_email, reply_to, daily_limit, hourly_limit, sent_today, health_score, warmup_status, warmup_daily_target, warmup_started_at, warmup_target_days, customer_enabled, paused, status, spf_status, dkim_status, dmarc_status, mx_status, assigned_at, created_at, last_sent_at, last_reply_at, workspace_id";

export type AccountFacets = {
  domains: string[];
  campaigns: { id: string; name: string; status: string; accountIds: string[] }[];
};

export type AccountPageResult = {
  accounts: EmailAccountRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: EmailAccountSummary;
  facets: AccountFacets;
};

export async function loadAccountStats(
  client: Client,
  ids: string[],
): Promise<Record<string, AccountStats>> {
  if (ids.length === 0) return {};
  const { data, error } = await client.rpc("sending_account_stats", { _account_ids: ids });
  if (error) throw new Error(error.message);
  const map: Record<string, AccountStats> = {};
  for (const row of (data ?? []) as any[]) {
    map[row.account_id] = {
      sent: Number(row.sent ?? 0),
      delivered: Number(row.delivered ?? 0),
      bounced: Number(row.bounced ?? 0),
      complained: Number(row.complained ?? 0),
      replies: Number(row.replies ?? 0),
      lastSentAt: row.last_sent_at ?? null,
      lastReplyAt: row.last_reply_at ?? null,
    };
  }
  return map;
}

export async function loadAccountFacets(client: Client): Promise<AccountFacets> {
  const { data, error } = await client
    .from("campaigns")
    .select("id, name, status, sending_account_ids")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const campaigns = ((data ?? []) as any[]).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    status: c.status as string,
    accountIds: (c.sending_account_ids ?? []) as string[],
  }));
  return { domains: [], campaigns };
}

type Filters = {
  page: number;
  pageSize: number;
  search: string;
  status: AccountStatus | "all";
  warmup: "all" | "warming" | "complete" | "not_started" | "attention";
  health: "all" | "good" | "fair" | "poor";
  domain: string;
  campaignId: string;
  sort:
    | "health"
    | "sent_today"
    | "daily_limit"
    | "warmup"
    | "last_activity"
    | "created_at"
    | "email";
  dir: "asc" | "desc";
};

export async function buildAccountPage(
  client: Client,
  filters: Filters,
): Promise<AccountPageResult> {
  const facets = await loadAccountFacets(client);

  let query = client
    .from("sending_accounts")
    .select(ACCOUNT_COLUMNS)
    .not("workspace_id", "is", null);

  const search = filters.search.trim();
  if (search) {
    const like = `%${search.replace(/[%,]/g, "")}%`;
    const campaignMatches = facets.campaigns.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    );
    const campaignAccountIds = [...new Set(campaignMatches.flatMap((c) => c.accountIds))];
    const clauses = [
      `from_email.ilike.${like}`,
      `from_name.ilike.${like}`,
      `label.ilike.${like}`,
    ];
    if (campaignAccountIds.length > 0) clauses.push(`id.in.(${campaignAccountIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  if (filters.domain !== "all") query = query.ilike("from_email", `%@${filters.domain}`);

  if (filters.campaignId !== "all") {
    const campaign = facets.campaigns.find((c) => c.id === filters.campaignId);
    const ids = campaign?.accountIds ?? [];
    if (ids.length === 0) {
      return emptyPage(filters, facets);
    }
    query = query.in("id", ids);
  }

  if (filters.warmup === "warming") query = query.eq("warmup_status", "warming");
  if (filters.warmup === "attention") query = query.eq("warmup_status", "attention");
  if (filters.warmup === "not_started") query = query.eq("warmup_status", "not_started");
  if (filters.warmup === "complete") query = query.in("warmup_status", ["complete", "completed"]);

  if (filters.health === "good") query = query.gte("health_score", 85);
  if (filters.health === "fair") query = query.gte("health_score", 70).lt("health_score", 85);
  if (filters.health === "poor") query = query.lt("health_score", 70);

  if (filters.status === "error") query = query.eq("status", "failed");
  if (filters.status === "inactive") query = query.eq("status", "disabled");
  if (filters.status === "paused") query = query.or("paused.is.true,customer_enabled.is.false");
  if (filters.status === "warming")
    query = query.eq("warmup_status", "warming").eq("paused", false).eq("customer_enabled", true);
  if (filters.status === "active")
    query = query.eq("paused", false).eq("customer_enabled", true).eq("status", "verified");

  const ascending = filters.dir === "asc";
  const sortColumn =
    filters.sort === "health"
      ? "health_score"
      : filters.sort === "sent_today"
        ? "sent_today"
        : filters.sort === "daily_limit"
          ? "daily_limit"
          : filters.sort === "warmup"
            ? "warmup_started_at"
            : filters.sort === "last_activity"
              ? "last_sent_at"
              : filters.sort === "email"
                ? "from_email"
                : "created_at";
  query = query.order(sortColumn, { ascending, nullsFirst: false });

  const { data: allRows, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (allRows ?? []) as any[];

  const summary = buildSummary(rows);
  const total = rows.length;
  const start = (filters.page - 1) * filters.pageSize;
  const pageRows = rows.slice(start, start + filters.pageSize);
  const stats = await loadAccountStats(
    client,
    pageRows.map((r) => r.id as string),
  );

  const campaignsByAccount = new Map<string, { active: number; completed: number; total: number }>();
  for (const campaign of facets.campaigns) {
    for (const accountId of campaign.accountIds) {
      const entry = campaignsByAccount.get(accountId) ?? { active: 0, completed: 0, total: 0 };
      entry.total += 1;
      if (campaign.status === "active" || campaign.status === "scheduled") entry.active += 1;
      if (campaign.status === "completed") entry.completed += 1;
      campaignsByAccount.set(accountId, entry);
    }
  }

  const accounts: EmailAccountRow[] = pageRows.map((row) =>
    decorate(row, stats[row.id] ?? null, campaignsByAccount.get(row.id)),
  );

  const domains = [...new Set(rows.map((r) => domainOf(r.from_email as string)).filter(Boolean))]
    .sort();

  return {
    accounts,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    summary,
    facets: { ...facets, domains },
  };
}

export function decorate(
  row: any,
  stats: AccountStats | null,
  campaigns?: { active: number; completed: number; total: number },
): EmailAccountRow {
  const { workspace_id: _ignored, ...rest } = row;
  return {
    ...(rest as Omit<EmailAccountRow, "domain" | "accountStatus" | "campaignCount" | "activeCampaigns" | "completedCampaigns" | "stats">),
    domain: domainOf(row.from_email as string),
    accountStatus: accountStatusOf(row),
    campaignCount: campaigns?.total ?? 0,
    activeCampaigns: campaigns?.active ?? 0,
    completedCampaigns: campaigns?.completed ?? 0,
    stats,
  };
}

function buildSummary(rows: any[]): EmailAccountSummary {
  const domains = new Set(rows.map((r) => domainOf(r.from_email as string)).filter(Boolean));
  return {
    totalAccounts: rows.length,
    totalDomains: domains.size,
    warming: rows.filter((r) => r.warmup_status === "warming").length,
    errors: rows.filter((r) => r.status === "failed").length,
    alerts: rows.filter(
      (r) =>
        healthBand(r.health_score) === "poor" ||
        r.spf_status === "fail" ||
        r.dkim_status === "fail" ||
        r.dmarc_status === "fail" ||
        r.mx_status === "fail" ||
        warmupProgress(r).label === "Needs attention",
    ).length,
    dailyCapacity: rows.reduce((sum, r) => sum + Number(r.daily_limit ?? 0), 0),
    sentToday: rows.reduce((sum, r) => sum + Number(r.sent_today ?? 0), 0),
  };
}

function emptyPage(filters: Filters, facets: AccountFacets): AccountPageResult {
  return {
    accounts: [],
    total: 0,
    page: filters.page,
    pageSize: filters.pageSize,
    summary: {
      totalAccounts: 0,
      totalDomains: 0,
      warming: 0,
      errors: 0,
      alerts: 0,
      dailyCapacity: 0,
      sentToday: 0,
    },
    facets,
  };
}

export async function createAccountRequest(
  client: Client,
  userId: string,
  input: { quantity: number; preferredDomain?: string; note?: string },
) {
  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) throw new Error("No workspace found for your account");

  const { data, error } = await client
    .from("sending_account_requests")
    .insert({
      workspace_id: membership.workspace_id,
      requested_by: userId,
      kind: "new",
      quantity: input.quantity,
      preferred_domain: input.preferredDomain?.trim() || null,
      note: input.note?.trim() || null,
    })
    .select("id, quantity, status, created_at")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true as const, request: data };
}

export async function loadAccountRequests(client: Client) {
  const { data, error } = await client
    .from("sending_account_requests")
    .select("id, kind, quantity, preferred_domain, note, status, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return { requests: (data ?? []) as any[] };
}
