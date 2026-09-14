/**
 * HubSpot OAuth 2.0 redirect target.
 *
 * Public route because HubSpot (not the browser session) calls it, so it trusts
 * nothing but the signed, single-use `state` value MunchReach issued when the
 * customer pressed "Connect HubSpot". The code is exchanged here, server-side,
 * and the connection is only stored after a live authenticated CRM read.
 */
import { createFileRoute } from "@tanstack/react-router";

function back(origin: string, params: Record<string, string>) {
  const url = new URL("/settings", origin);
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

export const Route = createFileRoute("/api/public/integrations/hubspot/callback")({
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
          tokenInfo,
          verifyContactsAccessWithToken,
          revokeRefreshToken,
          saveHubSpotCredentials,
          HUBSPOT_SLUG,
          HUBSPOT_SCOPES,
        } = await import("@/lib/hubspot.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const state = verifyState(rawState);
        if (!state) return back(origin, { hubspot: "state_invalid" });
        if (url.searchParams.get("error")) return back(origin, { hubspot: "declined" });
        if (!code) return back(origin, { hubspot: "no_code" });

        // Single-use: the pending row inserted at start is claimed exactly once.
        const stateKey = `hubspot:oauth:${state.nonce}`;
        const { data: pending } = await supabaseAdmin
          .from("integration_events")
          .select("id, workspace_id, status")
          .eq("idempotency_key", stateKey)
          .maybeSingle();
        const pendingRow = pending as { id: string; workspace_id: string; status: string } | null;
        if (!pendingRow || pendingRow.status !== "pending") {
          return back(origin, { hubspot: "state_used" });
        }
        if (pendingRow.workspace_id !== state.workspaceId) {
          return back(origin, { hubspot: "state_invalid" });
        }
        const { data: claimed } = await supabaseAdmin
          .from("integration_events")
          .update({ status: "consumed" })
          .eq("id", pendingRow.id)
          .eq("status", "pending")
          .select("id");
        if (!claimed || claimed.length === 0) return back(origin, { hubspot: "state_used" });

        // The user must still be an owner/admin of that workspace.
        const { data: member } = await supabaseAdmin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", state.workspaceId)
          .eq("user_id", state.userId)
          .maybeSingle();
        const role = (member as { role: string } | null)?.role;
        if (!role || !["owner", "admin"].includes(role)) {
          return back(origin, { hubspot: "forbidden" });
        }

        const tokens = await exchangeCode(code, origin);
        if (!tokens.ok || !tokens.access_token || !tokens.refresh_token) {
          return back(origin, { hubspot: "exchange_failed" });
        }

        // Nothing is stored as connected without a live authenticated CRM call.
        const check = await verifyContactsAccessWithToken(tokens.access_token);
        if (!check.ok) {
          await revokeRefreshToken(tokens.refresh_token);
          return back(origin, { hubspot: "verify_failed" });
        }

        const info = await tokenInfo(tokens.access_token);
        const portalId = info.hubId ?? null;
        const accountName = info.hubDomain ?? "HubSpot portal";

        const { data: existing } = await supabaseAdmin
          .from("integration_connections")
          .select("id, config")
          .eq("workspace_id", state.workspaceId)
          .eq("slug", HUBSPOT_SLUG)
          .maybeSingle();
        const existingConfig =
          ((existing as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<
            string,
            unknown
          >;
        const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
        const defaultEvents = INTEGRATIONS_BY_SLUG[HUBSPOT_SLUG]?.events ?? [];

        const nextConfig: Record<string, unknown> = {
          ...existingConfig,
          events: (existingConfig["events"] as string[] | undefined) ?? defaultEvents,
          auth: "oauth",
          hubspot_portal_id: portalId,
          hubspot_hub_domain: info.hubDomain ?? null,
          hubspot_user: info.user ?? null,
          scopes: info.scopes ?? [...HUBSPOT_SCOPES],
          connected_at: new Date().toISOString(),
        };

        // Reconnect updates the one row for this workspace — never a duplicate.
        const { data: upserted, error } = await supabaseAdmin
          .from("integration_connections")
          .upsert(
            {
              workspace_id: state.workspaceId,
              slug: HUBSPOT_SLUG,
              status: "connected",
              account_label: portalId ? `${accountName} · ${portalId}` : accountName,
              config: nextConfig as never,
              error_message: null,
              last_synced_at: new Date().toISOString(),
              created_by: state.userId,
            },
            { onConflict: "workspace_id,slug" },
          )
          .select("id")
          .single();
        if (error || !upserted) return back(origin, { hubspot: "store_failed" });
        const connectionId = String((upserted as { id: string }).id);

        // Written last: the old private-app token is replaced only once the new
        // OAuth authorization is proven to work.
        await saveHubSpotCredentials(connectionId, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000).toISOString(),
          ...(portalId ? { hub_id: portalId } : {}),
          ...(info.hubDomain ? { hub_domain: info.hubDomain } : {}),
          scope: (info.scopes ?? [...HUBSPOT_SCOPES]).join(" "),
        });

        await supabaseAdmin.from("integration_sync_logs").insert({
          workspace_id: state.workspaceId,
          connection_id: connectionId,
          slug: HUBSPOT_SLUG,
          action: "connect",
          status: "success",
          finished_at: new Date().toISOString(),
        });

        return back(origin, { hubspot: "connected" });
      },
    },
  },
});
