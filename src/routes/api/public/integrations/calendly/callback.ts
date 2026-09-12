/**
 * Calendly OAuth 2.0 redirect target.
 *
 * Public route because Calendly (not the browser session) calls it, so it
 * trusts nothing but the signed, single-use `state` value that MunchReach
 * issued when the customer pressed "Connect Calendly". The authorization code
 * is exchanged here, server-side; no token ever reaches the browser.
 */
import { createFileRoute } from "@tanstack/react-router";

function back(origin: string, params: Record<string, string>) {
  const url = new URL("/settings", origin);
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

export const Route = createFileRoute("/api/public/integrations/calendly/callback")({
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
          calendlyMe,
          readCalendlyCredentials,
          saveCalendlyCredentials,
          revokeToken,
          CALENDLY_SLUG,
        } = await import("@/lib/calendly.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const state = verifyState(rawState);
        if (!state) return back(origin, { calendly: "state_invalid" });
        if (url.searchParams.get("error")) return back(origin, { calendly: "declined" });
        if (!code) return back(origin, { calendly: "no_code" });

        // Single-use: the pending row inserted at start is claimed exactly once.
        const stateKey = `calendly:oauth:${state.nonce}`;
        const { data: pending } = await supabaseAdmin
          .from("integration_events")
          .select("id, workspace_id, status")
          .eq("idempotency_key", stateKey)
          .maybeSingle();
        const pendingRow = pending as { id: string; workspace_id: string; status: string } | null;
        if (!pendingRow || pendingRow.status !== "pending") {
          return back(origin, { calendly: "state_used" });
        }
        if (pendingRow.workspace_id !== state.workspaceId) {
          return back(origin, { calendly: "state_invalid" });
        }
        const { data: claimed } = await supabaseAdmin
          .from("integration_events")
          .update({ status: "consumed" })
          .eq("id", pendingRow.id)
          .eq("status", "pending")
          .select("id");
        if (!claimed || claimed.length === 0) return back(origin, { calendly: "state_used" });

        // The user must still be an owner/admin of that workspace.
        const { data: member } = await supabaseAdmin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", state.workspaceId)
          .eq("user_id", state.userId)
          .maybeSingle();
        const role = (member as { role: string } | null)?.role;
        if (!role || !["owner", "admin"].includes(role)) {
          return back(origin, { calendly: "forbidden" });
        }

        let tokens;
        try {
          tokens = await exchangeCode(code, origin);
        } catch {
          return back(origin, { calendly: "exchange_failed" });
        }

        // No connection is ever stored as connected without a live API answer.
        const me = await calendlyMe(tokens.access_token);
        if (!me.ok || !me.user) {
          await revokeToken(tokens.access_token);
          return back(origin, { calendly: "verify_failed" });
        }

        const { data: existing } = await supabaseAdmin
          .from("integration_connections")
          .select("id, config")
          .eq("workspace_id", state.workspaceId)
          .eq("slug", CALENDLY_SLUG)
          .maybeSingle();
        const existingConfig =
          ((existing as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<
            string,
            unknown
          >;

        const accountLabel = me.user.email ?? me.user.name ?? "Calendly account";
        const nextConfig: Record<string, unknown> = {
          ...existingConfig,
          events: [],
          auth: "oauth",
          calendly_name: me.user.name ?? null,
          calendly_email: me.user.email ?? null,
          calendly_scheduling_url: me.user.scheduling_url ?? null,
          owner_uri: me.user.uri,
          organization_uri: me.user.current_organization,
          connected_at: new Date().toISOString(),
        };

        const { data: upserted, error } = await supabaseAdmin
          .from("integration_connections")
          .upsert(
            {
              workspace_id: state.workspaceId,
              slug: CALENDLY_SLUG,
              status: "connected",
              account_label: accountLabel,
              config: nextConfig as never,
              error_message: null,
              last_synced_at: new Date().toISOString(),
              created_by: state.userId,
            },
            { onConflict: "workspace_id,slug" },
          )
          .select("id")
          .single();
        if (error || !upserted) return back(origin, { calendly: "store_failed" });
        const connectionId = String((upserted as { id: string }).id);

        // Keep the signing key of an existing subscription so a reconnect can
        // reuse it instead of asking Calendly for a duplicate (409 Conflict).
        const previous = await readCalendlyCredentials(connectionId);
        await saveCalendlyCredentials(connectionId, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          owner_uri: me.user.uri,
          organization_uri: me.user.current_organization,
          ...(previous?.webhook_signing_key
            ? { webhook_signing_key: previous.webhook_signing_key }
            : {}),
        });

        const { setupCalendlyWebhook } = await import("@/lib/calendly-setup.server");
        const hook = await setupCalendlyWebhook({
          workspaceId: state.workspaceId,
          connectionId,
          accessToken: tokens.access_token,
          organizationUri: me.user.current_organization,
          ownerUri: me.user.uri,
          origin,
          config: nextConfig,
        });

        return back(origin, { calendly: hook.ok ? "connected" : "webhook_failed" });
      },
    },
  },
});
