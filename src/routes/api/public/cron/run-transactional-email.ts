/**
 * Transactional email queue runner.
 *
 * Called by the scheduler (pg_cron) or an external cron. Every run is bounded,
 * single-flight (database lease), idempotent per message, and exits immediately
 * while the system is paused.
 *
 * Auth: shared secret via `x-sendloop-signature`, `Authorization: Bearer`, or
 * `?token=`. The token lives in platform settings; env secrets stay supported.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function run(request: Request) {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processTransactionalQueue } = await import("@/lib/transactional-email.server");

  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "transactional_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;
  const secrets = [dbToken, process.env["TRANSACTIONAL_CRON_SECRET"], process.env["INBOUND_EMAIL_SECRET"]].filter(
    (value): value is string => Boolean(value),
  );
  if (secrets.length === 0) return json({ error: "Runner is not configured" }, 503);
  if (!provided || !secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let limit: number | undefined;
  try {
    const body = (await request.json()) as { limit?: number } | null;
    if (body && typeof body.limit === "number") limit = body.limit;
  } catch {
    /* GET or empty body */
  }

  try {
    // Queue mode only on an explicit worker_mode.transactional = "queue"; anything
    // else (missing, unreadable) keeps the legacy runner, so flipping back is the rollback.
    const { getWorkerMode } = await import("@/lib/worker-mode.server");
    const summary =
      (await getWorkerMode(supabaseAdmin, "transactional")) === "queue"
        ? await (await import("@/lib/transactional-queue.server")).runTransactionalQueue({
            client: supabaseAdmin,
            ...(limit ? { limit } : {}),
          })
        : await processTransactionalQueue(supabaseAdmin, limit ? { limit } : {});
    // Birthday gifts ride on this existing cron cycle — no second scheduler.
    // The runner is idempotent per user/year, so extra invocations are safe.
    let birthday: unknown = null;
    try {
      // Birthdays change once a day, so the check runs once per UTC day instead
      // of every minute. The atomic lease (expiring at next midnight) makes the
      // first tick of the day the only one that runs it.
      const { acquireWorkerLease } = await import("@/lib/worker-lease.server");
      const now = new Date();
      const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const daily = await acquireWorkerLease(supabaseAdmin, "birthday_gift_daily", nextMidnight - now.getTime(), now);
      if (daily) {
        const { runBirthdayGiftCycle } = await import("@/lib/birthday-gift.server");
        try {
          birthday = await runBirthdayGiftCycle();
        } catch (error) {
          // A failed run frees the day so the next tick retries it.
          const { releaseWorkerLease } = await import("@/lib/worker-lease.server");
          await releaseWorkerLease(supabaseAdmin, daily);
          throw error;
        }
      } else {
        birthday = { skipped: "already ran today" };
      }
    } catch (birthdayError) {
      console.error("birthday gift cycle failed", birthdayError);
    }
    // Customer lifecycle emails ride on the same cycle. Every step is claimed
    // through a unique ledger row, so repeated invocations cannot duplicate.
    let lifecycle: unknown = null;
    try {
      const { runLifecycleCycle } = await import("@/lib/lifecycle.server");
      lifecycle = await runLifecycleCycle();
    } catch (lifecycleError) {
      console.error("lifecycle cycle failed", lifecycleError);
    }
    return json({ ...summary, birthday, lifecycle }, 200);
  } catch (error) {
    console.error("transactional runner failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Run failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/run-transactional-email")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
