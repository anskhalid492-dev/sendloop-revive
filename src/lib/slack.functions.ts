/**
 * Customer-facing Slack OAuth endpoints.
 *
 * Every handler re-checks workspace membership and role server-side, so one
 * workspace can never start, read or remove another workspace's Slack
 * connection. No bot token, webhook URL or app secret is ever returned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export type SlackStatus = {
  configured: boolean;
  connected: boolean;
  status: string;
  teamName: string | null;
  channel: string | null;
  teamUrl: string | null;
  scopes: string[];
  connectedAt: string | null;
  errorMessage: string | null;
};

export const getSlackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<SlackStatus> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { slackAppCredentials, loadSlackConnection } = await import("@/lib/slack.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, false);

    const configured = Boolean(slackAppCredentials());
    const conn = await loadSlackConnection(data.workspaceId);
    const config = (conn?.config ?? {}) as Record<string, unknown>;
    return {
      configured,
      connected: Boolean(conn),
      status: conn?.status ?? "not_connected",
      teamName: (config["slack_team_name"] as string | null) ?? conn?.account_label ?? null,
      channel: (config["slack_channel"] as string | null) ?? null,
      teamUrl: (config["slack_team_url"] as string | null) ?? null,
      scopes: Array.isArray(config["scopes"]) ? (config["scopes"] as string[]) : [],
      connectedAt: (config["connected_at"] as string | null) ?? null,
      errorMessage: conn?.error_message ?? null,
    };
  });

/** Returns the Slack consent URL; the browser then leaves for Slack. */
export const startSlackOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; message?: string }> => {
    const { requireWorkspaceRole, workspaceHasPaidPlan } = await import("@/lib/integrations.server");
    const { slackAppCredentials, slackAuthorizeUrl, signState, newStateNonce, SLACK_SLUG } =
      await import("@/lib/slack.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestUrl } = await import("@tanstack/react-start/server");

    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const { requireEntitlement } = await import("@/lib/billing/usage.server");
    await requireEntitlement(data.workspaceId, "integrations");

    if (!slackAppCredentials()) {
      return { ok: false, message: "Slack sign-in is not available on this environment yet." };
    }

    const { data: catalogRow } = await supabaseAdmin
      .from("integrations")
      .select("is_enabled, requires_paid_plan")
      .eq("slug", SLACK_SLUG)
      .maybeSingle();
    const row = catalogRow as { is_enabled: boolean; requires_paid_plan: boolean } | null;
    if (!row || !row.is_enabled) return { ok: false, message: "Slack is currently unavailable." };
    if (row.requires_paid_plan && !(await workspaceHasPaidPlan(data.workspaceId))) {
      return { ok: false, message: "Slack is available on paid plans. Upgrade to connect it." };
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
      slug: SLACK_SLUG,
      direction: "oauth",
      event_type: "oauth.start",
      status: "pending",
      message: "Slack authorization started.",
      payload: {} as never,
      idempotency_key: `slack:oauth:${nonce}`,
    });
    if (error) return { ok: false, message: "Could not start the Slack connection." };

    const origin = new URL(getRequestUrl()).origin;
    return { ok: true, url: slackAuthorizeUrl(origin, state) };
  });

/**
 * Re-checks the stored connection against Slack with a live authenticated call.
 * The connection is only marked Connected while Slack confirms the token.
 */
export const verifySlackConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const {
      loadSlackConnection,
      readSlackCredentials,
      slackAuthTest,
      slackErrorForCustomer,
      markSlackNeedsReconnect,
      SLACK_SLUG,
    } = await import("@/lib/slack.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const conn = await loadSlackConnection(data.workspaceId);
    if (!conn) return { ok: false, message: "Slack is not connected yet." };

    const creds = await readSlackCredentials(conn.id);
    if (!creds) {
      await markSlackNeedsReconnect(conn.id, "Slack credentials could not be read. Reconnect Slack.");
      return { ok: false, message: "Slack credentials could not be read. Use Reconnect." };
    }

    const me = await slackAuthTest(creds.access_token);
    if (!me.ok) {
      await markSlackNeedsReconnect(conn.id, slackErrorForCustomer(me.error));
      await supabaseAdmin.from("integration_sync_logs").insert({
        workspace_id: data.workspaceId,
        connection_id: conn.id,
        slug: SLACK_SLUG,
        action: "verify",
        status: "failed",
        error: `slack auth.test error=${me.error}`,
        finished_at: new Date().toISOString(),
      });
      return { ok: false, message: slackErrorForCustomer(me.error) };
    }

    const config = (conn.config ?? {}) as Record<string, unknown>;
    await supabaseAdmin
      .from("integration_connections")
      .update({
        status: "connected",
        error_message: null,
        last_synced_at: new Date().toISOString(),
        config: {
          ...config,
          slack_team_name: me.team ?? config["slack_team_name"] ?? null,
          slack_team_id: me.team_id ?? config["slack_team_id"] ?? null,
          slack_team_url: me.url ?? config["slack_team_url"] ?? null,
        } as never,
      })
      .eq("id", conn.id)
      .eq("workspace_id", data.workspaceId);

    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      connection_id: conn.id,
      slug: SLACK_SLUG,
      action: "verify",
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return { ok: true, message: `Slack connection confirmed with ${me.team ?? "your workspace"}.` };
  });

/** Revokes the bot token at Slack, then removes the stored connection. */
export const disconnectSlack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { loadSlackConnection, readSlackCredentials, revokeToken, SLACK_SLUG } = await import(
      "@/lib/slack.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const conn = await loadSlackConnection(data.workspaceId);
    if (!conn) return { ok: true, message: "Slack is not connected." };

    const creds = await readSlackCredentials(conn.id);
    if (creds?.access_token) await revokeToken(creds.access_token);

    await supabaseAdmin.from("integration_secrets").delete().eq("connection_id", conn.id);
    const { error } = await supabaseAdmin
      .from("integration_connections")
      .delete()
      .eq("id", conn.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      slug: SLACK_SLUG,
      action: "disconnect",
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return { ok: true, message: "Slack disconnected." };
  });
