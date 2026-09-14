/**
 * Customer-facing HubSpot OAuth endpoints.
 *
 * Every handler re-checks workspace membership and role server-side, so one
 * workspace can never start, read or remove another workspace's HubSpot
 * connection. No access token, refresh token or app secret is ever returned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export type HubSpotStatus = {
  configured: boolean;
  connected: boolean;
  status: string;
  /** "oauth" once connected through consent, "legacy_token" before reconnect. */
  authMethod: "oauth" | "legacy_token" | null;
  accountName: string | null;
  portalId: string | null;
  scopes: string[];
  connectedAt: string | null;
  errorMessage: string | null;
};

export const getHubSpotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<HubSpotStatus> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { hubspotAppCredentials, loadHubSpotConnection } = await import("@/lib/hubspot.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, false);

    const configured = Boolean(hubspotAppCredentials());
    const conn = await loadHubSpotConnection(data.workspaceId);
    const config = (conn?.config ?? {}) as Record<string, unknown>;
    const auth = config["auth"] === "oauth" ? "oauth" : "legacy_token";
    return {
      configured,
      connected: Boolean(conn),
      status: conn?.status ?? "not_connected",
      authMethod: conn ? auth : null,
      accountName:
        (config["hubspot_hub_domain"] as string | null) ?? conn?.account_label ?? null,
      portalId: (config["hubspot_portal_id"] as string | null) ?? null,
      scopes: Array.isArray(config["scopes"]) ? (config["scopes"] as string[]) : [],
      connectedAt: (config["connected_at"] as string | null) ?? null,
      errorMessage: conn?.error_message ?? null,
    };
  });

/** Returns the HubSpot consent URL; the browser then leaves for HubSpot. */
export const startHubSpotOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; message?: string }> => {
    const { requireWorkspaceRole, workspaceHasPaidPlan } = await import("@/lib/integrations.server");
    const { hubspotAppCredentials, hubspotAuthorizeUrl, signState, newStateNonce, HUBSPOT_SLUG } =
      await import("@/lib/hubspot.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestUrl } = await import("@tanstack/react-start/server");

    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const { requireEntitlement } = await import("@/lib/billing/usage.server");
    await requireEntitlement(data.workspaceId, "integrations");

    if (!hubspotAppCredentials()) {
      return { ok: false, message: "HubSpot sign-in is not available on this environment yet." };
    }

    const { data: catalogRow } = await supabaseAdmin
      .from("integrations")
      .select("is_enabled, requires_paid_plan")
      .eq("slug", HUBSPOT_SLUG)
      .maybeSingle();
    const row = catalogRow as { is_enabled: boolean; requires_paid_plan: boolean } | null;
    if (!row || !row.is_enabled) return { ok: false, message: "HubSpot is currently unavailable." };
    if (row.requires_paid_plan && !(await workspaceHasPaidPlan(data.workspaceId))) {
      return { ok: false, message: "HubSpot is available on paid plans. Upgrade to connect it." };
    }

    const nonce = newStateNonce();
    const state = signState({
      workspaceId: data.workspaceId,
      userId: context.userId,
      nonce,
      exp: Date.now() + 10 * 60 * 1000,
    });

    // Single-use marker the callback claims; blocks replayed/forged callbacks.
    const { error } = await supabaseAdmin.from("integration_events").insert({
      workspace_id: data.workspaceId,
      slug: HUBSPOT_SLUG,
      direction: "oauth",
      event_type: "oauth.start",
      status: "pending",
      message: "HubSpot authorization started.",
      payload: {} as never,
      idempotency_key: `hubspot:oauth:${nonce}`,
    });
    if (error) return { ok: false, message: "Could not start the HubSpot connection." };

    const origin = new URL(getRequestUrl()).origin;
    return { ok: true, url: hubspotAuthorizeUrl(origin, state) };
  });

/**
 * Re-checks the stored connection against HubSpot with a live authenticated
 * call. The connection is only marked Connected while HubSpot confirms it.
 */
export const verifyHubSpotConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const {
      loadHubSpotConnection,
      verifyContactsAccess,
      hubspotErrorForCustomer,
      markHubSpotNeedsReconnect,
      HUBSPOT_SLUG,
    } = await import("@/lib/hubspot.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const conn = await loadHubSpotConnection(data.workspaceId);
    if (!conn) return { ok: false, message: "HubSpot is not connected yet." };

    const check = await verifyContactsAccess(conn.id);
    if (!check.ok) {
      await markHubSpotNeedsReconnect(conn.id, hubspotErrorForCustomer(check.error));
      await supabaseAdmin.from("integration_sync_logs").insert({
        workspace_id: data.workspaceId,
        connection_id: conn.id,
        slug: HUBSPOT_SLUG,
        action: "verify",
        status: "failed",
        error: `hubspot verify error=${check.error}`,
        finished_at: new Date().toISOString(),
      });
      return { ok: false, message: hubspotErrorForCustomer(check.error) };
    }

    await supabaseAdmin
      .from("integration_connections")
      .update({
        status: "connected",
        error_message: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", conn.id)
      .eq("workspace_id", data.workspaceId);

    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      connection_id: conn.id,
      slug: HUBSPOT_SLUG,
      action: "verify",
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return { ok: true, message: "HubSpot connection confirmed." };
  });

/** Revokes the stored authorization at HubSpot, then removes the connection. */
export const disconnectHubSpot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const {
      loadHubSpotConnection,
      readHubSpotCredentials,
      revokeRefreshToken,
      HUBSPOT_SLUG,
    } = await import("@/lib/hubspot.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const conn = await loadHubSpotConnection(data.workspaceId);
    if (!conn) return { ok: true, message: "HubSpot is not connected." };

    const creds = await readHubSpotCredentials(conn.id);
    if (creds?.refresh_token) await revokeRefreshToken(creds.refresh_token);

    await supabaseAdmin.from("integration_secrets").delete().eq("connection_id", conn.id);
    const { error } = await supabaseAdmin
      .from("integration_connections")
      .delete()
      .eq("id", conn.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      slug: HUBSPOT_SLUG,
      action: "disconnect",
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return { ok: true, message: "HubSpot disconnected. Your CRM records were not changed." };
  });
