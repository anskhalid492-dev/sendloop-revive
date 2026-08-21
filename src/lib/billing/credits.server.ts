/**
 * Credit balances and the immutable credit ledger. Server only.
 *
 * Every balance change goes through the `apply_credit_change` database
 * function, which updates the balance and writes the ledger row in one
 * transaction. Nothing writes `workspace_credits` or `credit_ledger` directly.
 */
import type { CreditEntryType } from "@/lib/billing/features";
import { admin } from "@/lib/billing/core.server";

export type CreditBalance = {
  workspaceId: string;
  balance: number;
  allocatedTotal: number;
  consumedTotal: number;
  lastAllocatedAt: string | null;
  updatedAt: string | null;
};

export async function getCreditBalance(workspaceId: string): Promise<CreditBalance> {
  const db = await admin();
  const { data, error } = await db
    .from("workspace_credits")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    workspaceId,
    balance: Number(data?.balance ?? 0),
    allocatedTotal: Number(data?.allocated_total ?? 0),
    consumedTotal: Number(data?.consumed_total ?? 0),
    lastAllocatedAt: data?.last_allocated_at ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

export async function applyCreditChange(input: {
  workspaceId: string;
  amount: number;
  entryType: CreditEntryType;
  reason?: string | null;
  reference?: string | null;
  actor?: string;
  actorUserId?: string | null;
  userId?: string | null;
}) {
  if (!Number.isFinite(input.amount) || input.amount === 0)
    throw new Error("Credit amount must be a non-zero number.");
  const db = await admin();
  const { data, error } = await db.rpc("apply_credit_change", {
    _workspace_id: input.workspaceId,
    _amount: Math.trunc(input.amount),
    _entry_type: input.entryType,
    _reason: input.reason ?? null,
    _reference: input.reference ?? null,
    _actor: input.actor ?? "system",
    _actor_user_id: input.actorUserId ?? null,
    _user_id: input.userId ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Sets the balance to an absolute value by writing a correction delta. */
export async function setCreditBalance(input: {
  workspaceId: string;
  target: number;
  reason: string;
  actorUserId: string;
}) {
  const current = await getCreditBalance(input.workspaceId);
  const delta = Math.trunc(input.target) - current.balance;
  if (delta === 0) return { ok: true, unchanged: true };
  await applyCreditChange({
    workspaceId: input.workspaceId,
    amount: delta,
    entryType: "correction",
    reason: input.reason,
    actor: "admin",
    actorUserId: input.actorUserId,
  });
  return { ok: true, unchanged: false };
}

/**
 * Consumes credits for metered work. Throws when the workspace cannot cover it,
 * which is the server-side enforcement point for credit limits.
 */
export async function consumeCredits(input: {
  workspaceId: string;
  amount: number;
  reason: string;
  reference?: string | null;
  userId?: string | null;
}) {
  if (input.amount <= 0) return null;
  return applyCreditChange({
    workspaceId: input.workspaceId,
    amount: -Math.trunc(input.amount),
    entryType: "usage",
    reason: input.reason,
    reference: input.reference ?? null,
    actor: "system",
    userId: input.userId ?? null,
  });
}

/**
 * Allocates the plan's monthly credit grant exactly once per plan + period.
 * Idempotent: the ledger reference is the dedupe key, so webhook retries and
 * repeated renewals never double-grant.
 */
export async function allocatePlanCredits(input: {
  workspaceId: string;
  planId: string;
  periodStart: string;
}) {
  const db = await admin();
  const { data: plan } = await db
    .from("plans")
    .select("name, monthly_credits")
    .eq("id", input.planId)
    .maybeSingle();
  const amount = Number((plan as any)?.monthly_credits ?? 0);
  if (amount <= 0) return { granted: false as const };

  const reference = `plan:${input.planId}:${input.periodStart.slice(0, 10)}`;
  const { data: existing } = await db
    .from("credit_ledger")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("reference", reference)
    .maybeSingle();
  if (existing) return { granted: false as const };

  await applyCreditChange({
    workspaceId: input.workspaceId,
    amount,
    entryType: "plan_allocation",
    reason: `${(plan as any)?.name ?? "Plan"} monthly credits`,
    reference,
    actor: "system",
  });
  return { granted: true as const, amount };
}

export async function assertCredits(workspaceId: string, needed: number) {
  const balance = await getCreditBalance(workspaceId);
  if (balance.balance < needed)
    throw new Error(
      `Not enough credits: ${balance.balance} available, ${needed} required. Top up or upgrade your plan.`,
    );
  return balance;
}

export type LedgerFilter = {
  workspaceId?: string | null;
  entryType?: CreditEntryType | null;
  search?: string | null;
  limit?: number;
};

export async function listLedger(filter: LedgerFilter = {}) {
  const db = await admin();
  let q = db
    .from("credit_ledger")
    .select("*, workspaces(name, slug)")
    .order("created_at", { ascending: false })
    .limit(Math.min(filter.limit ?? 200, 500));
  if (filter.workspaceId) q = q.eq("workspace_id", filter.workspaceId);
  if (filter.entryType) q = q.eq("entry_type", filter.entryType);
  if (filter.search?.trim()) q = q.ilike("reason", `%${filter.search.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const actorIds = Array.from(
    new Set((data ?? []).map((r: any) => r.actor_user_id).filter(Boolean)),
  );
  const emails = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await db.from("profiles").select("id, email").in("id", actorIds);
    for (const p of profiles ?? []) emails.set(p.id, p.email);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces?.name ?? "—",
    entryType: row.entry_type as CreditEntryType,
    amount: Number(row.amount),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    reason: row.reason as string | null,
    reference: row.reference as string | null,
    actor: row.actor as string,
    actorEmail: row.actor_user_id ? (emails.get(row.actor_user_id) ?? null) : null,
  }));
}

/** Workspace credit search for the admin credit console. */
export async function searchWorkspaceCredits(search: string) {
  const db = await admin();
  let q = db.from("workspaces").select("id, name, slug, owner_id").order("name").limit(25);
  const term = search.trim();
  if (term) q = q.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  const { data: workspaces, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (workspaces ?? []).map((w: any) => w.id);
  if (!ids.length) return [];

  const [credits, subs, plans, owners] = await Promise.all([
    db.from("workspace_credits").select("*").in("workspace_id", ids),
    db
      .from("billing_subscriptions")
      .select("workspace_id, plan_id, status, updated_at")
      .in("workspace_id", ids)
      .order("updated_at", { ascending: false }),
    db.from("plans").select("id, name, monthly_credits"),
    db
      .from("profiles")
      .select("id, email")
      .in("id", (workspaces ?? []).map((w: any) => w.owner_id).filter(Boolean)),
  ]);

  const planById = new Map((plans.data ?? []).map((p: any) => [p.id, p]));
  const ownerById = new Map((owners.data ?? []).map((p: any) => [p.id, p.email]));

  return (workspaces ?? []).map((w: any) => {
    const credit = (credits.data ?? []).find((c: any) => c.workspace_id === w.id);
    const sub = (subs.data ?? []).find((s: any) => s.workspace_id === w.id);
    const plan = sub?.plan_id ? planById.get(sub.plan_id) : null;
    return {
      workspaceId: w.id,
      workspaceName: w.name,
      slug: w.slug,
      ownerEmail: w.owner_id ? (ownerById.get(w.owner_id) ?? null) : null,
      planName: (plan as any)?.name ?? "No plan",
      planCredits: Number((plan as any)?.monthly_credits ?? 0),
      subscriptionStatus: sub?.status ?? "none",
      balance: Number(credit?.balance ?? 0),
      allocatedTotal: Number(credit?.allocated_total ?? 0),
      consumedTotal: Number(credit?.consumed_total ?? 0),
      lastAllocatedAt: credit?.last_allocated_at ?? null,
    };
  });
}
