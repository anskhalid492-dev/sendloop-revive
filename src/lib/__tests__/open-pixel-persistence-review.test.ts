import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOpenToken, parseOpenToken } from "@/lib/open-tracking";
import { readPixelToken, Route } from "@/routes/api/public/open";

// Explicitly named throwaway fixtures; all database and automation IO is mocked.
const fixture = vi.hoisted(() => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const campaignId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  return {
    workspaceId, messageId, campaignId,
    rows: new Map<string, Record<string, unknown>>(),
    calls: [] as { table: string; operation: string; value: Record<string, unknown> | undefined; filters: Record<string, unknown> }[],
    failures: new Map<string, string>(),
    engagement: new Map<string, Record<string, unknown>>(),
    emit: vi.fn(async (_args: { idempotencyKey: string }) => ({ runs: 0 })),
  };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      let operation = "read";
      let value: Record<string, unknown> | undefined;
      const filters: Record<string, unknown> = {};
      const execute = async () => {
        fixture.calls.push({ table, operation, value, filters: { ...filters } });
        const failure = fixture.failures.get(`${table}:${operation}`);
        if (failure) return { data: null, error: { message: failure } };
        const row = fixture.rows.get(`${table}:${String(filters["id"])}`);
        if (operation === "read") return { data: row ? { ...row } : null, error: null };
        if (operation === "update" && row && value) Object.assign(row, value);
        if (operation === "upsert" && value) {
          const key = String(value["external_id"]);
          if (!fixture.engagement.has(key)) fixture.engagement.set(key, value);
        }
        return { data: null, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (key: string, val: unknown) => { filters[key] = val; return builder; },
        maybeSingle: execute,
        insert: (val: Record<string, unknown>) => { operation = "insert"; value = val; return builder; },
        update: (val: Record<string, unknown>) => { operation = "update"; value = val; return builder; },
        upsert: (val: Record<string, unknown>) => { operation = "upsert"; value = val; return builder; },
        then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/automation-engine.server", () => ({ emitAutomationEvent: fixture.emit }));
import { recordOpenHit } from "@/lib/open-tracking.server";

const target = { workspaceId: fixture.workspaceId, messageId: fixture.messageId, messageKind: "campaign" as const, campaignId: fixture.campaignId };
function campaignRow(messageId = fixture.messageId, campaignId = fixture.campaignId) {
  return { id: messageId, workspace_id: fixture.workspaceId, campaign_id: campaignId, lead_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", sending_account_id: null, to_email: "throwaway-open-review@example.test", opened_at: null, open_count: 0 };
}
function addConversation() {
  fixture.rows.set(`conversation_messages:${fixture.messageId}`, { id: fixture.messageId, workspace_id: fixture.workspaceId, to_email: "throwaway-open-review@example.test", first_opened_at: null, open_count: 0 });
  return { ...target, messageKind: "conversation" as const, campaignId: null };
}
const writes = () => fixture.calls.filter((call) => call.operation !== "read");

beforeEach(() => {
  fixture.rows.clear(); fixture.calls.length = 0; fixture.failures.clear(); fixture.engagement.clear(); fixture.emit.mockClear();
  fixture.rows.set(`campaign_messages:${fixture.messageId}`, campaignRow());
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("open persistence pre-deployment review", () => {
  it("records against authoritative message fields, not token campaign/lead/email hints", async () => {
    await recordOpenHit({ target: { ...target, campaignId: "wrong-campaign", leadId: "wrong-lead", email: "wrong@example.test" } });
    expect(writes().find((call) => call.table === "email_open_events")?.value).toMatchObject({ workspace_id: fixture.workspaceId, campaign_id: fixture.campaignId, recipient_email: "throwaway-open-review@example.test" });
  });
  it("does not write across workspace boundaries", async () => {
    expect(await recordOpenHit({ target: { ...target, workspaceId: "other-throwaway-workspace" } })).toMatchObject({ recorded: false, reason: "unknown_message" });
    expect(writes()).toHaveLength(0);
  });
  it("does not fall back from a missing campaign message to a warmup message", async () => {
    fixture.rows.clear();
    fixture.rows.set(`warmup_jobs:${fixture.messageId}`, campaignRow());
    expect(await recordOpenHit({ target })).toMatchObject({ recorded: false, reason: "unknown_message" });
    expect(writes()).toHaveLength(0);
    expect(fixture.calls.every((call) => !call.table.startsWith("warmup"))).toBe(true);
  });
  it("keeps conversation opens out of campaign engagement and automation", async () => {
    expect(await recordOpenHit({ target: addConversation() })).toMatchObject({ recorded: true });
    expect(fixture.engagement.size).toBe(0);
    expect(fixture.emit).not.toHaveBeenCalled();
    expect(writes().find((call) => call.table === "email_open_events")?.value?.["campaign_id"]).toBeNull();
  });
  it("does not trust unsupported campaign hints on an unlinked conversation", async () => {
    await recordOpenHit({ target: { ...addConversation(), campaignId: fixture.campaignId, leadId: "unverified-lead" } });
    expect(writes().find((call) => call.table === "email_open_events")?.value).toMatchObject({ campaign_id: null, lead_id: null });
  });
  it("keeps multiple campaigns and message identities separate", async () => {
    const secondId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const secondCampaign = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    fixture.rows.set(`campaign_messages:${secondId}`, campaignRow(secondId, secondCampaign));
    await recordOpenHit({ target });
    await recordOpenHit({ target: { ...target, messageId: secondId, campaignId: fixture.campaignId } });
    expect([...fixture.engagement.values()].map((row) => row["campaign_id"])).toEqual([fixture.campaignId, secondCampaign]);
  });
  it("keeps sequential repeated requests raw but unique campaign opens deduplicated", async () => {
    await recordOpenHit({ target }); await recordOpenHit({ target });
    expect(writes().filter((call) => call.table === "email_open_events")).toHaveLength(2);
    expect(fixture.engagement.size).toBe(1);
    expect(fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["open_count"]).toBe(2);
    expect(fixture.emit.mock.calls.map(([args]) => args.idempotencyKey)).toEqual([`email.opened:open:pixel:${fixture.messageId}`, `email.opened:open:pixel:${fixture.messageId}`]);
  });
  it("does not lose raw count increments on concurrent duplicate requests", async () => {
    await Promise.all([recordOpenHit({ target }), recordOpenHit({ target })]);
    expect(fixture.engagement.size).toBe(1);
    expect(fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["open_count"]).toBe(2);
  });
  it("reports campaign read errors without writing", async () => {
    fixture.failures.set("campaign_messages:read", "synthetic read failure");
    expect(await recordOpenHit({ target })).toMatchObject({ recorded: false, reason: "write_failed" });
    expect(writes()).toHaveLength(0);
  });
  it("reports conversation read errors rather than unknown message", async () => {
    const conversation = addConversation(); fixture.failures.set("conversation_messages:read", "synthetic read failure");
    expect(await recordOpenHit({ target: conversation })).toMatchObject({ recorded: false, reason: "write_failed" });
    expect(writes()).toHaveLength(0);
  });
  it.each(["campaign", "conversation"] as const)("reports %s event-save failure and stops later writes", async (kind) => {
    const selected = kind === "conversation" ? addConversation() : target;
    fixture.failures.set("email_open_events:insert", "synthetic write failure");
    expect(await recordOpenHit({ target: selected })).toMatchObject({ recorded: false, reason: "write_failed" });
    expect(writes()).toHaveLength(1);
    expect(fixture.emit).not.toHaveBeenCalled();
  });
  it.each(["campaign", "conversation"] as const)("does not claim full success when %s message-update fails", async (kind) => {
    const selected = kind === "conversation" ? addConversation() : target;
    fixture.failures.set(`${kind === "campaign" ? "campaign_messages" : "conversation_messages"}:update`, "synthetic update failure");
    expect(await recordOpenHit({ target: selected })).toMatchObject({ recorded: false });
  });
  it("surfaces failed analytics mirroring and permits a later retry to recover", async () => {
    fixture.failures.set("email_engagement_events:upsert", "synthetic mirror failure");
    const first = await recordOpenHit({ target });
    expect(fixture.engagement.size).toBe(0);
    fixture.failures.clear();
    expect(await recordOpenHit({ target })).toMatchObject({ recorded: true });
    expect(fixture.engagement.size).toBe(1);
    expect(first).toMatchObject({ recorded: false });
  });
  it("keeps privacy-prefetch events raw but out of unique engagement", async () => {
    expect(await recordOpenHit({ target, userAgent: "AppleMailProxy" })).toMatchObject({ recorded: true, isPrefetch: true });
    expect(fixture.engagement.size).toBe(0);
    expect(fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["opened_at"]).toBeNull();
    expect(fixture.emit).not.toHaveBeenCalled();
  });
  it("does not leak sensitive values carried inside database errors", async () => {
    const canary = "throwaway-sensitive-recipient@example.test";
    fixture.failures.set("email_open_events:insert", `failure details ${canary}`);
    await recordOpenHit({ target });
    const logged = vi.mocked(console.warn).mock.calls.flat().map((item) => item instanceof Error ? item.message : String(item)).join(" ");
    expect(logged).not.toContain(canary);
  });
  it("serves the same pixel for invalid signatures without any database call", async () => {
    const [payload] = buildOpenToken(target).split(".");
    const handler = (Route.options as unknown as { server: { handlers: { GET: (args: { request: Request }) => Promise<Response> } } }).server.handlers.GET;
    for (const suffix of ["", "%00", "%2B", "%20", ".extra"]) {
      const url = `https://example.test/api/public/open?t=${payload}.${"0".repeat(32)}${suffix}`;
      expect(parseOpenToken(readPixelToken(new URL(url)))).toBeNull();
      const response = await handler({ request: new Request(url) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/gif");
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 3).toString()).toBe("GIF");
    }
    expect(fixture.calls).toHaveLength(0);
  });
});