import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ inserts: [] as Array<Record<string, unknown>>, patches: [] as Array<Record<string, unknown>> }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from() {
  const chain = {
    insert(row: Record<string, unknown>) { state.inserts.push(row); return chain; },
    update(row: Record<string, unknown>) { state.patches.push(row); return chain; },
    select() { return chain; }, eq() { return chain; }, single() { return chain; },
    then(resolve: (value: unknown) => unknown) { return resolve({ data: { id: "throwaway-event" }, error: null }); },
  }; return chain;
} } }));
import { recordFailedMailboxInbound } from "@/lib/email-events.server";
import { normalizeInbound } from "@/lib/inbound-parse";

describe("mailbox reply failure recovery uses the existing inbound log", () => {
  it("persists a retryable event and preserves original reply/thread/timestamp", async () => {
    await recordFailedMailboxInbound({ from: "prospect@example.invalid", to: "alias@example.invalid", deliveredTo: "mailbox@example.invalid", messageId: "<throwaway-reply@example.invalid>", inReplyTo: "<throwaway-send@example.invalid>", text: "Tell me more", receivedAt: "2026-10-01T10:00:00Z" }, "CRM unavailable");
    expect(state.patches.at(-1)).toMatchObject({ status: "failed", failure_code: "reply_processing_failed" });
    const row = state.inserts.at(-1)!;
    expect(row.event_type).toBe("inbound");
    expect(normalizeInbound(row.payload as Record<string, unknown>)).toMatchObject({ text: "Tell me more", to: "mailbox@example.invalid", inReplyTo: "<throwaway-send@example.invalid>", receivedAt: "2026-10-01T10:00:00Z" });
  });
  it("fails safely rather than inventing an id for mail without Message-ID", async () => {
    await expect(recordFailedMailboxInbound({ from: "prospect@example.invalid", to: "mailbox@example.invalid" }, "failure")).rejects.toThrow("Message-ID");
  });
});