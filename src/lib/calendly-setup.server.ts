/**
 * Shared Calendly webhook setup, used by the OAuth callback and by the
 * "retry booking notifications" action.
 *
 * The connection is only marked Connected when Calendly actually confirms a
 * live subscription we can verify signatures for. The real Calendly status and
 * message are kept in internal logs; the customer sees a plain-language reason.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CALENDLY_SLUG,
  ensureWebhookSubscription,
  readCalendlyCredentials,
  saveCalendlyCredentials,
  type CalendlyCredentials,
} from "@/lib/calendly.server";

export function calendlyWebhookUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/integrations/calendly/webhook`;
}

export type SetupResult = {
  ok: boolean;
  reused: boolean;
  /** Customer-facing text; never contains tokens or raw API bodies. */
  message: string;
};

export async function setupCalendlyWebhook(args: {
  workspaceId: string;
  connectionId: string;
  accessToken: string;
  organizationUri: string;
  ownerUri: string;
  origin: string;
  /** Config to keep as-is while status/webhook fields are updated. */
  config: Record<string, unknown>;
}): Promise<SetupResult> {
  const creds = await readCalendlyCredentials(args.connectionId);
  const existingUri =
    typeof args.config["webhook_uri"] === "string" ? (args.config["webhook_uri"] as string) : null;

  const result = await ensureWebhookSubscription(args.accessToken, {
    url: calendlyWebhookUrl(args.origin),
    organization: args.organizationUri,
    user: args.ownerUri,
    existingUri,
    existingSigningKey: creds?.webhook_signing_key ?? null,
  });

  if (result.ok && result.signingKey && creds) {
    const updated: CalendlyCredentials = { ...creds, webhook_signing_key: result.signingKey };
    await saveCalendlyCredentials(args.connectionId, updated);
  }

  await supabaseAdmin
    .from("integration_connections")
    .update({
      config: {
        ...args.config,
        webhook_uri: result.ok ? result.uri : existingUri,
        webhook_events: result.ok ? ["invitee.created", "invitee.canceled"] : [],
        webhook_checked_at: new Date().toISOString(),
      } as never,
      status: result.ok ? "connected" : "error",
      error_message: result.ok ? null : result.message,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", args.connectionId);

  await supabaseAdmin.from("integration_sync_logs").insert({
    workspace_id: args.workspaceId,
    connection_id: args.connectionId,
    slug: CALENDLY_SLUG,
    action: "webhook_setup",
    status: result.ok ? "success" : "failed",
    // Internal only: real Calendly status/title/message.
    error: result.ok ? null : `${result.message} | ${result.detail}`,
    finished_at: new Date().toISOString(),
  });

  return { ok: result.ok, reused: result.reused, message: result.message };
}
