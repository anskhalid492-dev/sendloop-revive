/**
 * Reusable entitlement gates. Server only.
 *
 * Thin, named wrappers over the single enforcement service in
 * `usage.server.ts` — no plan logic of its own, no second entitlement system.
 * Every restricted mutation calls the `require*` form; UI surfaces call the
 * `can*` form, which reports the same verdict without throwing.
 */
import { getEntitlement } from "@/lib/billing/entitlements.server";
import { admin } from "@/lib/billing/core.server";
import {
  EntitlementError,
  checkUsageLimit,
  evaluateEntitlement,
  getUsage,
  requireEntitlement,
} from "@/lib/billing/usage.server";

export type GateVerdict = {
  allowed: boolean;
  /** Customer-facing explanation; null when allowed. */
  reason: string | null;
  planName: string;
  used: number | null;
  limit: number | null;
  /** True when existing rows already exceed the plan's cap. */
  overLimit: boolean;
};

const ok = (planName: string, used: number | null = null, limit: number | null = null): GateVerdict => ({
  allowed: true,
  reason: null,
  planName,
  used,
  limit,
  overLimit: false,
});

/** Runs a throwing gate and turns an entitlement refusal into a verdict. */
async function verdict(run: () => Promise<GateVerdict>): Promise<GateVerdict> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof EntitlementError) {
      return {
        allowed: false,
        reason: error.message,
        planName: error.planName,
        used: error.used,
        limit: error.limit,
        overLimit: error.used !== null && error.limit !== null && error.used > error.limit,
      };
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ mailboxes */

/**
 * Mailboxes a workspace occupies, counted across BOTH tables that can hold one.
 *
 * A customer-connected mailbox lives in `mailboxes`; older surfaces and warmup
 * reference a bookkeeping `sending_accounts` row for the same address. Counting
 * distinct addresses means a mailbox is never counted twice, and never missed
 * because its bookkeeping row has not been created yet.
 */
export async function countMailboxes(workspaceId: string): Promise<number> {
  const db = await admin();
  const [mailboxes, accounts] = await Promise.all([
    db.from("mailboxes").select("email_address").eq("workspace_id", workspaceId),
    db.from("sending_accounts").select("from_email").eq("workspace_id", workspaceId),
  ]);
  const seen = new Set<string>();
  for (const row of (mailboxes.data ?? []) as Array<{ email_address: string | null }>) {
    const email = (row.email_address ?? "").trim().toLowerCase();
    if (email) seen.add(email);
  }
  for (const row of (accounts.data ?? []) as Array<{ from_email: string | null }>) {
    const email = (row.from_email ?? "").trim().toLowerCase();
    if (email) seen.add(email);
  }
  return seen.size;
}

export function mailboxLimitMessage(planName: string, limit: number) {
  return `Your ${planName} plan allows ${limit === 1 ? "1 mailbox" : `${limit} mailboxes`}. Upgrade your plan to add more.`;
}

/**
 * Blocks connecting another mailbox once the plan's allowance is used.
 *
 * Called BEFORE any credential is stored, so a refusal never leaves a
 * half-connected mailbox behind. A workspace that is already over its cap
 * (connected before this check existed) keeps its mailboxes and is simply
 * refused any further ones.
 */
export async function requireMailboxCapacity(workspaceId: string, amount = 1): Promise<GateVerdict> {
  const entitlement = await getEntitlement(workspaceId);
  const limit = entitlement.limits["max_sending_accounts"];
  const used = await countMailboxes(workspaceId);
  if (limit === null || limit === undefined) return ok(entitlement.planName, used, null);

  const cap = Number(limit);
  if (used + amount > cap) {
    throw new EntitlementError({
      code: "limit_reached",
      planName: entitlement.planName,
      resource: "sending_accounts",
      used,
      limit: cap,
      message: mailboxLimitMessage(entitlement.planName, cap),
    });
  }
  return ok(entitlement.planName, used, cap);
}

export async function canAddMailbox(workspaceId: string, amount = 1): Promise<GateVerdict> {
  return verdict(() => requireMailboxCapacity(workspaceId, amount));
}

/** Mailbox usage for display: real count, plan cap, and the over-limit flag. */
export async function mailboxCapacity(workspaceId: string) {
  const [entitlement, used] = await Promise.all([
    getEntitlement(workspaceId),
    countMailboxes(workspaceId),
  ]);
  const raw = entitlement.limits["max_sending_accounts"];
  const limit = raw === null || raw === undefined ? null : Number(raw);
  return {
    planName: entitlement.planName,
    used,
    limit,
    overLimit: limit !== null && used > limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
  };
}

/* --------------------------------------------------------------------- warmup */

export const WARMUP_NOT_ENTITLED = (planName: string) =>
  `Warmup isn't available on the ${planName} plan. Upgrade your plan to enable mailbox warmup.`;

/**
 * Warmup is a plan feature. Enforced on every path that can turn it on or keep
 * it running: customer actions, bulk actions, mailbox connection, the API and
 * the background runner.
 */
export async function requireWarmup(workspaceId: string): Promise<GateVerdict> {
  const entitlement = await getEntitlement(workspaceId);
  if (!entitlement.features["warmup"]) {
    throw new EntitlementError({
      code: "feature_locked",
      planName: entitlement.planName,
      resource: "warmup",
      message: WARMUP_NOT_ENTITLED(entitlement.planName),
    });
  }
  // Plan includes warmup, but the subscription itself may be inactive.
  await requireEntitlement(workspaceId, "warmup");
  return ok(entitlement.planName);
}

export async function canUseWarmup(workspaceId: string): Promise<GateVerdict> {
  return verdict(() => requireWarmup(workspaceId));
}

/* ------------------------------------------------- other plan-limited actions */

export async function canAddContact(workspaceId: string, amount = 1): Promise<GateVerdict> {
  return verdict(async () => {
    const r = await checkUsageLimit(workspaceId, "leads", amount);
    return ok(r.entitlement.planName, r.used, r.limit);
  });
}

export async function canCreateCampaign(workspaceId: string): Promise<GateVerdict> {
  return verdict(async () => {
    await requireEntitlement(workspaceId, "campaigns");
    const r = await checkUsageLimit(workspaceId, "campaigns", 1);
    return ok(r.entitlement.planName, r.used, r.limit);
  });
}

export async function canActivateCampaign(workspaceId: string): Promise<GateVerdict> {
  return verdict(async () => {
    const r = await checkUsageLimit(workspaceId, "active_campaigns", 1);
    return ok(r.entitlement.planName, r.used, r.limit);
  });
}

export async function canInviteTeamMember(workspaceId: string): Promise<GateVerdict> {
  return verdict(async () => {
    const r = await checkUsageLimit(workspaceId, "team_members", 1);
    return ok(r.entitlement.planName, r.used, r.limit);
  });
}

export async function canAddDomain(workspaceId: string): Promise<GateVerdict> {
  return verdict(async () => {
    const r = await checkUsageLimit(workspaceId, "domains", 1);
    return ok(r.entitlement.planName, r.used, r.limit);
  });
}

export async function canUseAI(workspaceId: string): Promise<GateVerdict> {
  return verdict(async () => {
    await requireEntitlement(workspaceId, "ai_personalization");
    const decision = await evaluateEntitlement(workspaceId, "ai_monthly", 1);
    if (!decision.allowed) {
      throw new EntitlementError({
        code: "limit_reached",
        planName: decision.planName,
        resource: "ai_monthly",
        used: decision.used,
        limit: decision.limit,
        message: `You've used your AI personalization allowance for the ${decision.planName} plan (${decision.used.toLocaleString()} of ${(decision.limit ?? 0).toLocaleString()}).`,
      });
    }
    return ok(decision.planName, decision.used, decision.limit);
  });
}

export async function canSend(workspaceId: string, amount = 1): Promise<GateVerdict> {
  return verdict(async () => {
    const decision = await evaluateEntitlement(workspaceId, "emails_monthly", amount);
    const entitlement = await getEntitlement(workspaceId);
    if (!decision.allowed) {
      throw new EntitlementError({
        code: "limit_reached",
        planName: decision.planName,
        resource: "emails_monthly",
        used: decision.used,
        limit: decision.limit,
        message: `You've reached your email allowance for the ${decision.planName} plan (${decision.used.toLocaleString()} of ${(decision.limit ?? 0).toLocaleString()} emails). Upgrade your plan to keep sending.`,
      });
    }
    return ok(entitlement.planName, decision.used, decision.limit);
  });
}

/**
 * Everything a customer surface needs to show usage, disable actions and
 * explain why — resolved from the same authority the mutations use, so the two
 * can never disagree.
 */
export async function getWorkspaceGates(workspaceId: string) {
  const [entitlement, mailboxes, warmup, contacts, campaigns, members] = await Promise.all([
    getEntitlement(workspaceId),
    mailboxCapacity(workspaceId),
    canUseWarmup(workspaceId),
    canAddContact(workspaceId),
    canCreateCampaign(workspaceId),
    canInviteTeamMember(workspaceId),
  ]);
  return {
    planName: entitlement.planName,
    planId: entitlement.planId,
    active: entitlement.active,
    mailboxes,
    warmup: { allowed: warmup.allowed, reason: warmup.reason },
    contacts: { allowed: contacts.allowed, reason: contacts.reason, used: contacts.used, limit: contacts.limit },
    campaigns: { allowed: campaigns.allowed, reason: campaigns.reason, used: campaigns.used, limit: campaigns.limit },
    teamMembers: { allowed: members.allowed, reason: members.reason, used: members.used, limit: members.limit },
  };
}

/** Live counts + caps for the Billing usage panel, from the one usage service. */
export async function getPlanUsageForBilling(workspaceId: string) {
  const [entitlement, mailboxes, leads, campaigns, members, emails] = await Promise.all([
    getEntitlement(workspaceId),
    mailboxCapacity(workspaceId),
    getUsage(workspaceId, "leads"),
    getUsage(workspaceId, "campaigns"),
    getUsage(workspaceId, "team_members"),
    getUsage(workspaceId, "emails_monthly"),
  ]);
  return {
    planName: entitlement.planName,
    usage: {
      emailsThisMonth: emails,
      sendingAccounts: mailboxes.used,
      leads,
      campaigns,
      users: members,
    },
    limits: {
      emailsMonthly: entitlement.limits["max_emails_monthly"],
      sendingAccounts: mailboxes.limit,
      leads: entitlement.limits["max_leads"],
      campaigns: entitlement.limits["max_campaigns"],
      users: entitlement.limits["max_users"],
    },
  };
}
