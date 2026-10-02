/**
 * Scheduled reply detection for self-connected mailboxes.
 *
 * The scheduler calls this endpoint every few minutes. Each connected, active
 * mailbox is read through the relay with its OWN IMAP credentials; matched
 * replies are filed into the Unified Inbox and delivery failures are recorded as
 * bounces. Nothing is sent from here.
 *
 * Auth: shared secret via `x-munchreach-signature`, `Authorization: Bearer`, or
 * `?token=` (reuses INBOUND_EMAIL_SECRET).
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
    request.headers.get("x-munchreach-signature") ??
    request.headers.get("x-sendloop-signature") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("token") ??
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "mailbox_poll_runner")
    .maybeSingle();
  const dbToken = (settings?.value as { token?: string } | null)?.token ?? null;

  const secrets = [
    dbToken,
    process.env["MAILBOX_POLL_CRON_SECRET"],
    process.env["INBOUND_EMAIL_SECRET"],
  ].filter((value): value is string => Boolean(value));
  if (secrets.length === 0) return json({ error: "Mailbox polling is not configured" }, 503);
  if (!secrets.some((secret) => secretMatches(provided, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    // Queue mode only on an explicit worker_mode.mailbox = "queue"; anything
    // else (including read errors) runs the legacy poller — the rollback.
    const { getWorkerMode } = await import("@/lib/worker-mode.server");
    if ((await getWorkerMode(supabaseAdmin, "mailbox")) === "queue") {
      const { runMailboxQueue } = await import("@/lib/mailbox-queue.server");
      const queued = runMailboxQueue({ client: supabaseAdmin });
      if (url.searchParams.get("wait") !== "1") {
        const { keepAlive } = await import("@/lib/background.server");
        const work = queued.catch((error) => console.error("mailbox queue failed", error));
        if (await keepAlive(work)) return json({ ok: true, accepted: true, mode: "queue" }, 202);
        await work;
        return json({ ok: true, mode: "queue" }, 200);
      }
      return json({ ok: true, ...(await queued) }, 200);
    }
    const { pollConnectedMailboxes } = await import("@/lib/mailbox-imap-poll.server");
    // The scheduler hangs up after ~5 seconds, and the runtime cancels work
    // still running when the caller disconnects — so mailboxes late in the list
    // were never read. Scheduled runs are handed to the platform to finish in
    // the background; manual runs (`?wait=1`) still wait for the summary.
    if (url.searchParams.get("wait") !== "1") {
      const { keepAlive } = await import("@/lib/background.server");
      const work = pollConnectedMailboxes().catch((error) =>
        console.error("mailbox polling failed", error),
      );
      if (await keepAlive(work)) return json({ ok: true, accepted: true }, 202);
      await work;
      return json({ ok: true }, 200);
    }
    const summary = await pollConnectedMailboxes();
    return json({ ok: true, ...summary }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox polling failed";
    console.error("mailbox polling failed", error);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/public/cron/poll-mailboxes")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
