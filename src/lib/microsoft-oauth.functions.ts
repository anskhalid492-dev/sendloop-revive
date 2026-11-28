import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Not mounted in Email Accounts until real-account verification and an approved integration stage.
export const initiateMicrosoftMailboxOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { microsoftConfig, prepareMicrosoftConsent, MICROSOFT_COOKIE, TRANSACTION_SECONDS } = await import("@/lib/microsoft-oauth.server");
    const config = microsoftConfig({ clientId: process.env["MICROSOFT_CLIENT_ID"],
      clientSecret: process.env["MICROSOFT_CLIENT_SECRET"], tenantId: process.env["MICROSOFT_TENANT_ID"],
      redirectUri: process.env["MICROSOFT_REDIRECT_URI"] });
    const request = getRequest();
    // Do not set a production flow cookie on preview/www/different origins.
    if (new URL(request.url).origin !== new URL(config.redirectUri).origin ||
        request.headers.get("origin") !== new URL(config.redirectUri).origin) throw new Error("Start Microsoft authorization from https://munchreach.com.");
    const { data: workspace, error } = await context.supabase.from("workspaces").select("id").eq("id", data.workspaceId).maybeSingle();
    if (error || !workspace) throw new Error("You do not have access to this workspace.");
    const result = await prepareMicrosoftConsent(config, context.userId, data.workspaceId);
    setResponseHeader("Cache-Control", "no-store");
    setCookie(MICROSOFT_COOKIE, result.cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TRANSACTION_SECONDS });
    return { authorizationUrl: result.authorizationUrl };
  });