import { describe, expect, it, vi } from "vitest";
import { messageDb } from "./helpers/message-db";
const fixture = vi.hoisted(() => ({ db: {} as any }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => fixture.db.from(table) } }));
import { applyDeliveryState } from "@/lib/delivery-state.server";

describe("throwaway delivery transition races", () => {
  it("re-reads after a lost write and never overwrites a concurrent bounce", async () => {
    const row = { id: "throwaway-message", status: "sent", delivery_status: "sent", updated_at: "v1" };
    let raced = false;
    fixture.db = messageDb({ campaign_messages: [row], conversation_messages: [] }, [], () => {
      if (!raced) { raced = true; Object.assign(row, { delivery_status: "bounced", status: "failed", bounced_at: "2026-11-06T09:00:00Z", updated_at: "v2" }); }
    });
    expect(await applyDeliveryState({ message: { id: row.id, status: "sent", delivery_status: "sent" }, state: "delivered", occurredAt: "2026-11-06T10:00:00Z" })).toBe("bounced");
    expect(row.delivery_status).toBe("bounced");
  });
  it("replayed events retain original timestamps and cause no duplicate writes", async () => {
    const row = { id: "throwaway-replay", status: "sent", delivery_status: "sent", updated_at: "v1" };
    const updates: Record<string, unknown>[] = [];
    fixture.db = messageDb({ campaign_messages: [row], conversation_messages: [] }, updates);
    const args = { message: row, state: "delivered" as const, occurredAt: "2026-11-06T10:00:00Z" };
    await applyDeliveryState(args); await applyDeliveryState(args);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.delivered_at).toBe(args.occurredAt);
  });
});