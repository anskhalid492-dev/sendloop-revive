/**
 * Customer-facing mailbox authentication checks.
 *
 * Runs the independent DNS check for a mailbox the customer owns and returns the
 * verdict plus the host-specific instructions. Read-only with respect to DNS.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MailboxAuthResult } from "@/lib/mailbox-auth-check";

export type MailboxAuthStatusRow = {
  id: string;
  email_address: string;
  status: string;
  is_active: boolean;
  daily_send_limit: number;
  auth_status: string | null;
  auth_reason: string | null;
  spf_status: string | null;
  dkim_status: string | null;
  dmarc_status: string | null;
  mail_host: string | null;
  provider_daily_ceiling: number | null;
  auth_checked_at: string | null;
};

/** Confirms the caller belongs to the workspace they claim (RLS-backed). */
async function assertMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("You do not have access to this workspace.");
}

/**
 * Runs (or re-runs) the authentication check for one address.
 *
 * `mailboxId` is optional: the connect screen checks an address before a row
 * exists, and the mailbox list re-checks a saved one.
 */
export const checkMailboxAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        emailAddress: z.string().trim().email(),
        mailboxId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MailboxAuthResult> => {
    await assertMember(context.supabase, data.workspaceId);

    const { checkMailboxDomainAuth, persistMailboxAuth } = await import(
      "@/lib/mailbox-auth-check.server"
    );
    const result = await checkMailboxDomainAuth(data.emailAddress);

    if (data.mailboxId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // A customer-triggered re-check reports only: it never switches a mailbox
      // off underneath a running campaign.
      await persistMailboxAuth(supabaseAdmin, data.mailboxId, result, { allowPause: false });
    }

    return result;
  });

/** Authentication status of every connected mailbox in the workspace. */
export const listMailboxAuthStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<MailboxAuthStatusRow[]> => {
    const columns =
      "id, email_address, status, is_active, daily_send_limit, auth_status, auth_reason, spf_status, dkim_status, dmarc_status, mail_host, provider_daily_ceiling, auth_checked_at";
    const { data: rows, error } = await context.supabase
      .from("mailboxes")
      .select(columns)
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      // Before the auth columns are deployed, fall back to the base columns so
      // the screen still renders instead of erroring.
      if (error.code === "42703" || error.code === "PGRST204") {
        const { data: base, error: baseError } = await context.supabase
          .from("mailboxes")
          .select("id, email_address, status, is_active, daily_send_limit")
          .eq("workspace_id", data.workspaceId)
          .order("created_at", { ascending: false });
        if (baseError) throw new Error(baseError.message);
        return ((base ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row["id"]),
          email_address: String(row["email_address"]),
          status: String(row["status"] ?? ""),
          is_active: row["is_active"] !== false,
          daily_send_limit: Number(row["daily_send_limit"] ?? 0),
          auth_status: null,
          auth_reason: null,
          spf_status: null,
          dkim_status: null,
          dmarc_status: null,
          mail_host: null,
          provider_daily_ceiling: null,
          auth_checked_at: null,
        }));
      }
      throw new Error(error.message);
    }

    return (rows ?? []) as unknown as MailboxAuthStatusRow[];
  });
