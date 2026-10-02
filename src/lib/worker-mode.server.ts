/**
 * Per-worker execution mode from `platform_settings.worker_mode`.
 * Anything other than an explicit "queue" (missing row, read error, typo)
 * resolves to "legacy", so the existing code path is always the fallback.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type WorkerName = "campaign" | "mailbox" | "warmup" | "inbound" | "transactional";
export type WorkerMode = "legacy" | "queue";

export function parseWorkerMode(value: unknown, worker: WorkerName): WorkerMode {
  if (!value || typeof value !== "object") return "legacy";
  return (value as Record<string, unknown>)[worker] === "queue" ? "queue" : "legacy";
}

export async function getWorkerMode(client: Client, worker: WorkerName): Promise<WorkerMode> {
  try {
    const { data, error } = await client
      .from("platform_settings")
      .select("value")
      .eq("key", "worker_mode")
      .maybeSingle();
    if (error) return "legacy";
    return parseWorkerMode(data?.value, worker);
  } catch {
    return "legacy";
  }
}
