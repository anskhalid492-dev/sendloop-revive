import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/integrations/microsoft/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const { microsoftConfig, validateTransaction, verifyMicrosoftCode, MICROSOFT_COOKIE } = await import("@/lib/microsoft-oauth.server");
    const { getCookie, deleteCookie } = await import("@tanstack/react-start/server");
    const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    let config;
    try {
      config = microsoftConfig({ clientId: process.env["MICROSOFT_CLIENT_ID"], clientSecret: process.env["MICROSOFT_CLIENT_SECRET"],
        tenantId: process.env["MICROSOFT_TENANT_ID"], redirectUri: process.env["MICROSOFT_REDIRECT_URI"] });
    } catch { return new Response("Microsoft OAuth is not configured. No mailbox was connected.", { status: 503, headers }); }
    const url = new URL(request.url);
    if (url.origin + url.pathname !== config.redirectUri) return new Response("Use the registered Microsoft callback URL.", { status: 400, headers });
    const sealed = getCookie(MICROSOFT_COOKIE) ?? "";
    deleteCookie(MICROSOFT_COOKIE, { secure: true, httpOnly: true, sameSite: "lax", path: "/" });
    if (url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length > 1) return new Response("Invalid Microsoft authorization response.", { status: 400, headers });
    const tx = await validateTransaction(config, sealed, url.searchParams.get("state") ?? "");
    if (!tx) return new Response("Microsoft authorization expired or could not be verified. No mailbox was connected.", { status: 400, headers });
    if (url.searchParams.has("error")) return new Response("Microsoft authorization was declined. No mailbox was connected.", { status: 400, headers });
    try {
      const grant = await verifyMicrosoftCode(config, tx, url.searchParams.get("code") ?? "");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { connectMicrosoftMailbox } = await import("@/lib/microsoft-graph.server");
      await connectMicrosoftMailbox(supabaseAdmin, tx, grant);
      return new Response(null, { status: 303, headers: { ...headers, Location: "/mailboxes?microsoft=connected" } });
    } catch (error) {
      const reason = error instanceof Error && !/token|secret/i.test(error.message) ? error.message : "Microsoft authorization could not be verified.";
      console.warn("[microsoft-oauth] callback failed:", reason);
      return new Response(`${reason} No mailbox was connected.`, { status: 400, headers });
    }
  } } },
});