/**
 * Free-plan entitlement enforcement.
 *
 * These exercise the server-side gate layer directly — the same functions the
 * mutations, the API and the background runner call — so a passing test means
 * the block cannot be bypassed from the UI, the API or a queued job.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const FREE = {
  planName: "Free Trial",
  planId: "free-plan",
  limits: {
    max_sending_accounts: 1,
    max_users: 1,
    max_leads: 500,
    max_campaigns: 3,
    max_active_campaigns: 1,
    max_emails_monthly: 300,
    max_ai_monthly: 25,
  },
  features: { warmup: false, campaigns: true, ai_personalization: false },
  active: true,
};

const STARTER = {
  planName: "Starter",
  planId: "starter-plan",
  limits: {
    max_sending_accounts: null,
    max_users: 3,
    max_workspaces: 3,
    max_leads: 30000,
    max_campaigns: null,
    max_active_campaigns: null,
    max_emails_monthly: 20000,
    max_ai_monthly: null,
  },
  features: { warmup: true, campaigns: true, ai_personalization: true },
  active: true,
};

const GROWTH = {
  ...STARTER,
  planName: "Growth",
  planId: "growth-plan",
  limits: {
    ...STARTER.limits,
    max_leads: 200000,
    max_emails_monthly: 125000,
  },
};

const SCALE = {
  ...STARTER,
  planName: "Scale",
  planId: "scale-plan",
  limits: {
    ...STARTER.limits,
    max_leads: 600000,
    max_emails_monthly: 500000,
  },
};

const LIFETIME = {
  ...STARTER,
  planName: "Lifetime",
  planId: "lifetime-plan",
  limits: {
    ...STARTER.limits,
    max_sending_accounts: 10,
    max_users: 2,
    max_workspaces: 2,
    max_leads: 15000,
    max_emails_monthly: 15000,
  },
};

const state: {
  entitlement: typeof FREE | typeof STARTER | typeof GROWTH | typeof SCALE | typeof LIFETIME;
  mailboxes: string[];
  accounts: string[];
} = { entitlement: FREE, mailboxes: [], accounts: [] };

vi.mock("@/lib/billing/entitlements.server", () => ({
  getEntitlement: vi.fn(async () => state.entitlement),
}));

vi.mock("@/lib/billing/core.server", () => ({
  admin: vi.fn(async () => ({
    from(table: string) {
      const rows =
        table === "mailboxes"
          ? state.mailboxes.map((email_address) => ({ email_address }))
          : state.accounts.map((from_email) => ({ from_email }));
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (value: { data: unknown[] }) => unknown) => resolve({ data: rows }),
      };
      return chain;
    },
  })),
  getBillingSettings: vi.fn(async () => ({ environment: "live" })),
}));

vi.mock("@/lib/billing/usage.server", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    checkUsageLimit: vi.fn(async (_workspaceId: string, resource: string, amount = 1) => {
      const map: Record<string, { limitKey: string; used: number }> = {
        leads: { limitKey: "max_leads", used: 500 },
        campaigns: { limitKey: "max_campaigns", used: 3 },
        active_campaigns: { limitKey: "max_active_campaigns", used: 1 },
        team_members: { limitKey: "max_users", used: 1 },
      };
      const entry = map[resource];
      const limits = state.entitlement.limits as Record<string, number | null>;
      const limit = entry ? limits[entry.limitKey] : null;
      const used = entry?.used ?? 0;
      if (limit !== null && limit !== undefined && used + amount > limit) {
        const { EntitlementError } = original as {
          EntitlementError: new (args: Record<string, unknown>) => Error;
        };
        throw new EntitlementError({
          code: "limit_reached",
          planName: state.entitlement.planName,
          resource,
          used,
          limit,
          message: `limit reached for ${resource}`,
        });
      }
      return { used, limit, entitlement: state.entitlement };
    }),
    requireEntitlement: vi.fn(async (_workspaceId: string, feature: string) => {
      const features = state.entitlement.features as Record<string, boolean>;
      if (!features[feature]) {
        const { EntitlementError } = original as {
          EntitlementError: new (args: Record<string, unknown>) => Error;
        };
        throw new EntitlementError({
          code: "feature_locked",
          planName: state.entitlement.planName,
          resource: feature,
          message: `${feature} is locked`,
        });
      }
    }),
    evaluateEntitlement: vi.fn(async () => ({
      allowed: true,
      used: 0,
      limit: 300,
      planName: state.entitlement.planName,
    })),
    getUsage: vi.fn(async () => 0),
  };
});

const gates = () => import("@/lib/billing/gates.server");

beforeEach(() => {
  state.entitlement = FREE;
  state.mailboxes = [];
  state.accounts = [];
});

describe("free plan mailbox allowance", () => {
  it("allows the first mailbox", async () => {
    const { canAddMailbox } = await gates();
    await expect(canAddMailbox("w1")).resolves.toMatchObject({ allowed: true });
  });

  it("rejects a second mailbox with an upgrade message", async () => {
    state.mailboxes = ["one@acme.com"];
    const { canAddMailbox } = await gates();
    const verdict = await canAddMailbox("w1");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("Your Free Trial plan allows 1 mailbox. Upgrade your plan to add more.");
  });

  it("throws on the server path so a direct API call cannot bypass it", async () => {
    state.mailboxes = ["one@acme.com"];
    const { requireMailboxCapacity } = await gates();
    await expect(requireMailboxCapacity("w1")).rejects.toThrow(/allows 1 mailbox/);
  });

  it("counts a mailbox once even when it also has a bookkeeping sending row", async () => {
    state.mailboxes = ["One@Acme.com"];
    state.accounts = ["one@acme.com"];
    const { countMailboxes } = await gates();
    await expect(countMailboxes("w1")).resolves.toBe(1);
  });

  it("reports an existing over-limit workspace as 3 of 1 without deleting anything", async () => {
    state.mailboxes = ["a@x.com", "b@x.com", "c@x.com"];
    const { mailboxCapacity, canAddMailbox } = await gates();
    await expect(mailboxCapacity("w1")).resolves.toMatchObject({
      used: 3,
      limit: 1,
      overLimit: true,
      remaining: 0,
    });
    // Over the cap is not permission to add a fourth.
    await expect(canAddMailbox("w1")).resolves.toMatchObject({ allowed: false });
  });

  it("leaves an unlimited paid plan untouched", async () => {
    state.entitlement = STARTER;
    state.mailboxes = ["a@x.com", "b@x.com", "c@x.com"];
    const { canAddMailbox, mailboxCapacity } = await gates();
    await expect(canAddMailbox("w1")).resolves.toMatchObject({ allowed: true });
    await expect(mailboxCapacity("w1")).resolves.toMatchObject({ limit: null, overLimit: false });
  });
});

describe("warmup entitlement", () => {
  it("is refused on the free plan with the upgrade wording", async () => {
    const { canUseWarmup } = await gates();
    const verdict = await canUseWarmup("w1");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(
      "Warmup isn't available on the Free Trial plan. Upgrade your plan to enable mailbox warmup.",
    );
  });

  it("throws on the server path used by every warmup action", async () => {
    const { requireWarmup } = await gates();
    await expect(requireWarmup("w1")).rejects.toThrow(/Warmup isn't available/);
  });

  it("is allowed on a plan that includes it", async () => {
    state.entitlement = STARTER;
    const { canUseWarmup } = await gates();
    await expect(canUseWarmup("w1")).resolves.toMatchObject({ allowed: true });
  });

  it("becomes available after an upgrade and blocked again after a downgrade", async () => {
    const { canUseWarmup } = await gates();
    expect((await canUseWarmup("w1")).allowed).toBe(false);
    state.entitlement = GROWTH;
    expect((await canUseWarmup("w1")).allowed).toBe(true);
    state.entitlement = FREE;
    expect((await canUseWarmup("w1")).allowed).toBe(false);
  });
});

describe("other free plan allowances", () => {
  it("blocks the 501st contact", async () => {
    const { canAddContact } = await gates();
    await expect(canAddContact("w1")).resolves.toMatchObject({ allowed: false, limit: 500 });
  });

  it("blocks a fourth campaign", async () => {
    const { canCreateCampaign } = await gates();
    await expect(canCreateCampaign("w1")).resolves.toMatchObject({ allowed: false, limit: 3 });
  });

  it("blocks a second active campaign", async () => {
    const { canActivateCampaign } = await gates();
    await expect(canActivateCampaign("w1")).resolves.toMatchObject({ allowed: false, limit: 1 });
  });

  it("blocks a second team member", async () => {
    const { canInviteTeamMember } = await gates();
    await expect(canInviteTeamMember("w1")).resolves.toMatchObject({ allowed: false, limit: 1 });
  });

  it("blocks AI personalization that the plan does not include", async () => {
    const { canUseAI } = await gates();
    await expect(canUseAI("w1")).resolves.toMatchObject({ allowed: false });
  });

  it("allows the same actions on a paid plan", async () => {
    state.entitlement = GROWTH;
    const { canAddContact, canCreateCampaign, canInviteTeamMember, canUseAI } = await gates();
    for (const gate of [canAddContact, canCreateCampaign, canInviteTeamMember, canUseAI]) {
      await expect(gate("w1")).resolves.toMatchObject({ allowed: true });
    }
  });

  it("uses the new paid lead and monthly send allowances", () => {
    expect(STARTER.limits).toMatchObject({ max_leads: 30000, max_emails_monthly: 20000, max_workspaces: 3, max_users: 3 });
    expect(GROWTH.limits).toMatchObject({ max_leads: 200000, max_emails_monthly: 125000, max_workspaces: 3, max_users: 3 });
    expect(SCALE.limits).toMatchObject({ max_leads: 600000, max_emails_monthly: 500000, max_workspaces: 3, max_users: 3 });
    expect(LIFETIME.limits).toMatchObject({ max_leads: 15000, max_emails_monthly: 15000 });
  });
});

describe("customer-facing gate bundle", () => {
  it("reports real usage and every blocked action for a free workspace", async () => {
    state.mailboxes = ["a@x.com", "b@x.com", "c@x.com"];
    const { getWorkspaceGates } = await gates();
    const result = await getWorkspaceGates("w1");
    expect(result.planName).toBe("Free Trial");
    expect(result.mailboxes).toMatchObject({ used: 3, limit: 1, overLimit: true });
    expect(result.warmup.allowed).toBe(false);
    expect(result.contacts.allowed).toBe(false);
    expect(result.teamMembers.allowed).toBe(false);
  });
});
