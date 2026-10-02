import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reply notifications fan out through the unchanged enqueue path. These tests
 * pin the existing behaviour: one email per inbound Message-ID per eligible
 * member, keyed `<eventKey>:<Message-ID>:<userId>`, no thread/cooldown suppression.
 */
const queued: Array<Record<string, unknown>> = [];
const keys = new Set<string>();

const members: Record<string, string[]> = { w1: ["u1", "u2"], w2: ["u3"] };
const profiles: Record<string, { id: string; email: string; first_name: string }> = {
  u1: { id: "u1", email: "u1@x.com", first_name: "A" },
  u2: { id: "u2", email: "u2@x.com", first_name: "B" },
  u3: { id: "u3", email: "u3@x.com", first_name: "C" },
};
const prefs: Array<Record<string, unknown>> = [];

function q(table: string) {
  let filter: { col: string; vals: unknown[] } | null = null;
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, v: unknown) => { filter = { col, vals: [v] }; return b; },
    in: (col: string, v: unknown[]) => { filter = { col, vals: v }; return b; },
    maybeSingle: async () => ({ data: table === "workspaces" ? { id: filter?.vals[0], name: "WS" } : null }),
    then: (r: (v: unknown) => unknown) => {
      let data: unknown[] = [];
      if (table === "workspace_members") data = (members[filter!.vals[0] as string] ?? []).map((user_id) => ({ user_id }));
      if (table === "profiles") data = (filter!.vals as string[]).map((id) => profiles[id]).filter(Boolean);
      if (table === "notification_preferences") data = prefs.filter((p) => (filter!.vals as string[]).includes(p["user_id"] as string));
      return Promise.resolve({ data, error: null }).then(r);
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => q(t) } }));
vi.mock("@/lib/transactional-email.server", () => ({
  // Mirrors the real unique idempotency_key constraint on transactional_emails.
  triggerTransactionalEmail: async (_a: unknown, input: Record<string, unknown>) => {
    const key = input["idempotencyKey"] as string;
    if (keys.has(key)) return { queued: false, reason: "Already queued." };
    keys.add(key); queued.push(input);
    return { queued: true, id: key };
  },
}));

import { notifyPositiveReply, notifyReplyReceived } from "@/lib/positive-reply-notify.server";

const base = { conversationId: "c1", leadId: null, campaignId: null, leadEmail: "p@lead.com", replyBody: "hi" };

beforeEach(() => { queued.length = 0; keys.clear(); prefs.length = 0; });

describe("reply notifications through the transactional queue", () => {
  it("A/B/C/D: replies #1, #2, #3 with different Message-IDs each notify", async () => {
    for (const id of ["<A@x>", "<B@x>", "<C@x>"]) await notifyReplyReceived({ ...base, workspaceId: "w1", inboundMessageId: id });
    const forU1 = queued.filter((e) => e["userId"] === "u1").map((e) => e["idempotencyKey"]);
    expect(forU1).toEqual(["reply.received:<A@x>:u1", "reply.received:<B@x>:u1", "reply.received:<C@x>:u1"]);
  });

  it("E: the same Message-ID processed twice is deduplicated", async () => {
    await notifyReplyReceived({ ...base, workspaceId: "w1", inboundMessageId: "<A@x>" });
    await notifyReplyReceived({ ...base, workspaceId: "w1", inboundMessageId: "<A@x>" });
    expect(queued).toHaveLength(2); // u1 + u2 once each
  });

  it("F: every eligible member is notified; opted-out members are not", async () => {
    prefs.push({ user_id: "u2", email_enabled: true, new_replies: false });
    await notifyReplyReceived({ ...base, workspaceId: "w1", inboundMessageId: "<A@x>" });
    expect(queued.map((e) => e["to"])).toEqual(["u1@x.com"]);
  });

  it("G: workspaces stay isolated", async () => {
    await notifyReplyReceived({ ...base, workspaceId: "w2", inboundMessageId: "<A@x>" });
    expect(queued.map((e) => e["userId"])).toEqual(["u3"]);
    expect(queued.every((e) => e["workspaceId"] === "w2")).toBe(true);
  });

  it("positive replies keep their own event key alongside reply.received", async () => {
    await notifyReplyReceived({ ...base, workspaceId: "w2", inboundMessageId: "<P@x>" });
    await notifyPositiveReply({ ...base, workspaceId: "w2", inboundMessageId: "<P@x>" });
    expect(queued.map((e) => e["idempotencyKey"])).toEqual([
      "reply.received:<P@x>:u3",
      "positive_reply_notification:<P@x>:u3",
    ]);
  });
});
