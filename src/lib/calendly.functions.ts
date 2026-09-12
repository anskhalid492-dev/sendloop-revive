/**
 * Customer-facing Calendly OAuth endpoints.
 *
 * Every handler re-checks workspace membership and role server-side, so one
 * workspace can never start, read or remove another workspace's Calendly
 * connection. No token, refresh token or app secret is ever returned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export type CalendlyStatus = {
  configured: boolean;
  connected: boolean;
  status: string;
  accountName: string | null;
  accountEmail: string | null;
  schedulingUrl: string | null;
  webhookActive: boolean;
  connectedAt: string | null;
  errorMessage: string | null;
};

export const getCalendlyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<CalendlyStatus> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { calendlyAppCredentials, loadCalendlyConnection } = await import("@/lib/calendly.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, false);

    const configured = Boolean(calendlyAppCredentials());
    const conn = await loadCalendlyConnection(data.workspaceId);
    const config = (conn?.config ?? {}) as Record<string, unknown>;
    return {
      configured,
      connected: Boolean(conn),
      status: conn?.status ?? "not_connected",
      accountName: (config["calendly_name"] as string | null) ?? null,
      accountEmail: (config["calendly_email"] as string | null) ?? conn?.account_label ?? null,
      schedulingUrl: (config["calendly_scheduling_url"] as string | null) ?? null,
      webhookActive: typeof config["webhook_uri"] === "string",
      connectedAt: (config["connected_at"] as string | null) ?? null,
      errorMessage: conn?.error_message ?? null,
    };
  });

/** Returns the Calendly consent URL; the browser then leaves for Calendly. */
export const startCalendlyOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; message?: string }> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { calendlyAppCredentials, calendlyAuthorizeUrl, signState, newStateNonce, CALENDLY_SLUG } =
      await import("@/lib/calendly.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestUrl } = await import("@tanstack/react-start/server");

    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const { requireEntitlement } = await import("@/lib/billing/usage.server");
    await requireEntitlement(data.workspaceId, "integrations");

    if (!calendlyAppCredentials()) {
      return { ok: false, message: "Calendly is not configured on this deployment yet." };
    }

    const { workspaceHasPaidPlan } = await import("@/lib/integrations.server");
    const { data: catalogRow } = await supabaseAdmin
      .from("integrations")
      .select("is_enabled, requires_paid_plan")
      .eq("slug", CALENDLY_SLUG)
      .maybeSingle();
    const row = catalogRow as { is_enabled: boolean; requires_paid_plan: boolean } | null;
    if (!row || !row.is_enabled) return { ok: false, message: "Calendly is currently unavailable." };
    if (row.requires_paid_plan && !(await workspaceHasPaidPlan(data.workspaceId))) {
      return { ok: false, message: "Calendly is available on paid plans. Upgrade to connect it." };
    }

    const nonce = newStateNonce();
    const state = signState({
      workspaceId: data.workspaceId,
      userId: context.userId,
      nonce,
      exp: Date.now() + 10 * 60 * 1000,
    });

    // Single-use marker for the callback; no schema change required.
    const { error } = await supabaseAdmin.from("integration_events").insert({
      workspace_id: data.workspaceId,
      slug: CALENDLY_SLUG,
      direction: "oauth",
      event_type: "oauth.start",
      status: "pending",
      message: "Calendly authorization started.",
      payload: {} as never,
      idempotency_key: `calendly:oauth:${nonce}`,
    });
    if (error) return { ok: false, message: "Could not start the Calendly connection." };

    const origin = new URL(getRequestUrl()).origin;
    return { ok: true, url: calendlyAuthorizeUrl(origin, state) };
  });

/** Removes the webhook at Calendly, revokes the token, deletes the connection. */
export const disconnectCalendly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const {
      loadCalendlyConnection,
      accessTokenForConnection,
      deleteWebhookSubscription,
      revokeToken,
      readCalendlyCredentials,
      CALENDLY_SLUG,
    } = await import("@/lib/calendly.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const conn = await loadCalendlyConnection(data.workspaceId);
    if (!conn) return { ok: true, message: "Calendly is not connected." };

    const config = (conn.config ?? {}) as Record<string, unknown>;
    const { token } = await accessTokenForConnection(conn.id);
    const webhookUri = config["webhook_uri"];
    if (token && typeof webhookUri === "string") {
      await deleteWebhookSubscription(token, webhookUri);
    }
    const creds = await readCalendlyCredentials(conn.id);
    if (creds?.refresh_token) await revokeToken(creds.refresh_token);
    if (token) await revokeToken(token);

    await supabaseAdmin.from("integration_secrets").delete().eq("connection_id", conn.id);
    const { error } = await supabaseAdmin
      .from("integration_connections")
      .delete()
      .eq("id", conn.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      slug: CALENDLY_SLUG,
      action: "disconnect",
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return { ok: true, message: "Calendly disconnected." };
  });
