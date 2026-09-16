/**
 * Exactly-once protection for manual sends (Compose and Reply).
 *
 * A single click can reach the server more than once: the platform edge retries
 * a request it considers timed out, a flaky connection replays it, or the
 * browser resubmits. SMTP has no way of knowing an earlier attempt already
 * delivered, so the guard lives here: the browser sends a key that identifies
 * the send *attempt*, and the first request to claim that key is the only one
 * that talks to the mail server. Repeats get the first attempt's answer back.
 *
 * Server-only. The claim table is service-role-only, so nothing about this is
 * reachable from the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ManualSendKind = "compose" | "reply";

export type ClaimedSend<T> =
  | { proceed: true; finish: (result: T) => Promise<void>; release: () => Promise<void> }
  | { proceed: false; result: T | null };

/** How long a duplicate waits for the original attempt to finish. */
const WAIT_TOTAL_MS = 25_000;
const WAIT_STEP_MS = 1_000;
/** An attempt that never reported back is considered abandoned after this. */
const STALE_AFTER_MS = 5 * 60_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readClaim(workspaceId: string, sendKey: string) {
  const { data } = await supabaseAdmin
    .from("manual_send_claims")
    .select("id, status, result, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("send_key", sendKey)
    .maybeSingle();
  return (data as { id: string; status: string; result: unknown; updated_at: string } | null) ?? null;
}

/**
 * Claims this send attempt. `proceed: true` means this request owns the send and
 * must call `finish` (delivered) or `release` (failed, so the customer can try
 * again with the same key). `proceed: false` means another request is already
 * handling it — the stored result is returned when it is available.
 */
export async function claimManualSend<T>(
  workspaceId: string,
  sendKey: string,
  kind: ManualSendKind,
): Promise<ClaimedSend<T>> {
  const finish = async (result: T) => {
    await supabaseAdmin
      .from("manual_send_claims")
      .update({ status: "sent", result: result as never })
      .eq("workspace_id", workspaceId)
      .eq("send_key", sendKey);
  };
  const release = async () => {
    await supabaseAdmin
      .from("manual_send_claims")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("send_key", sendKey);
  };

  const { error } = await supabaseAdmin
    .from("manual_send_claims")
    .insert({ workspace_id: workspaceId, send_key: sendKey, kind, status: "in_progress" });

  if (!error) return { proceed: true, finish, release };

  const existing = await readClaim(workspaceId, sendKey);
  if (!existing) {
    // The insert failed for a reason other than a duplicate (for example the
    // table is missing in this environment): never block a real send on it.
    console.warn(`[manual-send] claim unavailable for ${kind}: ${error.message}`);
    return { proceed: true, finish, release };
  }

  if (existing.status === "sent") {
    console.warn(`[manual-send] duplicate ${kind} request ignored (key already delivered).`);
    return { proceed: false, result: (existing.result as T | null) ?? null };
  }

  // A previous attempt crashed without reporting back: take it over.
  if (Date.now() - new Date(existing.updated_at).getTime() > STALE_AFTER_MS) {
    await supabaseAdmin
      .from("manual_send_claims")
      .update({ status: "in_progress", result: null })
      .eq("id", existing.id);
    return { proceed: true, finish, release };
  }

  // The original attempt is still running. Wait for its answer rather than
  // sending a second copy.
  for (let waited = 0; waited < WAIT_TOTAL_MS; waited += WAIT_STEP_MS) {
    await wait(WAIT_STEP_MS);
    const current = await readClaim(workspaceId, sendKey);
    if (!current) break; // released after a failure — let the caller retry
    if (current.status === "sent") return { proceed: false, result: (current.result as T | null) ?? null };
  }

  const latest = await readClaim(workspaceId, sendKey);
  if (!latest) return { proceed: true, finish, release };
  console.warn(`[manual-send] duplicate ${kind} request ignored (original still in progress).`);
  return { proceed: false, result: null };
}
