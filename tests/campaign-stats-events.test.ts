import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/manual/campaign-stats-events.sql", "utf8");
const hook = readFileSync("src/hooks/useAnalyticsRealtime.ts", "utf8");

describe("campaign stats are wired to the real message event table", () => {
  it("derives engagement signals from email_engagement_events", () => {
    expect(sql).toContain("FROM public.email_engagement_events");
    for (const signal of ["opened", "clicked", "bounced", "complained", "unsubscribed", "delivered"]) {
      expect(sql).toContain(`'${signal}'`);
    }
  });

  it("keeps counting message-level so repeated events cannot inflate totals", () => {
    expect(sql).toContain("GROUP BY e.message_id");
    expect(sql).toContain("LEFT JOIN ev ON ev.mid = m.id");
  });

  it("prefers whichever source saw the signal first", () => {
    expect(sql).toContain("least(m.opened_at, ev.opened_at)");
    expect(sql).toContain("least(m.bounced_at, ev.bounced_at)");
  });

  it("keeps bounce and failure mutually exclusive", () => {
    expect(sql).toContain("WHERE s.bounced_at IS NULL");
  });

  it("streams new events to the browser", () => {
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.email_engagement_events");
    expect(hook).toContain('"email_engagement_events"');
    expect(hook).toContain('"email_events"');
  });
});
