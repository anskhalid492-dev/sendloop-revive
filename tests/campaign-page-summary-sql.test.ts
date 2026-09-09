import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("campaign_page_summary SQL", () => {
  test("avoids the large-campaign OR join", () => {
    const sql = readFileSync("supabase/manual/campaign-scale-rpcs.sql", "utf8");
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.campaign_page_summary");
    const body = sql.slice(start, sql.indexOf("GRANT EXECUTE", start));

    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("msg_rank_by_recipient AS");
    expect(body).toContain("legacy_msg_rank_by_lead AS");
    expect(body).toContain("mr.recipient_id = r.id");
    expect(body).toContain("lr.lead_id = r.lead_id");
    expect(body).not.toMatch(/m\.recipient_id\s*=\s*r\.id\s+OR/);
  });

  test("preserves the summary response contract", () => {
    const sql = readFileSync("supabase/manual/campaign-scale-rpcs.sql", "utf8");
    for (const key of [
      "recipients",
      "lead_states",
      "delivery",
      "today",
      "by_step",
      "next_pending_at",
      "retryable_failures",
      "owed_messages",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});