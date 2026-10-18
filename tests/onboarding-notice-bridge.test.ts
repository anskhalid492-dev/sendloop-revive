import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ optedOut: false, connected: 1, leads: 0, campaigns: 0, active: true, enabled: true, automation: false, fail: false, queued: [] as any[], keys: new Set<string>() }));
vi.mock("@/lib/transactional-email.server", () => ({ triggerTransactionalEmail: async (_db: unknown, input: any) => {
  if (fixture.keys.has(input.idempotencyKey)) return { queued: false };
  fixture.keys.add(input.idempotencyKey); fixture.queued.push(input); return { queued: true };
} }));
import { checkActionNotice, notifyOnboardingAction } from "@/lib/engagement-notices.server";
const owner = "engagement-test-owner";
const workspaceId = "engagement-test-workspace";
const email = "engagement-test-owner@example.invalid";
const client = {
  auth: { admin: { getUserById: async (id: string) => { if (id !== owner) throw new Error("Unscoped test account"); return { data: { user: fixture.active ? { id, email } : null } }; } } },
  from: (table: string) => {
    const result = () => {
      const data = table === "workspaces" ? { owner_id: owner, status: "active", name: "Test workspace" } : table === "profiles" ? { email, full_name: "Test Owner" } : table === "notification_preferences" ? { email_enabled: !fixture.optedOut } : table === "transactional_templates" ? { enabled: fixture.enabled } : table === "marketing_automations" ? fixture.automation ? [{ id: "engagement-test-automation" }] : [] : [];
      return { data, error: fixture.fail ? { message: "read failed" } : null, count: table === "mailboxes" ? fixture.connected : table === "leads" ? fixture.leads : table === "campaigns" ? fixture.campaigns : 0 };
    };
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve) };
    return chain;
  },
};
const row = { event_key: "onboarding.mailbox_ready", user_id: owner, workspace_id: workspaceId, to_email: email };
beforeEach(() => { Object.assign(fixture, { optedOut: false, connected: 1, leads: 0, campaigns: 0, active: true, enabled: true, automation: false, fail: false }); fixture.queued.length = 0; fixture.keys.clear(); });
describe("action-confirmed System Emails bridge — named throwaway fixture only", () => {
  it("repeated successful connection uses same stable owner/workspace key", async () => { await notifyOnboardingAction(client, workspaceId, "onboarding.mailbox_ready"); await notifyOnboardingAction(client, workspaceId, "onboarding.mailbox_ready"); expect(fixture.queued).toHaveLength(1); expect(fixture.queued[0].idempotencyKey).toBe(`onboarding.mailbox_ready:${owner}:${workspaceId}`); });
  it("cannot notify opted-out owner", async () => { fixture.optedOut = true; await notifyOnboardingAction(client, workspaceId, "onboarding.mailbox_ready"); expect(fixture.queued).toHaveLength(0); });
  it("disabled template blocks automatic enqueue", async () => { fixture.enabled = false; await notifyOnboardingAction(client, workspaceId, "onboarding.mailbox_ready"); expect(fixture.queued).toHaveLength(0); });
  it("active marketing automation blocks potentially duplicate notices", async () => { fixture.automation = true; expect((await checkActionNotice(client, row)).decision).toBe("cancel"); });
  it("read errors never grant permission to send", async () => { fixture.fail = true; expect((await checkActionNotice(client, row)).decision).toBe("defer"); });
  it("rechecks state after queued reminder becomes outdated", async () => { expect((await checkActionNotice(client, row)).decision).toBe("send"); fixture.leads = 1; expect((await checkActionNotice(client, row)).decision).toBe("cancel"); });
  it("only successful saved imports with no campaign can notify", async () => { fixture.leads = 1; await notifyOnboardingAction(client, workspaceId, "onboarding.leads_imported"); expect(fixture.queued[0].variables.action_url).toBe("https://munchreach.com/campaigns"); fixture.campaigns = 1; expect((await checkActionNotice(client, { ...row, event_key: "onboarding.leads_imported" })).decision).toBe("cancel"); });
});