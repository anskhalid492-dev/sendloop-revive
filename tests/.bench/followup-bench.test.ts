import { test, vi } from "vitest";
vi.mock("@/lib/ai-personalization-meta.server", () => ({
  aiExtras: () => ({ extras: {}, hold: false }),
  personalizationByLead: async () => new Map(),
  pendingPersonalizationLeads: async () => new Set(),
}));
import { scheduleFollowUps as after } from "@/lib/dispatch.server";
import { scheduleFollowUps as before } from "./dispatch-before.server";
import { countingDb, summarize } from "../helpers/counting-db";

const C = "c1", H = 3_600_000;
function build() {
  const rec: any[] = [], msg: any[] = [], leads: any[] = [];
  for (let i = 0; i < 200; i++) {
    const id = `r${i}`, ago = i < 150 ? 1 : 50;
    rec.push({ id, campaign_id: C, lead_id: `l${i}`, status: "in_progress", current_step: 1, sending_account_id: "a", next_send_at: null });
    leads.push({ id: `l${i}`, email: `${id}@x.test` });
    msg.push({ campaign_id: C, recipient_id: id, step_order: 1, status: "sent", sent_at: new Date(Date.now() - ago * H).toISOString() });
    if (i >= 180) msg.push({ campaign_id: C, recipient_id: id, step_order: 2, status: "failed", sent_at: null });
  }
  return countingDb({
    campaigns: [{ id: C, workspace_id: "w", status: "active", timezone: "UTC", send_days: [0,1,2,3,4,5,6], send_start_hour: 0, send_end_hour: 24, custom_variables: [] }],
    campaign_steps: [1, 2].map((n) => ({ id: `s${n}`, campaign_id: C, step_order: n, subject: "s", body: "b", wait_days: n === 1 ? 0 : 2, wait_hours: 0, delay_minutes: 0, step_type: "email" })),
    campaign_step_variants: [], campaign_recipients: rec, campaign_messages: msg, leads,
    sending_accounts: [{ id: "a", from_name: "T", from_email: "t@x.test" }],
  }, { campaign_messages: ["campaign_id", "recipient_id", "step_order"] });
}
test("bench", async () => {
  for (const [name, fn] of [["before", before], ["after", after]] as const) {
    const db = build();
    const ticks = [];
    for (let t = 0; t < 3; t++) { db.ops.length = 0; await fn(db.client, C); ticks.push(summarize(db.ops)); }
    const step2 = db.tables.campaign_messages.filter((m: any) => m.step_order === 2).length;
    console.log(name, JSON.stringify(ticks), "step2 jobs total:", step2,
      "failed kept:", db.tables.campaign_messages.filter((m: any) => m.status === "failed").length);
  }
});
