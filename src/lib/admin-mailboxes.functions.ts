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
  provider_type: "Gmail" | "Outlook" | "IMAP/SMTP";
  status: string;
  daily_send_limit: number | null;
  warmup_enabled: boolean;
  last_tested_at: string | null;
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
        "id, workspace_id, email_address, smtp_host, imap_host, status, daily_send_limit, warmup_enabled, last_tested_at",
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
      smtp_host: string | null;
      imap_host: string | null;
      status: string | null;
      daily_send_limit: number | null;
      warmup_enabled: boolean | null;
      last_tested_at: string | null;
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
      provider_type: inferProviderType(row.smtp_host ?? row.imap_host),
      status: row.status ?? "pending",
      daily_send_limit: row.daily_send_limit ?? null,
      warmup_enabled: !!row.warmup_enabled,
      last_tested_at: row.last_tested_at,
    }));
  });
