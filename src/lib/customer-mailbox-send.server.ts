/**
 * Sending through a customer's OWN mailbox (the `mailboxes` table).
 *
 * All SMTP work goes through the `mailbox-smtp-relay` edge function over HTTPS.
 * This runtime is Cloudflare Workers, which cannot open sockets to Cloudflare's
 * own IP ranges (Hostinger and similar), so there is deliberately NO direct
 * socket path here — the relay is the only transport.
 *
 * Server-only. Passwords are read from the encrypted secret store at send time
 * and never stored on the row itself.
 */
import type { MailEndpoint } from "@/lib/mailbox-connection.server";

export type CustomerMailboxSend = {
  ok: boolean;
  message: string;
  messageId: string | null;
};

type MailboxRow = {
  id: string;
  email_address: string;
  display_name: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  smtp_password: string | null;
  status: string | null;
  is_active?: boolean | null;
};

/**
 * Loads the USABLE mailbox for this sender address, or null when there is none.
 * Usable means both `status = 'connected'` and `is_active = true` — a paused
 * mailbox is treated exactly like no connected mailbox at all. See
 * `@/lib/mailbox-active.server` for the customer-facing paused wording.
 */
export async function findCustomerMailbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  workspaceId: string,
  fromEmail: string,
): Promise<MailboxRow | null> {
  const email = (fromEmail ?? "").trim().toLowerCase();
  if (!workspaceId || !email) return null;

  const { data, error } = await admin
    .from("mailboxes")
    .select(
      "id, email_address, display_name, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, status, is_active",
    )
    .eq("workspace_id", workspaceId)
    .eq("email_address", email)
    .maybeSingle();

  if (error) return null;
  const row = (data as MailboxRow | null) ?? null;
  if (!row) return null;
  if (row.status !== "connected") return null;
  // The customer's own pause switch. Never fall back to anything else.
  if (row.is_active === false) return null;
  if (!row.smtp_host || !row.smtp_port || !row.smtp_username || !row.smtp_password) return null;
  return row;
}

async function smtpEndpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: MailboxRow,
): Promise<MailEndpoint> {
  const { data: password, error } = await admin.rpc("mailbox_read_secret", {
    _id: row.smtp_password,
  });
  if (error || !password) {
    throw new Error("This mailbox's saved password could not be read. Reconnect the mailbox.");
  }
  return {
    host: row.smtp_host as string,
    port: row.smtp_port as number,
    security: row.smtp_secure ? "ssl" : "tls",
    username: row.smtp_username as string,
    password: String(password),
  };
}

/**
 * Sends ONE message through the customer's own mailbox via the relay.
 *
 * `envelopeTo` carries every delivery target (To + Cc + Bcc) for that single
 * message, so Cc recipients see each other and Bcc recipients stay hidden.
 * Returns a failure result (never throws) so callers keep their retry handling.
 */
export async function sendViaCustomerMailbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: MailboxRow,
  message: {
    to: string;
    envelopeTo?: string[];
    subject: string;
    html?: string | null;
    text?: string | null;
    fromName?: string | null;
    headers?: Record<string, string>;
    attachments?: { filename: string; contentType: string; contentBase64: string }[];
  },
  options?: { timeoutMs?: number },
): Promise<CustomerMailboxSend> {
  try {
    const smtp = await smtpEndpoint(admin, row);
    const { relaySendMail } = await import("@/lib/mailbox-relay.server");
    const result = await relaySendMail(smtp, {
      from: row.email_address,
      // The name saved on the mailbox is what the customer typed for this
      // address, so it wins over any name carried by older bookkeeping rows.
      ...((row.display_name?.trim() || message.fromName?.trim())
        ? { fromName: (row.display_name?.trim() || message.fromName?.trim())! }
        : {}),
      to: message.to,
      ...(message.envelopeTo?.length ? { envelopeTo: message.envelopeTo } : {}),
      subject: message.subject,
      ...(message.html ? { html: message.html } : {}),
      ...(message.text ? { text: message.text } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    }, options?.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined);
    return {
      ok: !!result?.ok,
      message: result?.message ?? (result?.ok ? "Sent." : "The mail relay did not accept the send."),
      messageId: result?.messageId ?? null,
    };

  } catch (error) {
    return { ok: false, message: (error as Error).message, messageId: null };
  }
}
