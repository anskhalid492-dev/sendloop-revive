import { describe, it, expect } from "vitest";
import { syncReplyCrm } from "@/lib/reply-crm.server";

const args = { workspaceId: "11111111-1111-4111-8111-111111111111", leadId: "22222222-2222-4222-8222-222222222222", inboundMessageId: "33333333-3333-4333-8333-333333333333", campaignId: null, conversationId: "44444444-4444-4444-8444-444444444444", prospect: "throwaway@example.invalid", subject: "Test reply", receivedIso: "2026-10-10T14:00:00Z", detected: "interested" as const };
function fake(fail: boolean, status = "new", stage = "new-stage") {
  const activities = new Map<string, unknown>();
  const writes: Array<{ table: string; row: Record<string, unknown>; filters: unknown[][] }> = [];
  const client = { from(table: string) {
    const filters: unknown[][] = [];
    let row: Record<string, unknown> | null = null;
    const api = {
      select() { return api; }, eq(...f: unknown[]) { filters.push(f); return api; }, is(...f: unknown[]) { filters.push(f); return api; }, order() { return api; }, maybeSingle() { return api; },
      update(r: Record<string, unknown>) { row = r; return api; }, upsert(r: Record<string, unknown>) { row = r; return api; },
      then(resolve: (v: unknown) => unknown) {
        if (row) {
          writes.push({ table, row, filters });
          if (fail && table === "leads") return resolve({ error: { message: "temporary database outage" } });
          if (table === "lead_activities") activities.set(String(row.id), row);
          return resolve({ error: null });
        }
        return resolve({ error: null, data: table === "leads" ? { id: args.leadId, status, stage_id: stage } : [{ id: "new-stage", key: "new", position: 0 }, { id: "reply-stage", key: "replied", position: 2 }, { id: "won-stage", key: "won", position: 4 }] });
      },
    }; return api;
  }};
  return { client, activities, writes };
}
describe("isolated reply CRM recovery", () => {
  it("replaying the same inbound UUID creates one activity", async () => {
    const db = fake(false);
    await syncReplyCrm(db.client, args); await syncReplyCrm(db.client, args);
    expect([...db.activities.values()].filter((a: any) => a.type === "replied")).toHaveLength(1);
    expect(db.writes.find(w => w.table === "leads")?.row).toMatchObject({ status: "interested", stage_id: "reply-stage", crm_stage: "engaged" });
    expect(db.writes.every(w => w.table === "lead_activities" || w.filters.some(f => f[0] === "workspace_id" && f[1] === args.workspaceId))).toBe(true);
  });
  it("a CRM failure is retryable and cannot create a premature activity", async () => {
    const db = fake(true);
    await expect(syncReplyCrm(db.client, args)).rejects.toThrow("Reply CRM update failed");
    expect(db.activities.size).toBe(0);
    const recovered = fake(false); await syncReplyCrm(recovered.client, args);
    expect([...recovered.activities.values()].filter((a: any) => a.type === "replied")).toHaveLength(1);
  });
  it("never drags a won deal backwards", async () => {
    const db = fake(false, "completed", "won-stage"); await syncReplyCrm(db.client, args);
    expect(db.writes[0]?.row.status).toBe("completed");
    expect(db.writes[0]?.row.stage_id).toBeUndefined();
  });
  it.each([null, "not_interested", "ooo"] as const)("does not create an interested opportunity for %s", async detected => {
    const db = fake(false); await syncReplyCrm(db.client, { ...args, detected });
    expect(db.writes[0]?.row.stage_id).toBeUndefined();
    expect(db.writes[0]?.row.status).not.toBe("interested");
  });
});