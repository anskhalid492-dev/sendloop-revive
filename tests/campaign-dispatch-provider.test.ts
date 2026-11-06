import { beforeEach, describe, expect, test, vi } from "vitest";
import { dispatchDueMessages, selectRetryableMessages } from "@/lib/dispatch.server";

// Campaign sends leave only through a mailbox the customer connected
// themselves (SMTP/IMAP via the relay). There is no shared-provider path.
const relaySend = vi.fn(async () => ({ ok: true, messageId: "provider-message-1", message: "sent" }));
vi.mock("@/lib/customer-mailbox-send.server", () => ({
  findCustomerMailbox: vi.fn(async () => ({ id: "smtp-mailbox-1", email_address: "sender@example.com" })),
  sendViaCustomerMailbox: (...args: unknown[]) => relaySend(...(args as [])),
}));

beforeEach(() => relaySend.mockClear());

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
      if (this.table === "campaigns" && single) {
        return { data: { ...campaign, daily_cap: options.dailyCap ?? campaign.daily_cap }, error: null };
      }
      if (this.table === "sending_accounts" && this.operation === "select") {
        return { data: [{ ...account, daily_limit: options.mailboxLimit ?? account.daily_limit }], error: null };
      }
      if (this.table === "campaign_messages" && this.operation === "update") {
        return { data: this.columns === "id" ? [{ id: message.id }] : null, error: null };
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

describe("campaign dispatcher reaches the provider at the configured Dubai window", () => {
  test.each([
    ["20:00", "2026-08-28T16:00:00.000Z"],
    ["20:01", "2026-08-28T16:01:00.000Z"],
    ["20:04", "2026-08-28T16:04:00.000Z"],
  ])("%s Dubai sends the queued message", async (_label, iso) => {
    const backend = fakeBackend();
    const deps = dependencies();
    const result = await dispatchDueMessages(
      backend.client as never,
      { campaignId: campaign.id, now: new Date(iso) },
      deps,
    );

    expect(relaySend).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(backend.updates.some(({ patch }) => patch.status === "sent" && patch.provider_message_id === "provider-message-1")).toBe(true);
  });

  test("an expired run deadline stops the batch without sending or losing the message", async () => {
    const backend = fakeBackend();
    const deps = dependencies();
    const result = await dispatchDueMessages(
      backend.client as never,
      {
        campaignId: campaign.id,
        now: new Date("2026-08-28T16:00:00.000Z"),
        deadlineAt: new Date(Date.now() - 1),
      },
      deps,
    );
    expect(relaySend).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    // The message is never failed or cancelled: the next cron run picks it up.
    expect(backend.updates.some(({ patch }) => patch.status === "failed" || patch.status === "cancelled")).toBe(false);
  });

  test("a deadline far in the future does not block the send", async () => {
    const backend = fakeBackend();
    const deps = dependencies();
    const result = await dispatchDueMessages(
      backend.client as never,
      {
        campaignId: campaign.id,
        now: new Date("2026-08-28T16:00:00.000Z"),
        deadlineAt: new Date(Date.now() + 60_000),
      },
      deps,
    );
    expect(relaySend).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });

  test("before 20:00 Dubai waits without calling the provider", async () => {
    const backend = fakeBackend();
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, {
      campaignId: campaign.id,
      now: new Date("2026-08-28T15:59:00.000Z"),
    }, deps);
    expect(relaySend).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  test("daily quota exhaustion waits for the next scheduled day", async () => {
    const backend = fakeBackend({ dailyCap: 1, sentToday: 1 });
    const deps = dependencies();
    await dispatchDueMessages(backend.client as never, {
      campaignId: campaign.id,
      now: new Date("2026-08-28T16:04:00.000Z"),
    }, deps);
    expect(relaySend).not.toHaveBeenCalled();
    expect(backend.updates.some(({ patch }) => patch.scheduled_at === "2026-08-29T16:00:00.000Z")).toBe(true);
  });

  test("rolling mailbox capacity exhaustion waits without provider send", async () => {
    const backend = fakeBackend({ rollingUsage: 1, mailboxLimit: 1 });
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, {
      campaignId: campaign.id,
      now: new Date("2026-08-28T16:04:00.000Z"),
    }, deps);
    expect(relaySend).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  test("a previous-day transient failure is retryable in today's window", async () => {
    const rows = [{
      id: "failed-message",
      status: "failed",
      attempts: 1,
      sent_at: null,
      provider_message_id: null,
      bounced_at: null,
      last_error: "Provider timeout",
      updated_at: "2026-08-27T16:04:00.000Z",
      created_at: "2026-08-27T16:00:00.000Z",
    }];
    expect(selectRetryableMessages(rows, new Date("2026-08-28T00:00:00.000Z"))).toEqual(rows);

    const retryMessage = { ...message, id: "failed-message", attempts: 1 };
    const backend = fakeBackend({ due: [retryMessage] });
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, {
      campaignId: campaign.id,
      now: new Date("2026-08-28T16:04:00.000Z"),
    }, deps);
    expect(relaySend).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });

  test("no eligible message produces no provider call or sent state", async () => {
    const backend = fakeBackend({ due: [] });
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, {
      campaignId: campaign.id,
      now: new Date("2026-08-28T16:04:00.000Z"),
    }, deps);
    expect(relaySend).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(backend.updates.some(({ patch }) => patch.status === "sent")).toBe(false);
  });
});
describe("automation trigger: Email sent", () => {
  test("fires exactly once, only after a confirmed send", async () => {
    const backend = fakeBackend();
    const emit = vi.fn(async () => ({ runs: 1 }));
    const result = await dispatchDueMessages(
      backend.client as never,
      { campaignId: campaign.id, now: new Date("2026-08-28T16:00:00.000Z") },
      { ...dependencies(), emitAutomationEvent: emit },
    );
    expect(result.sent).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    const sentCalls = emit.mock.calls.filter((c) => (c as unknown as [{ type: string }])[0].type === "email.sent");
    expect(sentCalls).toHaveLength(1);
    expect((sentCalls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
      type: "email.sent",
      idempotencyKey: "email.sent:message-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
    });
  });

  test("never fires when the provider rejects the email", async () => {
    relaySend.mockImplementationOnce(async () => ({ ok: false, messageId: "", message: "550 rejected" }) as never);
    const backend = fakeBackend();
    const emit = vi.fn(async () => ({ runs: 1 }));
    const result = await dispatchDueMessages(
      backend.client as never,
      { campaignId: campaign.id, now: new Date("2026-08-28T16:00:00.000Z") },
      { ...dependencies(), emitAutomationEvent: emit },
    );
    expect(result.sent).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(emit.mock.calls.some((c) => (c as unknown as [{ type: string }])[0].type === "email.sent")).toBe(false);
  });

  test("never fires when the email is outside its window (still queued)", async () => {
    const backend = fakeBackend();
    const emit = vi.fn(async () => ({ runs: 1 }));
    await dispatchDueMessages(
      backend.client as never,
      { campaignId: campaign.id, now: new Date("2026-08-28T15:59:00.000Z") },
      { ...dependencies(), emitAutomationEvent: emit },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(emit.mock.calls.some((c) => (c as unknown as [{ type: string }])[0].type === "email.sent")).toBe(false);
  });
});
