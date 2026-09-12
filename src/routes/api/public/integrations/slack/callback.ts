/**
 * Slack OAuth v2 redirect target.
 *
 * Public route because Slack (not the browser session) calls it, so it trusts
 * nothing but the signed, single-use `state` value MunchReach issued when the
 * customer pressed "Connect Slack". The code is exchanged here, server-side,
 * and the connection is only stored as connected after a live `auth.test`.
 */
import { createFileRoute } from "@tanstack/react-router";

function back(origin: string, params: Record<string, string>) {
  const url = new URL("/settings", origin);
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

export const Route = createFileRoute("/api/public/integrations/slack/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state") ?? "";

        const {
          verifyState,
          exchangeCode,
          slackAuthTest,
          revokeToken,
          saveSlackCredentials,
          SLACK_SLUG,
          SLACK_SCOPES,
        } = await import("@/lib/slack.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const state = verifyState(rawState);
        if (!state) return back(origin, { slack: "state_invalid" });
        if (url.searchParams.get("error")) return back(origin, { slack: "declined" });
        if (!code) return back(origin, { slack: "no_code" });

        // Single-use: the pending row inserted at start is claimed exactly once.
        const stateKey = `slack:oauth:${state.nonce}`;
        const { data: pending } = await supabaseAdmin
          .from("integration_events")
          .select("id, workspace_id, status")
          .eq("idempotency_key", stateKey)
          .maybeSingle();
        const pendingRow = pending as { id: string; workspace_id: string; status: string } | null;
        if (!pendingRow || pendingRow.status !== "pending") {
          return back(origin, { slack: "state_used" });
        }
        if (pendingRow.workspace_id !== state.workspaceId) {
          return back(origin, { slack: "state_invalid" });
        }
        const { data: claimed } = await supabaseAdmin
          .from("integration_events")
          .update({ status: "consumed" })
          .eq("id", pendingRow.id)
          .eq("status", "pending")
          .select("id");
        if (!claimed || claimed.length === 0) return back(origin, { slack: "state_used" });

        // The user must still be an owner/admin of that workspace.
        const { data: member } = await supabaseAdmin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", state.workspaceId)
          .eq("user_id", state.userId)
          .maybeSingle();
        const role = (member as { role: string } | null)?.role;
        if (!role || !["owner", "admin"].includes(role)) {
          return back(origin, { slack: "forbidden" });
        }

        const tokens = await exchangeCode(code, origin);
        if (!tokens.ok || !tokens.access_token) {
          return back(origin, { slack: "exchange_failed" });
        }
        const webhookUrl = tokens.incoming_webhook?.url ?? "";
        if (!webhookUrl) {
          await revokeToken(tokens.access_token);
          return back(origin, { slack: "no_channel" });
        }

        // Nothing is stored as connected without a live authenticated API call.
        const me = await slackAuthTest(tokens.access_token);
        if (!me.ok) {
          await revokeToken(tokens.access_token);
          return back(origin, { slack: "verify_failed" });
        }

        const teamId = tokens.team?.id ?? me.team_id ?? "";
        const teamName = tokens.team?.name ?? me.team ?? "Slack workspace";

        const { data: existing } = await supabaseAdmin
          .from("integration_connections")
          .select("id, config")
          .eq("workspace_id", state.workspaceId)
          .eq("slug", SLACK_SLUG)
          .maybeSingle();
        const existingConfig =
          ((existing as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<
            string,
            unknown
          >;
        const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
        const defaultEvents = INTEGRATIONS_BY_SLUG[SLACK_SLUG]?.events ?? [];

        const channel = tokens.incoming_webhook?.channel ?? null;
        const nextConfig: Record<string, unknown> = {
          ...existingConfig,
          events: (existingConfig["events"] as string[] | undefined) ?? defaultEvents,
          auth: "oauth",
          slack_team_id: teamId,
          slack_team_name: teamName,
          slack_channel: channel,
          slack_channel_id: tokens.incoming_webhook?.channel_id ?? null,
          slack_user_id: tokens.authed_user?.id ?? null,
          slack_team_url: me.url ?? null,
          scopes: (tokens.scope ?? SLACK_SCOPES.join(",")).split(",").filter(Boolean),
          connected_at: new Date().toISOString(),
        };

        // Reconnect updates the one row for this workspace — never a duplicate.
        const { data: upserted, error } = await supabaseAdmin
          .from("integration_connections")
          .upsert(
            {
              workspace_id: state.workspaceId,
              slug: SLACK_SLUG,
              status: "connected",
              account_label: channel ? `${teamName} · ${channel}` : teamName,
              config: nextConfig as never,
              error_message: null,
              last_synced_at: new Date().toISOString(),
              created_by: state.userId,
            },
            { onConflict: "workspace_id,slug" },
          )
          .select("id")
          .single();
        if (error || !upserted) return back(origin, { slack: "store_failed" });
        const connectionId = String((upserted as { id: string }).id);

        await saveSlackCredentials(connectionId, {
          access_token: tokens.access_token,
          webhook_url: webhookUrl,
          team_id: teamId,
          team_name: teamName,
          ...(tokens.authed_user?.id ? { authed_user_id: tokens.authed_user.id } : {}),
          ...(tokens.scope ? { scope: tokens.scope } : {}),
        });

        await supabaseAdmin.from("integration_sync_logs").insert({
          workspace_id: state.workspaceId,
          connection_id: connectionId,
          slug: SLACK_SLUG,
          action: "connect",
          status: "success",
          finished_at: new Date().toISOString(),
        });

        return back(origin, { slack: "connected" });
      },
    },
  },
});
