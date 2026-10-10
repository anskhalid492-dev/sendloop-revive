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

const IS_NULL = vi.hoisted(() => Symbol("is-null"));
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
        if (operation === "update") {
          // Behave like PostgREST: apply only when every filter matches and
          // return the affected rows, so compare-and-swap writes are realistic.
          const matches = !!row && Object.entries(filters).every(([key, expected]) =>
            expected === IS_NULL ? row[key] == null : row[key] === expected);
          if (matches && row && value) Object.assign(row, value);
          return { data: matches && row ? [{ id: row["id"] }] : [], error: null };
        }
        if (operation === "upsert" && value) {
          const key = String(value["external_id"]);
          if (!fixture.engagement.has(key)) fixture.engagement.set(key, value);
        }
        return { data: null, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (key: string, val: unknown) => { filters[key] = val; return builder; },
        is: (key: string, val: unknown) => { filters[key] = val === null ? IS_NULL : val; return builder; },
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

describe("open persistence remediation regressions", () => {
  const loggedText = () =>
    [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.log).mock.calls]
      .flat().map((item) => (item instanceof Error ? `${item.message} ${item.stack}` : String(item))).join(" ");

  it("counts every one of several concurrent raw hits exactly once", async () => {
    await Promise.all([1, 2, 3, 4].map(() => recordOpenHit({ target })));
    expect(fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["open_count"]).toBe(4);
    expect(writes().filter((call) => call.table === "email_open_events")).toHaveLength(4);
    expect(fixture.engagement.size).toBe(1);
  });
  it("does not lose conversation raw counts under concurrency", async () => {
    const conversation = addConversation();
    await Promise.all([recordOpenHit({ target: conversation }), recordOpenHit({ target: conversation })]);
    expect(fixture.rows.get(`conversation_messages:${fixture.messageId}`)?.["open_count"]).toBe(2);
  });
  it("sets first-opened once and keeps it on later concurrent hits", async () => {
    await recordOpenHit({ target });
    const first = fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["opened_at"];
    expect(first).toBeTruthy();
    await Promise.all([recordOpenHit({ target }), recordOpenHit({ target })]);
    expect(fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["opened_at"]).toBe(first);
  });
  it("preserves a pre-existing historical count and only adds to it", async () => {
    fixture.rows.set(`campaign_messages:${fixture.messageId}`, { ...campaignRow(), open_count: 7 });
    await recordOpenHit({ target });
    expect(fixture.rows.get(`campaign_messages:${fixture.messageId}`)?.["open_count"]).toBe(8);
  });
  it("reports partial_write while keeping the raw event when the count update fails", async () => {
    fixture.failures.set("campaign_messages:update", "synthetic update failure");
    expect(await recordOpenHit({ target })).toEqual({ recorded: false, isPrefetch: false, reason: "partial_write" });
    expect(writes().filter((call) => call.table === "email_open_events")).toHaveLength(1);
  });
  it("does not emit the open automation when the analytics mirror failed", async () => {
    fixture.failures.set("email_engagement_events:upsert", "synthetic mirror failure");
    expect(await recordOpenHit({ target })).toMatchObject({ recorded: false, reason: "partial_write" });
    expect(fixture.emit).not.toHaveBeenCalled();
  });
  it("still reports success when only the best-effort automation emit fails", async () => {
    fixture.emit.mockRejectedValueOnce(new Error("automation down throwaway-open-review@example.test"));
    expect(await recordOpenHit({ target })).toMatchObject({ recorded: true });
    expect(loggedText()).not.toContain("throwaway-open-review@example.test");
  });
  it.each([
    ["email_open_events:insert", "campaign"],
    ["campaign_messages:update", "campaign"],
    ["email_engagement_events:upsert", "campaign"],
    ["campaign_messages:read", "campaign"],
    ["conversation_messages:read", "conversation"],
    ["conversation_messages:update", "conversation"],
    ["email_open_events:insert", "conversation"],
  ] as const)("never logs recipient, token or secret from a %s (%s) error", async (failure, kind) => {
    const token = buildOpenToken(target);
    const secretValue = process.env["OPEN_TRACKING_SECRET"]!;
    const canary = "throwaway-leak-canary@example.test";
    fixture.failures.set(failure, `boom ${canary} ${token} ${secretValue}`);
    await recordOpenHit({ target: kind === "conversation" ? addConversation() : target });
    const text = loggedText();
    expect(text.length).toBeGreaterThan(0);
    for (const sensitive of [canary, token, secretValue, "throwaway-open-review@example.test"]) {
      expect(text).not.toContain(sensitive);
    }
  });
  it("ignores token campaign/lead hints even when the conversation exists in the same workspace", async () => {
    await recordOpenHit({ target: { ...addConversation(), campaignId: fixture.campaignId, leadId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", email: "spoof@example.test" } });
    const event = writes().find((call) => call.table === "email_open_events")?.value;
    expect(event).toMatchObject({ campaign_id: null, lead_id: null, recipient_email: "throwaway-open-review@example.test" });
  });
});

