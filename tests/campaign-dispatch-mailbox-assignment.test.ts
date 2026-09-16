import { beforeEach, describe, expect, test, vi } from "vitest";
import { dispatchDueMessages } from "@/lib/dispatch.server";

// Campaign sends leave only through a mailbox the customer connected
// themselves (SMTP/IMAP via the relay). There is no shared-provider path.
const relaySend = vi.fn(async () => ({ ok: true, messageId: "provider-message-1", message: "sent" }));
vi.mock("@/lib/customer-mailbox-send.server", () => ({
  findCustomerMailbox: vi.fn(async () => ({ id: "smtp-mailbox-1", email_address: "sender@example.com" })),
  sendViaCustomerMailbox: (...args: unknown[]) => relaySend(...(args as [])),
}));

beforeEach(() => relaySend.mockClear());

const NOW = new Date("2026-08-28T16:00:00.000Z"); // 20:00 Asia/Dubai

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
  sending_account_ids: ["mailbox-1"],
};

const baseMessage = {
  id: "message-1",
  to_email: "lead@example.com",
  subject: "Hello",
  body: "Hi there",
  sending_account_id: null as string | null,
  attempts: 0,
  scheduled_at: NOW.toISOString(),
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

function fakeBackend(options: { accounts?: Array<Record<string, unknown>>; due?: Array<Record<string, unknown>> } = {}) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const due = options.due ?? [{ ...baseMessage }];
  const accounts = options.accounts ?? [account];

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
      if (this.table === "campaigns" && single) return { data: campaign, error: null };
      if (this.table === "sending_accounts" && this.operation === "select") return { data: accounts, error: null };
      if (this.table === "campaign_messages" && this.operation === "update") {
        return { data: this.patch.status === "processing" ? [{ id: baseMessage.id }] : null, error: null };
      }
      if (this.table === "campaign_messages" && this.head) return { data: null, count: 0, error: null };
      if (this.table === "campaign_messages" && this.columns.includes("updated_at")) return { data: [], error: null };
      if (this.table === "campaign_messages" && this.columns === "sending_account_id") return { data: [], error: null };
      if (this.table === "campaign_messages" && this.columns.includes("to_email")) return { data: due, error: null };
      return { data: [], count: 0, error: null };
    }
  }

  return { client: { from: (table: string) => new Query(table), rpc: () => { throw new Error("no rpc"); } }, updates };
}

function dependencies() {
  class TestEntitlementError extends Error {}
  return {
    sendManagedEmail: vi.fn(async () => ({ ok: true, messageId: "provider-message-1" })),
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

describe("mailbox assignment during dispatch", () => {
  test("a message with no mailbox is assigned from the campaign pool and sent", async () => {
    const backend = fakeBackend();
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, { campaignId: campaign.id, now: NOW }, deps);

    expect(backend.updates.some(({ patch }) => patch.sending_account_id === "mailbox-1")).toBe(true);
    expect(relaySend).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  test("temporary mailbox unavailability keeps the message scheduled, never failed", async () => {
    const backend = fakeBackend({ accounts: [{ ...account, paused: true }] });
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, { campaignId: campaign.id, now: NOW }, deps);

    expect(relaySend).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    const deferral = backend.updates.find(({ patch }) => patch.status === "scheduled");
    expect(deferral).toBeTruthy();
    expect(new Date(String(deferral?.patch.scheduled_at)).getTime()).toBeGreaterThan(NOW.getTime());
    expect(backend.updates.some(({ patch }) => patch.status === "failed")).toBe(false);
  });

  test("a message that already has a mailbox is not reassigned", async () => {
    const backend = fakeBackend({ due: [{ ...baseMessage, sending_account_id: "mailbox-1" }] });
    const deps = dependencies();
    const result = await dispatchDueMessages(backend.client as never, { campaignId: campaign.id, now: NOW }, deps);

    expect(result.sent).toBe(1);
    const reassignments = backend.updates.filter(
      ({ patch }) => Object.keys(patch).length === 1 && "sending_account_id" in patch,
    );
    expect(reassignments).toHaveLength(0);
  });
});
