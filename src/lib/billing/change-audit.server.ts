/**
 * Admin change audit: every plan, feature, subscription and credit change made
 * from the admin console is written to `admin_audit_log` with a before/after
 * snapshot and the acting user + affected workspace. Server only.
 *
 * Snapshots are captured from the database on both sides of the mutation so the
 * log stays truthful even when a write partially succeeds.
 */
import { admin } from "@/lib/billing/core.server";

export type ChangeSnapshot = Record<string, unknown> | null;

export type AdminChangeEntry = {
  actorId: string;
  action: string;
  targetType: "plan" | "plan_feature" | "subscription" | "credits";
  targetId?: string | null;
  targetLabel?: string | null;
  workspaceId?: string | null;
  before?: ChangeSnapshot;
  after?: ChangeSnapshot;
  detail?: Record<string, unknown>;
};

/** Field-level diff of two snapshots; only changed keys are kept. */
export function diffSnapshots(before: ChangeSnapshot, after: ChangeSnapshot) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const a = (before ?? {})[key];
    const b = (after ?? {})[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    changes[key] = { before: a ?? null, after: b ?? null };
  }
  return changes;
}

export async function recordAdminChange(entry: AdminChangeEntry) {
  const db = await admin();
  const changes = diffSnapshots(entry.before ?? null, entry.after ?? null);
  const { error } = await db.from("admin_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    target_label: entry.targetLabel ?? null,
    detail: {
      workspaceId: entry.workspaceId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      changes,
      changedFields: Object.keys(changes),
      ...(entry.detail ?? {}),
    },
  });
  // Auditing must never swallow the caller's result, but a failed audit write
  // is a real problem — surface it in the server logs.
  if (error) console.error("[admin-audit] failed to record change", entry.action, error.message);
  return { changedFields: Object.keys(changes) };
}

/* ------------------------------------------------------------- snapshots */

const PLAN_SNAPSHOT_COLUMNS =
  "id, name, slug, description, tagline, sort_order, monthly_price, yearly_price, is_popular, is_enterprise, is_active, monthly_credits, max_workspaces, max_users, max_leads, max_campaigns, max_emails_monthly, max_sending_accounts, max_automations, warmup_enabled, unified_inbox_enabled, analytics_enabled, api_access, priority_support, custom_branding, sso_enabled";

export async function planSnapshot(planId: string): Promise<ChangeSnapshot> {
  const db = await admin();
  const { data } = await db.from("plans").select(PLAN_SNAPSHOT_COLUMNS).eq("id", planId).maybeSingle();
  return (data as ChangeSnapshot) ?? null;
}

export async function featureSnapshot(planId: string, featureKey: string): Promise<ChangeSnapshot> {
  const { featureDefinition } = await import("@/lib/billing/features");
  const definition = featureDefinition(featureKey);
  const db = await admin();
  if (definition?.column) {
    const { data } = await db.from("plans").select(`id, ${definition.column}`).eq("id", planId).maybeSingle();
    return { planId, featureKey, enabled: Boolean((data as any)?.[definition.column]), source: "plan_column" };
  }
  const { data } = await db
    .from("plan_features")
    .select("included")
    .eq("plan_id", planId)
    .eq("feature_key", featureKey)
    .maybeSingle();
  return {
    planId,
    featureKey,
    enabled: data ? Boolean(data.included) : Boolean(definition?.fallback),
    source: data ? "plan_features" : "fallback",
  };
}

export async function subscriptionSnapshot(workspaceId: string): Promise<ChangeSnapshot> {
  const db = await admin();
  const { data } = await db
    .from("billing_subscriptions")
    .select(
      "id, plan_id, status, billing_interval, amount_cents, currency, provider, environment, cancel_at_period_end, cancelled_at, current_period_end, access_until, grace_until",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ChangeSnapshot) ?? null;
}

export async function creditSnapshot(workspaceId: string): Promise<ChangeSnapshot> {
  const db = await admin();
  const { data } = await db
    .from("workspace_credits")
    .select("balance, allocated_total, consumed_total, last_allocated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return {
    balance: Number(data?.balance ?? 0),
    allocatedTotal: Number(data?.allocated_total ?? 0),
    consumedTotal: Number(data?.consumed_total ?? 0),
    lastAllocatedAt: data?.last_allocated_at ?? null,
  };
}

export async function workspaceLabel(workspaceId: string) {
  const db = await admin();
  const { data } = await db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/* ------------------------------------------------------------ admin reader */

export type ChangeLogFilter = {
  targetType?: string | null;
  search?: string | null;
  limit?: number;
};

export async function listAdminChanges(filter: ChangeLogFilter = {}) {
  const db = await admin();
  let q = db
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(filter.limit ?? 200, 500));
  if (filter.targetType) q = q.eq("target_type", filter.targetType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const actorIds = Array.from(new Set((data ?? []).map((r: any) => r.actor_id).filter(Boolean)));
  const actors = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await db.from("profiles").select("id, email").in("id", actorIds);
    for (const p of profiles ?? []) actors.set(p.id, p.email);
  }

  const workspaceIds = Array.from(
    new Set((data ?? []).map((r: any) => r.detail?.workspaceId).filter(Boolean)),
  );
  const workspaces = new Map<string, string>();
  if (workspaceIds.length) {
    const { data: rows } = await db.from("workspaces").select("id, name").in("id", workspaceIds);
    for (const w of rows ?? []) workspaces.set(w.id, w.name);
  }

  const rows = (data ?? []).map((r: any) => ({
    id: r.id as string,
    at: r.created_at as string,
    action: r.action as string,
    targetType: r.target_type as string,
    targetId: (r.target_id as string | null) ?? null,
    targetLabel: (r.target_label as string | null) ?? null,
    actorId: r.actor_id as string,
    actorEmail: actors.get(r.actor_id) ?? null,
    workspaceId: (r.detail?.workspaceId as string | null) ?? null,
    workspaceName: r.detail?.workspaceId ? (workspaces.get(r.detail.workspaceId) ?? null) : null,
    changes: (r.detail?.changes ?? {}) as Record<string, { before: unknown; after: unknown }>,
    detail: (r.detail ?? {}) as Record<string, unknown>,
  }));

  const term = (filter.search ?? "").trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((r: (typeof rows)[number]) =>
    [r.action, r.targetLabel, r.actorEmail, r.workspaceName, r.targetId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term)),
  );
}
