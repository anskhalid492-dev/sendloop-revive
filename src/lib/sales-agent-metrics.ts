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
