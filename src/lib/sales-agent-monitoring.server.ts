/** Bounded, paged read of AI Sales Agent step outputs for admin monitoring. */
import type { MetricRow } from "@/lib/sales-agent-metrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const MONITORING_PAGE = 1000;
export const MONITORING_MAX_ROWS = 20_000;

/** Only AI Decision / AI Reply / Human Review steps, within [from, to] UTC days. */
export async function loadMonitoringRows(db: Db, from: string, to: string): Promise<{ rows: MetricRow[]; truncated: boolean }> {
  const start = `${from}T00:00:00.000Z`;
  const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString();
  const rows: MetricRow[] = [];
  for (let offset = 0; offset < MONITORING_MAX_ROWS; offset += MONITORING_PAGE) {
    const { data, error } = await db
      .from("automation_run_steps")
      .select("workspace_id, output")
      .gte("started_at", start)
      .lt("started_at", end)
      .or("output->>kind.in.(ai_decision,ai_reply),output->>humanReview.eq.true")
      .order("started_at", { ascending: true })
      .range(offset, offset + MONITORING_PAGE - 1);
    if (error) throw new Error("Could not load AI Sales Agent metrics.");
    const page = (data ?? []) as MetricRow[];
    rows.push(...page);
    if (page.length < MONITORING_PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
