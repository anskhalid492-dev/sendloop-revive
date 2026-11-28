import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { findCampaignMessageByHeaders } from "@/lib/inbox.server";
import { replyToAccountScope } from "@/lib/mailbox-reply-to";

// Executes the real header-matching queries against named, in-memory fixtures.
const send = { id: "throwaway-message", workspace_id: "throwaway-workspace", campaign_id: "throwaway-campaign", lead_id: "throwaway-lead",
  sending_account_id: "throwaway-sender", provider_message_id: "send@example.test", to_email: "lead@example.test", sent_at: "2026-11-28T10:00:00Z" };
function db(configured: boolean, workspaceId = "throwaway-workspace") {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    sending_accounts: configured ? [{ id: "throwaway-sender", workspace_id: workspaceId, reply_to: "main@example.test" }] : [],
    outbound_messages: [{ ref_table: "campaign_messages", ref_id: send.id, provider_message_id: send.provider_message_id, sending_account_id: send.sending_account_id, workspace_id: workspaceId }],
    campaign_messages: [{ ...send, workspace_id: workspaceId }], conversation_messages: [],
  };
  return { from: (table: string) => {
    let rows = tables[table] ?? [];
    const q = { select: () => q, limit: (n: number) => { rows = rows.slice(0, n); return q; }, order: () => q,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return q; },
      not: (key: string) => { rows = rows.filter(row => row[key] != null); return q; },
      or: (filter: string) => { rows = rows.filter(row => typeof row["provider_message_id"] === "string" && filter.includes(row["provider_message_id"])); return q; },
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
    }; return q;
  } };
}
const reply = { from: "lead@example.test", to: "main@example.test", inReplyTo: "<send@example.test>", references: [] };
describe("configured main reply inbox header attribution", () => {
  it("matches the original campaign when a reply arrives at its configured Reply-To", async () => {
    const client = db(true);
    const scope = await replyToAccountScope(client, "throwaway-workspace", "throwaway-main", reply.to);
    const result = await findCampaignMessageByHeaders(client, reply, "throwaway-workspace", scope);
    expect(result?.message.id).toBe("throwaway-message");
    expect(result?.via).toBe("in_reply_to");
  });
  it("does not match the same message on an unconfigured different inbox", async () => {
    const client = db(false);
    const scope = await replyToAccountScope(client, "throwaway-workspace", "throwaway-main", reply.to);
    expect(await findCampaignMessageByHeaders(client, reply, "throwaway-workspace", scope)).toBeNull();
  });
  it("does not match another workspace even with the same Reply-To and Message-ID", async () => {
    const client = db(true, "throwaway-other-workspace");
    const scope = await replyToAccountScope(client, "throwaway-workspace", "throwaway-main", reply.to);
    expect(await findCampaignMessageByHeaders(client, reply, "throwaway-workspace", scope)).toBeNull();
  });
  it("does not guess a campaign for a reply without threading headers", async () => {
    const client = db(true);
    const scope = await replyToAccountScope(client, "throwaway-workspace", "throwaway-main", reply.to);
    expect(await findCampaignMessageByHeaders(client, { ...reply, inReplyTo: null }, "throwaway-workspace", scope)).toBeNull();
  });
});