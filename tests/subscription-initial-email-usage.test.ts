import { beforeEach, describe, expect, test, vi } from "vitest";
import { dispatchDueMessages } from "@/lib/dispatch.server";
import { firstEmailStepOrder, isBillableInitialSend } from "@/lib/billing/initial-send";

// Campaign sends leave only through a mailbox the customer connected
// themselves (SMTP/IMAP via the relay). There is no shared-provider path.
const relaySend = vi.fn(async () => ({ ok: true, messageId: "provider-message-1", message: "sent" }));
vi.mock("@/lib/customer-mailbox-send.server", () => ({
  findCustomerMailbox: vi.fn(async () => ({ id: "smtp-mailbox-1", email_address: "sender@example.com" })),
  sendViaCustomerMailbox: (...args: unknown[]) => relaySend(...(args as [])),
}));

beforeEach(() => relaySend.mockClear());

const STEPS = [
  { step_order: 1, step_type: "email", subject: "Hello", body: "Hi" },
  { step_order: 2, step_type: "email", subject: "Re: Hello", body: "Bump" },
  { step_order: 3, step_type: "email", subject: "Re: Hello", body: "Last" },
];

const campaign = {
  id: "campaign-1",
  status: "active",
  daily_cap: 25,
  timezone: "Asia/Dubai",
  send_days: [0, 1, 2, 3, 4, 5, 6],
  send_start_hour: 20,
  send_end_hour: 23,
  start_at: null,
  end_at: null,
  open_tracking: false,
  click_tracking: false,
  text_only: true,
  ai_enabled: false,
  ai_config: null,
};

const message = {
  id: "message-1",
  to_email: "lead@example.com",
  subject: "Hello",
  body: "Hi there",
  sending_account_id: "mailbox-1",
  attempts: 0,
  scheduled_at: "2026-08-28T16:00:00.000Z",
  workspace_id: "workspace-1",
  campaign_id: "campaign-1",
  lead_id: "lead-1",
  recipient_id: "recipient-1",
  step_order: 1,
};

const account = {
  id: "mailbox-1",
  provider: "resend",
  provider_id: "provider-1",
  from_name: "MunchReach",
  from_email: "sender@example.com",
  reply_to: null,
  sent_today: 0,
  daily_limit: 50,
  last_sent_at: null,
  paused: false,
  customer_enabled: true,
  status: "active",
};

type FakeOptions = {
  due?: typeof message[];
  sentToday?: number;
  rollingUsage?: number;
  dailyCap?: number;
  mailboxLimit?: number;
  steps?: Array<Record<string, unknown>> | "error";
  claimLost?: boolean;
};

function fakeBackend(options: FakeOptions = {}) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const due = options.due ?? [message];

  class Query {
    table: string;
    operation = "select";
    columns = "";
    head = false;
    patch: Record<string, unknown> = {};

    constructor(table: string) { this.table = table; }
    select(columns = "", config?: { head?: boolean }) { this.columns = columns; this.head = Boolean(config?.head); return this; }
    update(patch: Record<string, unknown>) { this.operation = "update"; this.patch = patch; updates.push({ table: this.table, patch }); return this; }
    eq() { return this; }
    in() { return this; }
    is() { return this; }
    lte() { return this; }
    gte() { return this; }
    or() { return this; }
    order() { return this; }
    limit() { return this; }
    range() { return this; }
    maybeSingle() { return Promise.resolve(this.resolve(true)); }
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(this.resolve(false)).then(resolve, reject);
    }
    resolve(single: boolean) {
      if (this.table === "campaign_steps") {
        if (options.steps === "error") throw new Error("steps unavailable");
        return { data: options.steps ?? STEPS, error: null };
      }
      if (this.table === "campaigns" && single) {
        return { data: { ...campaign, daily_cap: options.dailyCap ?? campaign.daily_cap }, error: null };
      }
      if (this.table === "sending_accounts" && this.operation === "select") {
        return { data: [{ ...account, daily_limit: options.mailboxLimit ?? account.daily_limit }], error: null };
      }
      if (this.table === "campaign_messages" && this.operation === "update") {
        return { data: this.patch.status === "processing" ? (options.claimLost ? [] : [{ id: message.id }]) : null, error: null };
      }
      if (this.table === "campaign_messages" && this.head) {
        const count = this.columns === "id" ? (options.sentToday ?? 0) : 0;
        return { data: null, count, error: null };
      }
      if (this.table === "campaign_messages" && this.columns.includes("updated_at")) {
        return { data: [], error: null };
      }
      if (this.table === "campaign_messages" && this.columns === "sending_account_id") {
        return {
          data: Array.from({ length: options.rollingUsage ?? 0 }, () => ({ sending_account_id: account.id })),
          error: null,
        };
      }
      if (this.table === "campaign_messages" && this.columns.includes("to_email")) {
        return { data: due, error: null };
      }
      return { data: [], count: 0, error: null };
    }
  }

  return {
    client: {
      from: (table: string) => new Query(table),
      rpc: () => { throw new Error("lifetime campaign reservation must not be called"); },
    },
    updates,
  };
}

function dependencies(sendManagedEmail = vi.fn(async () => ({ ok: true, messageId: "provider-message-1" }))) {
  class TestEntitlementError extends Error {}
  return {
    sendManagedEmail,
    consumeUsage: vi.fn(async () => undefined),
    releaseUsage: vi.fn(async () => undefined),
    EntitlementError: TestEntitlementError,
    suppressedSet: vi.fn(async () => new Map<string, string>()),
    mintCleanReplyAddress: vi.fn(async () => "sender@example.com"),
    createOutboundRfcMessageId: vi.fn(() => "rfc-message-1@example.com"),
    messageIdHeader: vi.fn((value: string) => `<${value}>`),
    recordOutboundCampaignMessage: vi.fn(async () => undefined),
    registerOutboundMessage: vi.fn(async () => undefined),
    supabaseAdmin: {},
  };
}


const NOW = new Date("2026-08-28T16:00:00.000Z");
const initial = message;
const followUp = (n: number, id = `fu-${n}`) => ({ ...message, id, step_order: n });

async function run(opts: FakeOptions, deps = dependencies()) {
  const backend = fakeBackend(opts);
  const result = await dispatchDueMessages(backend.client as never, { campaignId: campaign.id, now: NOW }, deps);
  return { result, deps, backend };
}

describe("allowance rule helper", () => {
  test("first email step is the lowest real email step", () => {
    expect(firstEmailStepOrder(STEPS)).toBe(1);
    expect(firstEmailStepOrder([{ step_order: 0, step_type: "wait" }, ...STEPS])).toBe(1);
  });
  test("only the first step is billable; unknown is billable", () => {
    expect(isBillableInitialSend(1, 1)).toBe(true);
    expect(isBillableInitialSend(2, 1)).toBe(false);
    expect(isBillableInitialSend(4, 1)).toBe(false);
    expect(isBillableInitialSend(2, null)).toBe(true);
  });
});

describe("subscription allowance: initial emails count, follow-ups are free", () => {
  test("successful initial email consumes exactly 1", async () => {
    const { result, deps } = await run({ due: [initial] });
    expect(result.sent).toBe(1);
    expect(deps.consumeUsage).toHaveBeenCalledTimes(1);
    expect(deps.consumeUsage).toHaveBeenCalledWith("workspace-1", "emails_monthly", 1, "campaign_send");
    expect(deps.releaseUsage).not.toHaveBeenCalled();
  });

  test("failed initial email gives its reservation back (net 0)", async () => {
    relaySend.mockImplementationOnce(async () => ({ ok: false, messageId: "", message: "550 rejected" }) as never);
    const { result, deps } = await run({ due: [initial] });
    expect(result.sent).toBe(0);
    expect(deps.consumeUsage).toHaveBeenCalledTimes(1);
    expect(deps.releaseUsage).toHaveBeenCalledTimes(1);
  });

  test("initial outside the sending window (still queued) does not count", async () => {
    const backend = fakeBackend({ due: [initial] });
    const deps = dependencies();
    await dispatchDueMessages(backend.client as never, { campaignId: campaign.id, now: new Date("2026-08-28T15:59:00.000Z") }, deps);
    expect(deps.consumeUsage).not.toHaveBeenCalled();
  });

  test("concurrent worker that loses the claim releases its reservation (no double count)", async () => {
    const { result, deps } = await run({ due: [initial], claimLost: true });
    expect(result.sent).toBe(0);
    expect(deps.consumeUsage).toHaveBeenCalledTimes(1);
    expect(deps.releaseUsage).toHaveBeenCalledWith("workspace-1", "emails_monthly", 1, "duplicate_claim");
  });

  test("first and later follow-ups send without touching the allowance", async () => {
    const { result, deps } = await run({ due: [followUp(2), followUp(3)] });
    expect(result.sent).toBe(2);
    expect(deps.consumeUsage).not.toHaveBeenCalled();
    expect(deps.releaseUsage).not.toHaveBeenCalled();
  });

  test("follow-up retry stays free", async () => {
    const { result, deps } = await run({ due: [{ ...followUp(2), attempts: 2 }] });
    expect(result.sent).toBe(1);
    expect(deps.consumeUsage).not.toHaveBeenCalled();
  });

  test("failed follow-up neither consumes nor releases", async () => {
    relaySend.mockImplementationOnce(async () => ({ ok: false, messageId: "", message: "550 rejected" }) as never);
    const { deps, backend } = await run({ due: [followUp(2)] });
    expect(deps.consumeUsage).not.toHaveBeenCalled();
    expect(deps.releaseUsage).not.toHaveBeenCalled();
    expect(backend.updates.some(({ patch }) => patch.status === "cancelled")).toBe(false);
  });

  test("allowance exhausted: initial is held, follow-up still sends", async () => {
    const deps = dependencies();
    deps.consumeUsage.mockImplementation(async () => { throw new deps.EntitlementError("You've reached your monthly email limit"); });
    const held = await run({ due: [initial] }, deps);
    expect(held.result.sent).toBe(0);
    expect(held.backend.updates.some(({ patch }) => patch.status === "pending")).toBe(true);
    expect(relaySend).not.toHaveBeenCalled();

    const fu = await run({ due: [followUp(2)] }, deps);
    expect(fu.result.sent).toBe(1);
    expect(relaySend).toHaveBeenCalledTimes(1);
  });

  test("850 initials + 550 follow-ups meter 850", async () => {
    const due = [
      ...Array.from({ length: 850 }, (_, i) => ({ ...initial, id: `i-${i}`, recipient_id: `r-${i}` })),
      ...Array.from({ length: 550 }, (_, i) => followUp(2 + (i % 3), `f-${i}`)),
    ];
    const deps = dependencies();
    let metered = 0;
    for (const m of due) {
      const isInitial = isBillableInitialSend(m.step_order, firstEmailStepOrder(STEPS));
      if (isInitial) metered += 1;
    }
    expect(metered).toBe(850);
    expect(due.length).toBe(1400);
    // Spot-check through the real dispatcher on a mixed batch.
    const mixed = await run({ due: [initial, followUp(2), followUp(3)], dailyCap: 100 }, deps);
    expect(mixed.result.sent).toBe(3);
    expect(deps.consumeUsage).toHaveBeenCalledTimes(1);
  });

  test("step lookup failure keeps every send metered (never free by accident)", async () => {
    const { deps } = await run({ due: [followUp(2)], steps: "error" });
    expect(deps.consumeUsage).toHaveBeenCalledTimes(1);
  });
});
