/**
 * Workspace entitlement diagnostics: the resolved plan, feature flags, credit
 * balance and live usage against every plan limit. Read-only, server only.
 */
import { admin } from "@/lib/billing/core.server";
import { getEntitlement, type PlanLimitKey } from "@/lib/billing/entitlements.server";

export type UsageRow = {
  key: PlanLimitKey;
  label: string;
  used: number;
  limit: number | null;
  percent: number | null;
  overLimit: boolean;
};

export type WorkspaceDiagnostics = {
  workspaceId: string;
  workspaceName: string;
  generatedAt: string;
  plan: {
    id: string | null;
    name: string;
    state: string;
    active: boolean;
    inGrace: boolean;
    accessUntil: string | null;
  };
  features: { key: string; label: string; category: string; enabled: boolean; source: string }[];
  credits: {
    included: number;
    balance: number;
    allocatedTotal: number;
    consumedTotal: number;
    lastAllocatedAt: string | null;
  };
  usage: UsageRow[];
  recentLedger: { at: string; entryType: string; amount: number; balanceAfter: number; reason: string | null }[];
};

const LIMIT_LABELS: Record<PlanLimitKey, string> = {
  max_users: "Team members",
  max_leads: "Leads",
  max_campaigns: "Campaigns",
  max_emails_monthly: "Emails sent this month",
  max_sending_accounts: "Sending accounts",
  max_workspaces: "Workspaces",
  max_automations: "Automations",
};

async function countRows(table: string, workspaceId: string, since?: string) {
  const db = await admin();
  let q = db.from(table as any).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (since) q = q.gte("created_at", since);
  const { count } = await q;
  return count ?? 0;
}

export async function loadWorkspaceDiagnostics(workspaceId: string): Promise<WorkspaceDiagnostics> {
  const db = await admin();
  const { FEATURE_CATALOG } = await import("@/lib/billing/features");
  const entitlement = await getEntitlement(workspaceId);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [workspace, creditRow, members, leads, campaigns, accounts, automations, ledger, emails] =
    await Promise.all([
      db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
      db
        .from("workspace_credits")
        .select("balance, allocated_total, consumed_total, last_allocated_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      countRows("workspace_members", workspaceId),
      countRows("leads", workspaceId),
      countRows("campaigns", workspaceId),
      countRows("sending_accounts", workspaceId),
      countRows("automations", workspaceId),
      db
        .from("credit_ledger")
        .select("created_at, entry_type, amount, balance_after, reason")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("event_type", "sent")
        .gte("created_at", monthStart.toISOString()),
    ]);

  const used: Record<PlanLimitKey, number> = {
    max_users: members,
    max_leads: leads,
    max_campaigns: campaigns,
    max_emails_monthly: emails.count ?? 0,
    max_sending_accounts: accounts,
    max_automations: automations,
    max_workspaces: 1,
  };

  const usage: UsageRow[] = (Object.keys(LIMIT_LABELS) as PlanLimitKey[]).map((key) => {
    const limit = entitlement.limits[key];
    const value = used[key];
    return {
      key,
      label: LIMIT_LABELS[key],
      used: value,
      limit,
      percent: limit && limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : null,
      overLimit: limit !== null && value >= limit,
    };
  });

  return {
    workspaceId,
    workspaceName: workspace.data?.name ?? "Workspace",
    generatedAt: new Date().toISOString(),
    plan: {
      id: entitlement.planId,
      name: entitlement.planName,
      state: entitlement.state,
      active: entitlement.active,
      inGrace: entitlement.inGrace,
      accessUntil: entitlement.accessUntil,
    },
    features: FEATURE_CATALOG.map((f) => ({
      key: f.key,
      label: f.label,
      category: f.category,
      enabled: Boolean(entitlement.features[f.key]),
      source: f.column ? `plans.${f.column}` : "plan_features",
    })),
    credits: {
      included: entitlement.credits.included,
      balance: Number(creditRow.data?.balance ?? entitlement.credits.balance),
      allocatedTotal: Number(creditRow.data?.allocated_total ?? 0),
      consumedTotal: Number(creditRow.data?.consumed_total ?? 0),
      lastAllocatedAt: creditRow.data?.last_allocated_at ?? null,
    },
    usage,
    recentLedger: (ledger.data ?? []).map((r: any) => ({
      at: r.created_at,
      entryType: r.entry_type,
      amount: Number(r.amount),
      balanceAfter: Number(r.balance_after),
      reason: r.reason ?? null,
    })),
  };
}
