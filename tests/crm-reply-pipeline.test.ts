import { describe, expect, it } from "vitest";
import { classifyInbound } from "@/lib/inbox-model";
import { syncReplyCrm } from "@/lib/reply-crm.server";
import { autoStageForReply, canAutoAdvance, CANONICAL_STAGE_KEYS } from "@/lib/lead-stage-map";

const WS = "11111111-1111-4111-8111-111111111111";
const STAGES = ["new", "contacted", "replied", "interested", "meeting_booked", "won", "lost"].map((key, i) => ({ id: `${key}-stage`, key, name: key, position: i }));

function fake(status: string, stageId: string | null, stages = STAGES) {
  const writes: Array<{ table: string; row: Record<string, unknown> }> = [];
  const activities = new Map<string, Record<string, unknown>>();
  const client = { from(table: string) {
    let row: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "maybeSingle"]) api[m] = () => api;
    api.update = (r: Record<string, unknown>) => { row = r; return api; };
    api.upsert = (r: Record<string, unknown>) => { row = r; return api; };
    api.then = (resolve: (v: unknown) => unknown) => {
      if (row) {
        writes.push({ table, row });
        if (table === "lead_activities" && !activities.has(String(row.id))) activities.set(String(row.id), row);
        return resolve({ error: null });
      }
      return resolve({ error: null, data: table === "leads" ? { id: "lead", status, stage_id: stageId } : stages });
    };
    return api;
  } };
  return { client, writes, activities };
}
const args = (detected: ReturnType<typeof classifyInbound>) => ({ workspaceId: WS, leadId: "lead", inboundMessageId: "33333333-3333-4333-8333-333333333333", campaignId: "c1", conversationId: "conv", prospect: "throwaway@example.invalid", subject: "Re: hi", receivedIso: "2026-10-14T10:00:00Z", detected });
const leadWrite = (f: ReturnType<typeof fake>) => f.writes.find((w) => w.table === "leads")!.row;

describe("pipeline order", () => {
  it("has the seven stages in order", () => {
    expect([...CANONICAL_STAGE_KEYS]).toEqual(["new", "contacted", "replied", "interested", "meeting_booked", "won", "lost"]);
  });
});

describe("reply intent", () => {
  it.each(["Yes, tell me more.", "Interested, send me details.", "Can you share the pricing?", "Please send me a free mockup.", "I'd like to know more.", "Can we discuss this?"])("positive: %s", (b) => expect(classifyInbound("", b)).toBe("interested"));
  it.each(["Thanks.", "Who are you?", "What does this cost?", "OK"])("neutral/question stays unclassified: %s", (b) => expect(classifyInbound("", b)).toBeNull());
  it.each(["Not interested.", "No thanks."])("negative: %s", (b) => expect(classifyInbound("", b)).toBe("not_interested"));
  it.each(["Meeting confirmed for Tuesday at 3pm.", "I've booked a call for Thursday.", "Invite accepted, see you then."])("meeting: %s", (b) => expect(classifyInbound("", b)).toBe("meeting_booked"));
});

describe("automatic CRM moves", () => {
  it("positive reply moves a contacted lead to Interested, once", async () => {
    const f = fake("contacted", "contacted-stage");
    await syncReplyCrm(f.client, args("interested"));
    await syncReplyCrm(f.client, args("interested"));
    expect(leadWrite(f)).toMatchObject({ status: "interested", stage_id: "interested-stage" });
    expect([...f.activities.values()].filter((a) => a.type === "stage_changed")).toHaveLength(1);
    expect([...f.activities.values()].filter((a) => a.type === "replied")).toHaveLength(1);
  });
  it("neutral reply -> Replied", async () => {
    const f = fake("contacted", "contacted-stage");
    await syncReplyCrm(f.client, args(null));
    expect(leadWrite(f)).toMatchObject({ status: "replied", stage_id: "replied-stage" });
  });
  it("negative reply -> Replied, never Lost", async () => {
    const f = fake("contacted", "contacted-stage");
    await syncReplyCrm(f.client, args("not_interested"));
    expect(leadWrite(f)).toMatchObject({ status: "replied", stage_id: "replied-stage" });
  });
  it("meeting confirmed -> Meeting Booked", async () => {
    const f = fake("interested", "interested-stage");
    await syncReplyCrm(f.client, args("meeting_booked"));
    expect(leadWrite(f)).toMatchObject({ status: "meeting", stage_id: "meeting_booked-stage" });
  });
  it.each(["won-stage", "lost-stage"])("never overwrites %s", async (stage) => {
    const f = fake(stage === "won-stage" ? "completed" : "not_interested", stage);
    await syncReplyCrm(f.client, args("interested"));
    expect(leadWrite(f).stage_id).toBeUndefined();
    expect(leadWrite(f).status).toBe(stage === "won-stage" ? "completed" : "not_interested");
  });
  it("never moves backwards (neutral after Interested)", async () => {
    const f = fake("interested", "interested-stage");
    await syncReplyCrm(f.client, args(null));
    expect(leadWrite(f)).toEqual({ status: "interested" });
  });
  it("falls back to Replied where the Interested stage is not set up yet", async () => {
    const f = fake("new", null, STAGES.filter((s) => s.key !== "interested"));
    await syncReplyCrm(f.client, args("interested"));
    expect(leadWrite(f)).toMatchObject({ status: "interested", stage_id: "replied-stage" });
  });
  it("leaves custom stages alone and ignores OOO/bounces", () => {
    expect(canAutoAdvance("custom_stage", "interested")).toBe(false);
    expect(autoStageForReply("ooo")).toBeNull();
    expect(autoStageForReply("bounced")).toBeNull();
  });
});
