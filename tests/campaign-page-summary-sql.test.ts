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
describe("campaign_page_summary authorization", () => {
  const sql = readFileSync("supabase/manual/campaign-scale-rpcs.sql", "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.campaign_page_summary");
  const body = sql.slice(start, sql.indexOf("GRANT EXECUTE", start));

  test("runs as definer so per-row RLS cannot time the aggregate out", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path TO 'public'");
  });

  test("checks workspace membership explicitly", () => {
    expect(body).toContain("is_workspace_member(_workspace_id, auth.uid())");
    expect(body).toContain("has_role(auth.uid(), 'admin'::app_role)");
    expect(body).toContain("42501");
  });
});
