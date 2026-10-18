/**
 * Customer billing server functions.
 *
 * Thin wrappers only: every helper is imported inside the handler so the
 * server-fn splitter never strips a runtime sibling.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  BillingEnvironment,
  BillingInterval,
  BillingProvider,
  SubscriptionState,
} from "@/lib/billing/model";

export type CheckoutProviderOption = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  available: boolean;
  /** Per-plan price-mapping status; a plan is purchasable only via its own entry. */
  plans: Record<string, { monthly: boolean; yearly: boolean; lifetime: boolean }>;
  reason: string | null;
};

export type CustomerBilling = {
  environment: BillingEnvironment;
  planId: string | null;
  planName: string;
  state: SubscriptionState | "none";
  active: boolean;
  /** "admin_grant" when staff provided the plan at no charge. */
  planSource: "subscription" | "admin_grant";
  grant: { planName: string; expiresAt: string | null } | null;

  provider: BillingProvider | null;
  interval: BillingInterval | null;
  amountCents: number;
  currency: string;
  nextBillingAt: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  accessUntil: string | null;
  graceUntil: string | null;
  canManagePaymentMethod: boolean;
  usage: {
    emailsThisMonth: number;
    sendingAccounts: number;
    leads: number;
    campaigns: number;
    users: number;
  };
  limits: {
    emailsMonthly: number | null;
    sendingAccounts: number | null;
    leads: number | null;
    campaigns: number | null;
    users: number | null;
  };
  invoices: {
    id: string;
    provider: string;
    number: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    issued_at: string;
    hosted_url: string | null;
    pdf_url: string | null;
  }[];
  transactions: {
    id: string;
    provider: string;
    kind: string;
    amount_cents: number;
    currency: string;
    status: string;
    occurred_at: string;
    description: string | null;
  }[];
};

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export const getCustomerBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }): Promise<CustomerBilling> => {
    const { assertWorkspaceMember } = await import("@/lib/billing/access.server");
    const { loadCustomerBilling } = await import("@/lib/billing/customer.server");
    await assertWorkspaceMember(context, data.workspaceId);
    return loadCustomerBilling(data.workspaceId);
  });

export const listCheckoutProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CheckoutProviderOption[]> => {
    const { availableProviders } = await import("@/lib/billing/customer.server");
    return availableProviders();
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; planId: string; interval: BillingInterval; provider: BillingProvider }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        planId: z.string().uuid(),
        interval: z.enum(["monthly", "yearly", "lifetime"]),
        provider: z.enum(["stripe", "paddle", "lemonsqueezy"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { assertWorkspaceBillingManager } = await import("@/lib/billing/access.server");
    const { createCheckoutSession } = await import("@/lib/billing/customer.server");
    await assertWorkspaceBillingManager(context, data.workspaceId);
    const cookie = getRequestHeader("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("sl_ref="));
    if (cookie) {
      const { claimAttribution } = await import("@/lib/referral.server");
      const { data: auth } = await context.supabase.auth.getUser();
      if (auth.user) await claimAttribution({ code: cookie.slice("sl_ref=".length), userId: context.userId, userEmail: auth.user.email ?? null, signedUpAt: auth.user.created_at, workspaceId: data.workspaceId });
    }
    return createCheckoutSession({ ...data, userId: context.userId });
  });

export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; planId: string; interval: BillingInterval }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        planId: z.string().uuid(),
        interval: z.enum(["monthly", "yearly"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertWorkspaceBillingManager } = await import("@/lib/billing/access.server");
    const { changePlan } = await import("@/lib/billing/customer.server");
    await assertWorkspaceBillingManager(context, data.workspaceId);
    return changePlan({ ...data, userId: context.userId });
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; immediately?: boolean }) =>
    z.object({ workspaceId: z.string().uuid(), immediately: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertWorkspaceBillingManager } = await import("@/lib/billing/access.server");
    const { cancelForWorkspace } = await import("@/lib/billing/customer.server");
    await assertWorkspaceBillingManager(context, data.workspaceId);
    return cancelForWorkspace(data.workspaceId, context.userId, data.immediately === true);
  });

export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWorkspaceBillingManager } = await import("@/lib/billing/access.server");
    const { resumeForWorkspace } = await import("@/lib/billing/customer.server");
    await assertWorkspaceBillingManager(context, data.workspaceId);
    return resumeForWorkspace(data.workspaceId, context.userId);
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; returnUrl: string }) =>
    z.object({ workspaceId: z.string().uuid(), returnUrl: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    const { assertWorkspaceBillingManager } = await import("@/lib/billing/access.server");
    const { portalForWorkspace } = await import("@/lib/billing/customer.server");
    await assertWorkspaceBillingManager(context, data.workspaceId);
    return portalForWorkspace(data.workspaceId, data.returnUrl);
  });

/**
 * Plan entitlements (feature matrix, limits, credit balance) for the current
 * workspace. The UI uses this to lock features; the server re-checks on write.
 */
export const getWorkspaceEntitlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWorkspaceMember } = await import("@/lib/billing/access.server");
    const { getEntitlement } = await import("@/lib/billing/entitlements.server");
    await assertWorkspaceMember(context, data.workspaceId);
    return getEntitlement(data.workspaceId);
  });

/**
 * Plan gates for the current workspace: what the customer may do right now and
 * why not, resolved from the same service the server mutations enforce with.
 * The UI uses this to disable actions and show upgrade prompts; it is never the
 * authority.
 */
export const getPlanGates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWorkspaceMember } = await import("@/lib/billing/access.server");
    const { getWorkspaceGates } = await import("@/lib/billing/gates.server");
    await assertWorkspaceMember(context, data.workspaceId);
    return getWorkspaceGates(data.workspaceId);
  });

/** Credit balance + recent ledger for a workspace the caller belongs to. */
export const getWorkspaceCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWorkspaceMember } = await import("@/lib/billing/access.server");
    const { getCreditBalance, listLedger } = await import("@/lib/billing/credits.server");
    await assertWorkspaceMember(context, data.workspaceId);
    const [balance, ledger] = await Promise.all([
      getCreditBalance(data.workspaceId),
      listLedger({ workspaceId: data.workspaceId, limit: 50 }),
    ]);
    return { balance, ledger };
  });

/**
 * Full entitlement diagnostics for a workspace the caller belongs to:
 * resolved plan, feature flags, credit balances and usage vs plan limits.
 */
export const getWorkspaceDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWorkspaceMember } = await import("@/lib/billing/access.server");
    const { loadWorkspaceDiagnostics } = await import("@/lib/billing/diagnostics.server");
    await assertWorkspaceMember(context, data.workspaceId);
    return loadWorkspaceDiagnostics(data.workspaceId);
  });

/**
 * Live plan usage for the customer usage dashboard: current plan, billing
 * period, every metered/derived resource with its limit, and credit balance.
 */
export const getWorkspaceUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => workspaceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertWorkspaceMember } = await import("@/lib/billing/access.server");
    const { getUsageSnapshot } = await import("@/lib/billing/usage.server");
    await assertWorkspaceMember(context, data.workspaceId);
    return getUsageSnapshot(data.workspaceId);
  });
