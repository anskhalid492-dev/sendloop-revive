/** Pure aggregation of AI Sales Agent call metadata recorded on workflow steps. */
export type AiMetrics = {
  requests: number;
  success: number;
  failure: number;
  timeout: number;
  avgLatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  decisions: number;
  replies: number;
  workspaces: number;
};

export function summarizeAiMetrics(rows: { workspace_id: string; output: Record<string, unknown> | null }[]): AiMetrics {
  const m: AiMetrics = { requests: 0, success: 0, failure: 0, timeout: 0, avgLatencyMs: null, inputTokens: 0, outputTokens: 0, decisions: 0, replies: 0, workspaces: 0 };
  const ws = new Set<string>();
  let latency = 0;
  for (const row of rows) {
    const ai = row.output?.["ai"] as Record<string, unknown> | undefined;
    if (!ai || ai["provider"] !== "munchreach") continue;
    m.requests += 1;
    ws.add(row.workspace_id);
    if (ai["status"] === "success") m.success += 1;
    else if (ai["status"] === "timeout") m.timeout += 1;
    else m.failure += 1;
    latency += Number(ai["latencyMs"] ?? 0) || 0;
    m.inputTokens += Number(ai["inputTokens"] ?? 0) || 0;
    m.outputTokens += Number(ai["outputTokens"] ?? 0) || 0;
    if (ai["purpose"] === "decision") m.decisions += 1;
    if (ai["purpose"] === "reply") m.replies += 1;
  }
  m.workspaces = ws.size;
  m.avgLatencyMs = m.requests ? Math.round(latency / m.requests) : null;
  return m;
}

/* ------------------------------------------------------------------ admin monitoring */

export type MetricRow = { workspace_id: string; output: Record<string, unknown> | null };

export type FailureKind = "provider" | "timeout" | "invalid" | "low_confidence" | "human_fallback" | "other";
export const FAILURE_LABELS: Record<FailureKind, string> = {
  provider: "Provider failure",
  timeout: "Timeout",
  invalid: "Invalid response",
  low_confidence: "Low confidence",
  human_fallback: "Human fallback",
  other: "Other",
};
export const FALLBACK_OUTCOME = "Fallback / Human Review";

type Counter = { requests: number; success: number; failure: number; timeout: number; latency: number; tokens: number };
const blank = (): Counter => ({ requests: 0, success: 0, failure: 0, timeout: 0, latency: 0, tokens: 0 });

export type MonitoringTotals = {
  requests: number;
  success: number;
  failed: number;
  timedOut: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  decisions: number;
  replies: number;
};

export type WorkspaceMetric = {
  workspaceId: string;
  requests: number;
  success: number;
  failed: number;
  timedOut: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  tokens: number;
};

export type Monitoring = {
  totals: MonitoringTotals;
  workspaces: WorkspaceMetric[];
  outcomes: { outcome: string; count: number }[];
  failures: { kind: FailureKind; label: string; count: number }[];
};

const rate = (ok: number, total: number) => (total ? Math.round((ok / total) * 1000) / 10 : null);
const numOr0 = (v: unknown) => Number(v ?? 0) || 0;

/** Classifies a non-success AI step into one of the admin failure buckets (null = not a failure). */
export function classifyFailure(output: Record<string, unknown>): FailureKind | null {
  if (output["humanReview"] === true) return "human_fallback";
  const ai = output["ai"] as Record<string, unknown> | undefined;
  const status = ai?.["status"];
  if (status === "timeout") return "timeout";
  if (status === "unavailable" || status === "failed") return "provider";
  if (output["kind"] === "ai_decision") {
    if (!output["usedFallback"]) return null;
    const why = String(output["fallbackReason"] ?? "");
    if (/not confident/i.test(why)) return "low_confidence";
    if (/invalid/i.test(why)) return "invalid";
    return "other";
  }
  if (output["kind"] === "ai_reply") {
    if (output["generated"] !== false) return null;
    const why = String(output["error"] ?? "");
    if (/invalid|empty/i.test(why)) return "invalid";
    return "other";
  }
  return null;
}

/**
 * Aggregates MunchReach AI Sales Agent step outputs. Only steps whose `ai`
 * metadata names the MunchReach provider count as AI requests, so customer-key
 * Campaign Writer / Personalization usage can never appear here.
 */
export function aggregateAiMonitoring(rows: MetricRow[]): Monitoring {
  const total = blank();
  let inputTokens = 0;
  let outputTokens = 0;
  let decisions = 0;
  let replies = 0;
  const byWs = new Map<string, Counter>();
  const outcomes = new Map<string, number>();
  const failures = new Map<FailureKind, number>();
  for (const row of rows) {
    const out = row.output;
    if (!out) continue;
    const ai = out["ai"] as Record<string, unknown> | undefined;
    const isRequest = Boolean(ai && ai["provider"] === "munchreach");
    const isAgentStep = isRequest || out["humanReview"] === true || out["kind"] === "ai_decision" || out["kind"] === "ai_reply";
    if (!isAgentStep) continue;
    if (isRequest) {
      const w = byWs.get(row.workspace_id) ?? blank();
      const tokens = numOr0(ai!["inputTokens"]) + numOr0(ai!["outputTokens"]);
      for (const c of [w, total]) {
        c.requests += 1;
        if (ai!["status"] === "success") c.success += 1;
        else if (ai!["status"] === "timeout") c.timeout += 1;
        else c.failure += 1;
        c.latency += numOr0(ai!["latencyMs"]);
        c.tokens += tokens;
      }
      byWs.set(row.workspace_id, w);
      inputTokens += numOr0(ai!["inputTokens"]);
      outputTokens += numOr0(ai!["outputTokens"]);
      if (ai!["purpose"] === "decision") decisions += 1;
      if (ai!["purpose"] === "reply") replies += 1;
    }
    if (out["kind"] === "ai_decision") {
      const key = out["usedFallback"] || !out["outcome"] ? FALLBACK_OUTCOME : String(out["outcome"]).trim().slice(0, 60) || FALLBACK_OUTCOME;
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    }
    const f = classifyFailure(out);
    if (f) failures.set(f, (failures.get(f) ?? 0) + 1);
  }
  const workspaces: WorkspaceMetric[] = [...byWs.entries()]
    .map(([workspaceId, c]) => ({
      workspaceId,
      requests: c.requests,
      success: c.success,
      failed: c.failure,
      timedOut: c.timeout,
      successRate: rate(c.success, c.requests),
      avgLatencyMs: c.requests ? Math.round(c.latency / c.requests) : null,
      tokens: c.tokens,
    }))
    .sort((a, b) => b.requests - a.requests || a.workspaceId.localeCompare(b.workspaceId));
  return {
    totals: {
      requests: total.requests,
      success: total.success,
      failed: total.failure,
      timedOut: total.timeout,
      successRate: rate(total.success, total.requests),
      avgLatencyMs: total.requests ? Math.round(total.latency / total.requests) : null,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      decisions,
      replies,
    },
    workspaces,
    outcomes: [...outcomes.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count),
    failures: (Object.keys(FAILURE_LABELS) as FailureKind[]).map((kind) => ({ kind, label: FAILURE_LABELS[kind], count: failures.get(kind) ?? 0 })),
  };
}

/** Search + paginate the workspace breakdown (names resolved by the caller). */
export function pageWorkspaces<T extends WorkspaceMetric & { name: string }>(rows: T[], search: string | null, page: number, pageSize: number) {
  const q = (search ?? "").trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.workspaceId.includes(q)) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: filtered.slice((p - 1) * pageSize, p * pageSize), total: filtered.length, page: p, pages };
}
