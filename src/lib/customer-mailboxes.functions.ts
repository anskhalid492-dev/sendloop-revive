/**
 * Customer mailbox connection (new, self-contained).
 *
 * Tests real SMTP + IMAP logins and saves the mailbox into the new `mailboxes`
 * table. Passwords go into the database's encrypted secret store (Vault); the
 * row only holds the secret reference.
 *
 * Nothing here reads or writes any pre-existing table, and it has no
 * connection to the Resend system-email setup.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MailboxAuthResult } from "@/lib/mailbox-auth-check";

const endpointSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["ssl", "tls", "none"]),
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const testSchema = z.object({
  workspaceId: z.string().uuid(),
  smtp: endpointSchema,
  imap: endpointSchema,
});

const saveSchema = testSchema.extend({
  emailAddress: z.string().trim().email(),
  displayName: z.string().trim().max(120).optional(),
  dailySendLimit: z.number().int().min(1).max(2000).default(50),
  warmupEnabled: z.boolean().default(false),
});

export type MailboxConnectionTest = {
  ok: boolean;
  smtp: { ok: boolean; message: string };
  imap: { ok: boolean; message: string };
  testedAt: string;
};

export type MailboxSaveResult = MailboxConnectionTest & {
  mailboxId: string | null;
  status: "pending" | "connected";
  /**
   * Authentication verdict for the mailbox's own domain, checked straight after
   * the logins. Null only when the DNS check itself could not be run.
   */
  auth: MailboxAuthResult | null;
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

/** Runs a real SMTP login and a real IMAP login, reported separately. */
export const testMailboxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => testSchema.parse(input))
  .handler(async ({ data, context }): Promise<MailboxConnectionTest> => {
    await assertMember(context.supabase, data.workspaceId);
    const { testMailboxEndpoints } = await import("@/lib/mailbox-connection.server");
    return testMailboxEndpoints(data.smtp, data.imap);
  });

/**
 * Tests, then saves. The record is only stored as "connected" when both logins
 * pass; otherwise it is stored as "pending" with the exact errors returned.
 */
export const saveMailboxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<MailboxSaveResult> => {
    await assertMember(context.supabase, data.workspaceId);

    const { testMailboxEndpoints } = await import("@/lib/mailbox-connection.server");
    const result = await testMailboxEndpoints(data.smtp, data.imap);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const storeSecret = async (value: string, label: string) => {
      const { data: id, error } = await supabaseAdmin.rpc("mailbox_store_secret", {
        _value: value,
        _label: `${label}:${data.emailAddress}:${Date.now()}`,
      });
      if (error) throw new Error(`Could not store the password securely: ${error.message}`);
      return id as unknown as string;
    };

    const smtpSecretId = await storeSecret(data.smtp.password, "smtp");
    const imapSecretId = await storeSecret(data.imap.password, "imap");

    const status: "pending" | "connected" = result.ok ? "connected" : "pending";

    const { data: row, error } = await supabaseAdmin
      .from("mailboxes")
      .upsert(
        {
          workspace_id: data.workspaceId,
          email_address: data.emailAddress.toLowerCase(),
          display_name: data.displayName ?? null,
          smtp_host: data.smtp.host,
          smtp_port: data.smtp.port,
          smtp_secure: data.smtp.security === "ssl",
          smtp_username: data.smtp.username,
          smtp_password: smtpSecretId,
          imap_host: data.imap.host,
          imap_port: data.imap.port,
          imap_secure: data.imap.security === "ssl",
          imap_username: data.imap.username,
          imap_password: imapSecretId,
          daily_send_limit: data.dailySendLimit,
          warmup_enabled: data.warmupEnabled,
          status,
          last_tested_at: result.testedAt,
        },
        { onConflict: "workspace_id,email_address" },
      )
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    // The mailbox's own domain is checked in public DNS right after the logins,
    // independently of the mail host. A DNS problem never fails the save — it is
    // reported so the customer can fix it before sending.
    let auth: MailboxAuthResult | null = null;
    try {
      const { checkMailboxDomainAuth, persistMailboxAuth } = await import(
        "@/lib/mailbox-auth-check.server"
      );
      auth = await checkMailboxDomainAuth(data.emailAddress);
      if (row?.id) await persistMailboxAuth(supabaseAdmin, row.id, auth, { allowPause: false });
    } catch (authError) {
      console.error("[mailbox-auth] check after connect failed", authError);
    }

    return { ...result, mailboxId: row?.id ?? null, status, auth };
  });

export type CustomerMailbox = {
  id: string;
  email_address: string;
  display_name: string | null;
  smtp_host: string;
  imap_host: string;
  status: string;
  daily_send_limit: number;
  warmup_enabled: boolean;
  last_tested_at: string | null;
  created_at: string;
};

/** The workspace's connected mailboxes (never returns passwords). */
export const listMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CustomerMailbox[]> => {
    const { data: rows, error } = await context.supabase
      .from("mailboxes")
      .select(
        "id, email_address, display_name, smtp_host, imap_host, status, daily_send_limit, warmup_enabled, last_tested_at, created_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CustomerMailbox[];
  });
