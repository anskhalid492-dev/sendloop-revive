/**
 * Admin plan grants — an entitlement override layer on top of the normal
 * subscription record.
 *
 * A grant lets staff give a workspace any plan without payment. It never
 * touches `billing_subscriptions`, so the customer's real billing history stays
 * intact; when the grant expires or is revoked the workspace falls straight
 * back to whatever its subscription says.
 *
 * Server only. Every entry point is called behind `assertSuperAdmin`.
 */
import { admin } from "@/lib/billing/core.server";
import { recordAdminChange } from "@/lib/billing/change-audit.server";

export type PlanGrant = {
  id: string;
  workspaceId: string;
  planId: string;
  planName: string;
  status: "active" | "revoked" | "expired";
  startsAt: string;
  /** null = no expiry (unlimited grant). */
  expiresAt: string | null;
  reason: string | null;
  grantedByEmail: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

function mapGrant(row: any, planName: string, email: string | null): PlanGrant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    planId: row.plan_id,
    planName,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    reason: row.reason ?? null,
    grantedByEmail: email,
    grantedAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
  };
}

/** Flips any grant whose expiry has passed to `expired`. Safe to call on reads. */
async function expireDueGrants(workspaceId: string) {
  const db = await admin();
  await db
    .from("plan_grants")
    .update({ status: "expired" })
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString());
}

/**
 * The grant that currently overrides entitlements, or null.
 * Returns the raw row plus its plan so callers avoid a second query.
 */
export async function activeGrantWithPlan(workspaceId: string) {
  const db = await admin();
  await expireDueGrants(workspaceId);
  const { data } = await db
    .from("plan_grants")
    .select("*, plans(*)")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .lte("starts_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.plans) return null;
  return { row: data as any, plan: (data as any).plans as any };
}

async function emailFor(userId: string | null) {
  if (!userId) return null;
  const db = await admin();
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  return (data?.email as string | undefined) ?? null;
}

/** Full grant history for a workspace, newest first. */
export async function listGrants(workspaceId: string): Promise<PlanGrant[]> {
  const db = await admin();
  await expireDueGrants(workspaceId);
  const { data } = await db
    .from("plan_grants")
    .select("*, plans(name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as any[];
  const emails = new Map<string, string | null>();
  for (const row of rows) {
    if (row.granted_by && !emails.has(row.granted_by)) {
      emails.set(row.granted_by, await emailFor(row.granted_by));
    }
  }
  return rows.map((r) => mapGrant(r, r.plans?.name ?? "Plan", emails.get(r.granted_by) ?? null));
}

export type GrantInput = {
  workspaceId: string;
  planId: string;
  /** Days of access; null/undefined = unlimited (no expiry). */
  days: number | null;
  reason?: string | null;
  actorId: string;
};

function expiryFrom(days: number | null) {
  if (days === null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Grants a plan, superseding any grant already active on the workspace. */
export async function grantPlan(input: GrantInput) {
  const db = await admin();
  const { data: plan } = await db.from("plans").select("*").eq("id", input.planId).maybeSingle();
  if (!plan) throw new Error("Plan not found");

  const previous = await activeGrantWithPlan(input.workspaceId);
  if (previous) {
    await db
      .from("plan_grants")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: input.actorId })
      .eq("id", previous.row.id);
  }

  const expiresAt = expiryFrom(input.days);
  const { data: created, error } = await db
    .from("plan_grants")
    .insert({
      workspace_id: input.workspaceId,
      plan_id: plan.id,
      status: "active",
      granted_by: input.actorId,
      starts_at: new Date().toISOString(),
      expires_at: expiresAt,
      reason: input.reason ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminChange({
    actorId: input.actorId,
    action: previous ? "plan_grant.changed" : "plan_grant.granted",
    targetType: "subscription",
    targetId: input.workspaceId,
    targetLabel: plan.name,
    workspaceId: input.workspaceId,
    before: previous
      ? { grantId: previous.row.id, planName: previous.plan?.name ?? null, expiresAt: previous.row.expires_at }
      : null,
    after: { grantId: created.id, planName: plan.name, expiresAt },
    detail: {
      kind: "plan_grant",
      fromPlan: previous?.plan?.name ?? null,
      toPlan: plan.name,
      startsAt: new Date().toISOString(),
      expiresAt,
      durationDays: input.days,
      reason: input.reason ?? null,
      charged: false,
    },
  });
  return created.id as string;
}

/** Changes the expiry of the active grant (extend, shorten, or make unlimited). */
export async function updateGrantExpiry(input: {
  workspaceId: string;
  days: number | null;
  reason?: string | null;
  actorId: string;
}) {
  const db = await admin();
  const current = await activeGrantWithPlan(input.workspaceId);
  if (!current) throw new Error("No active plan grant to update");
  const expiresAt = expiryFrom(input.days);
  const { error } = await db
    .from("plan_grants")
    .update({ expires_at: expiresAt, ...(input.reason ? { reason: input.reason } : {}) })
    .eq("id", current.row.id);
  if (error) throw new Error(error.message);

  await recordAdminChange({
    actorId: input.actorId,
    action: "plan_grant.expiry_updated",
    targetType: "subscription",
    targetId: input.workspaceId,
    targetLabel: current.plan?.name ?? null,
    workspaceId: input.workspaceId,
    before: { expiresAt: current.row.expires_at },
    after: { expiresAt },
    detail: {
      kind: "plan_grant",
      toPlan: current.plan?.name ?? null,
      expiresAt,
      durationDays: input.days,
      reason: input.reason ?? null,
    },
  });
}

/** Revokes the active grant; the workspace returns to its own subscription. */
export async function revokeGrant(input: { workspaceId: string; reason?: string | null; actorId: string }) {
  const db = await admin();
  const current = await activeGrantWithPlan(input.workspaceId);
  if (!current) throw new Error("No active plan grant to revoke");
  const { error } = await db
    .from("plan_grants")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: input.actorId,
      ...(input.reason ? { reason: input.reason } : {}),
    })
    .eq("id", current.row.id);
  if (error) throw new Error(error.message);

  await recordAdminChange({
    actorId: input.actorId,
    action: "plan_grant.revoked",
    targetType: "subscription",
    targetId: input.workspaceId,
    targetLabel: current.plan?.name ?? null,
    workspaceId: input.workspaceId,
    before: { grantId: current.row.id, planName: current.plan?.name ?? null, status: "active" },
    after: { grantId: current.row.id, status: "revoked" },
    detail: {
      kind: "plan_grant",
      fromPlan: current.plan?.name ?? null,
      reason: input.reason ?? null,
    },
  });
}
