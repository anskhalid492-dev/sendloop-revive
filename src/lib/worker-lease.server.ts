/**
 * Atomic single-flight leases for background workers.
 *
 * A lease is one `platform_settings` row `{ token, expiresAt }`. Taking it is a
 * single conditional write (update only when expired, or insert when absent),
 * so two overlapping cron ticks can never both believe they hold it — unlike a
 * read-then-write check. An expired lease (crashed worker) is simply taken over.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type WorkerLease = { key: string; token: string; expiresAt: string };

export async function acquireWorkerLease(
  client: Client,
  key: string,
  ttlMs: number,
  now: Date = new Date(),
): Promise<WorkerLease | null> {
  const nowIso = now.toISOString();
  const token = `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const value = { token, expiresAt };

  const { data: updated, error: updateError } = await client
    .from("platform_settings")
    .update({ value })
    .eq("key", key)
    .or(`value->>expiresAt.is.null,value->>expiresAt.lt."${nowIso}"`)
    .select("key");
  if (!updateError && Array.isArray(updated) && updated.length > 0) return { key, token, expiresAt };

  // No row matched: either the lease is held, or the row does not exist yet.
  // ON CONFLICT DO NOTHING creates a missing row atomically; a held lease just
  // returns no row instead of raising a duplicate-key error every cron tick.
  const { data: inserted, error: insertError } = await client
    .from("platform_settings")
    .upsert({ key, value }, { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  if (!insertError && Array.isArray(inserted) && inserted.length > 0) return { key, token, expiresAt };
  return null;
}

/** Releases only our own lease; a lease taken over after expiry is left alone. */
export async function releaseWorkerLease(client: Client, lease: WorkerLease | null): Promise<void> {
  if (!lease) return;
  try {
    await client
      .from("platform_settings")
      .update({ value: { token: lease.token, expiresAt: new Date(0).toISOString() } })
      .eq("key", lease.key)
      .eq("value->>token", lease.token);
  } catch (error) {
    console.error(JSON.stringify({ worker: lease.key, event: "lease_release_failed", error: String(error) }));
  }
}

/** One structured log line per worker run. Never pass credentials or bodies. */
export function logWorkerRun(entry: {
  worker: string;
  startedAt: number;
  result: "ok" | "skipped" | "error";
  reason?: string;
  [field: string]: unknown;
}): void {
  const { startedAt, ...rest } = entry;
  console.log(
    JSON.stringify({
      ...rest,
      started_at: new Date(startedAt).toISOString(),
      duration_ms: Date.now() - startedAt,
    }),
  );
}
