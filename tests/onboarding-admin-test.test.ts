import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/managed-sending.server", () => ({
  resolveManagedProvider: async () => ({ provider: "resend", providerId: "onboarding-test-provider", credentials: {} }),
  recordProviderIncident: async () => {},
}));
vi.mock("@/lib/providers/adapter.server", () => ({ getAdapter: () => ({ sendEmail: mocks.send }) }));
vi.mock("@/lib/email-providers/ses-api.server", () => ({ resolveSesCredentials: () => null }));
vi.mock("@/lib/provider-pool.server", () => ({ isProviderAllowedForScope: async () => false }));
vi.mock("@/lib/system-email-maileroo.server", () => ({ resolveSystemMaileroo: async () => null }));
vi.mock("@/lib/worker-lease.server", () => ({ acquireWorkerLease: mocks.reserve }));

import { checkActionNotice } from "@/lib/engagement-notices.server";
import { deliverTransactional, type TransactionalSettings } from "@/lib/transactional-email.server";

const owner = "onboarding-test-owner";
const recipient = "onboarding-test-owner@example.invalid";
const settings: TransactionalSettings = {
  enabled: true, paused: false, test_mode: false, from_name: "MunchReach",
  from_email: "accounts@munchreach.com", reply_to: "support@munchreach.com",
  retry_count: 3, retry_delay_seconds: 300, batch_size: 25,
};
const row = {
  id: "onboarding-test-message", event_key: "onboarding.leads_imported", user_id: owner,
  to_email: recipient, from_email: null, reply_to: null, subject: "Test", html: null, text_body: "Test",
};

function fakeDb(options: { optedOut?: boolean; suppressed?: boolean; subscriber?: string; failed?: boolean; banned?: boolean; unknownRecipient?: boolean } = {}) {
  const reads: string[] = [];
  return {
    reads,
    auth: { admin: { getUserById: async (id: string) => {
      if (id !== owner) throw new Error("Unscoped test account");
      return { data: { user: { id, email: recipient, ...(options.banned ? { banned_until: "2999-01-01T00:00:00Z" } : {}) } }, error: null };
    } } },
    from(table: string) {
      reads.push(table);
      const result = () => ({
        data: table === "profiles" ? options.unknownRecipient ? null : { id: owner }
          : table === "notification_preferences" ? { email_enabled: !options.optedOut }
          : table === "email_suppressions" ? options.suppressed ? [{ id: "onboarding-test-suppression" }] : []
          : table === "marketing_subscribers" ? options.subscriber ? [{ status: options.subscriber }] : []
          : null,
        error: options.failed ? { message: "fixture read failure" } : null,
      });
      const chain: any = {
        select: () => chain, eq: (_key: string, value: unknown) => {
          if (_key === "email" && value !== recipient) throw new Error("Unscoped test recipient");
          if (_key === "user_id" && value !== owner) throw new Error("Unscoped test account");
          return chain;
        }, limit: () => chain, maybeSingle: async () => result(),
        then: (resolve: any) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  };
}

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ ok: true, messageId: "onboarding-test-provider-message" });
  mocks.reserve.mockReset().mockResolvedValue(null);
});

describe("trusted admin onboarding test — isolated named recipient, no external sends", () => {
  it.each(["onboarding.leads_imported", "onboarding.mailbox_ready"])("sends %s without workspace or completed action, and never reserves a customer cooldown", async (event_key) => {
    const db = fakeDb();
    const outcome = await deliverTransactional(db, { ...row, event_key }, settings, { adminTest: true });
    expect(outcome.ok).toBe(true);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[1].to).toBe(recipient);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(db.reads).not.toContain("workspaces");
    expect(db.reads).not.toContain("transactional_emails");
  });
  it("ordinary automatic delivery still requires workspace context", async () => {
    expect((await deliverTransactional(fakeDb(), row, settings)).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("stored test_mode alone cannot bypass automatic relevance checks", async () => {
    const storedTest = { ...row, test_mode: true };
    expect((await deliverTransactional(fakeDb(), storedTest, settings)).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("checks recipient preferences rather than the initiating admin", async () => {
    const outcome = await deliverTransactional(fakeDb({ optedOut: true }), { ...row, user_id: "onboarding-test-admin" }, settings, { adminTest: true });
    expect(outcome.ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("suppressed recipients cannot receive test emails", async () => {
    expect((await deliverTransactional(fakeDb({ suppressed: true }), row, settings, { adminTest: true })).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["unsubscribed", "bounced", "complained", "suppressed"])("retains %s protection", async (subscriber) => {
    expect((await deliverTransactional(fakeDb({ subscriber }), row, settings, { adminTest: true })).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("banned recipients cannot receive onboarding tests", async () => {
    expect((await checkActionNotice(fakeDb({ banned: true }), row, { adminTest: true })).decision).toBe("cancel");
  });
  it("safety read failures do not allow tests to send", async () => {
    expect((await deliverTransactional(fakeDb({ failed: true }), row, settings, { adminTest: true })).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("can test a non-customer recipient without onboarding state", async () => {
    expect((await checkActionNotice(fakeDb({ unknownRecipient: true }), row, { adminTest: true })).decision).toBe("send");
  });
});