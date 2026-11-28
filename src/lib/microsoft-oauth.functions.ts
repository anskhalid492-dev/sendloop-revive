import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Started from Email Accounts → Office 365; only works on the registered production origin.
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
/** Revokes stored Microsoft tokens and stops sending/reading. History and the mailbox row stay; reconnect re-runs consent. */
export const disconnectMicrosoftMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ mailboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS-scoped read proves the caller can see this mailbox.
    const { data: mailbox } = await context.supabase.from("mailboxes").select("id, smtp_host").eq("id", data.mailboxId).maybeSingle();
    if (!mailbox || mailbox.smtp_host !== "graph.microsoft.com") throw new Error("Microsoft mailbox not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("mailboxes").update({ status: "pending" }).eq("id", data.mailboxId);
    // Table is owner-applied (supabase/manual/microsoft-graph-mailboxes.sql) and not in generated types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("microsoft_mailbox_tokens")
      .update({ encrypted_tokens: null, status: "revoked", last_error: "Disconnected by user" }).eq("mailbox_id", data.mailboxId);
    if (error) throw new Error("Could not disconnect the Microsoft mailbox.");
    return { ok: true };
  });
