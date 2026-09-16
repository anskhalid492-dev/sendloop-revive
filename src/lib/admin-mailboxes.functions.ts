/**
 * Admin → Outreach → Mailboxes (read-only).
 *
 * Lists every mailbox connected by every customer from the existing
 * `mailboxes` table, joined to `workspaces` for the customer name.
 * There is deliberately NO create/update/delete/test function here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminMailboxRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email_address: string;
  display_name: string | null;
  provider_type: "Gmail" | "Outlook" | "IMAP/SMTP";
  status: string;
  /** The customer's own pause switch. False means connected but paused. */
  is_active: boolean;
  daily_send_limit: number | null;
  warmup_enabled: boolean;
  last_tested_at: string | null;
  created_at: string | null;
  /**
   * Connection shape only — hostnames, ports and transport security. Never a
   * password, token or any credential: those live in the vault and are not
   * read here at all.
   */
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
};

/** Provider type inferred from the servers the customer connected through. */
function inferProviderType(host: string | null): AdminMailboxRow["provider_type"] {
  const value = (host ?? "").toLowerCase();
  if (value.includes("google") || value.includes("gmail")) return "Gmail";
  if (
    value.includes("office365") ||
    value.includes("outlook") ||
    value.includes("hotmail") ||
    value.includes("microsoft")
  ) {
    return "Outlook";
  }
  return "IMAP/SMTP";
}

export const adminListCustomerMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ status: z.string().max(40).optional().nullable() })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminMailboxRow[]> => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("mailboxes")
      .select(
        "id, workspace_id, email_address, display_name, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, status, is_active, daily_send_limit, warmup_enabled, last_tested_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    const status = data?.status && data.status !== "all" ? data.status : null;
    if (status) query = query.eq("status", status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      workspace_id: string;
      email_address: string;
      display_name: string | null;
      smtp_host: string | null;
      smtp_port: number | null;
      smtp_secure: boolean | null;
      imap_host: string | null;
      imap_port: number | null;
      imap_secure: boolean | null;
      status: string | null;
      is_active: boolean | null;
      daily_send_limit: number | null;
      warmup_enabled: boolean | null;
      last_tested_at: string | null;
      created_at: string | null;
    }>;

    const workspaceIds = [...new Set(list.map((row) => row.workspace_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (workspaceIds.length) {
      const { data: workspaces } = await supabaseAdmin
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      for (const workspace of (workspaces ?? []) as Array<{ id: string; name: string | null }>) {
        names.set(workspace.id, workspace.name ?? "Unnamed workspace");
      }
    }

    return list.map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      workspace_name: names.get(row.workspace_id) ?? "Unknown workspace",
      email_address: row.email_address,
      display_name: row.display_name ?? null,
      provider_type: inferProviderType(row.smtp_host ?? row.imap_host),
      status: row.status ?? "pending",
      is_active: row.is_active !== false,
      daily_send_limit: row.daily_send_limit ?? null,
      warmup_enabled: !!row.warmup_enabled,
      last_tested_at: row.last_tested_at,
      created_at: row.created_at ?? null,
      smtp_host: row.smtp_host ?? null,
      smtp_port: row.smtp_port ?? null,
      smtp_secure: row.smtp_secure ?? null,
      imap_host: row.imap_host ?? null,
      imap_port: row.imap_port ?? null,
      imap_secure: row.imap_secure ?? null,
    }));
  });
