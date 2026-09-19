/**
 * Server-side signature resolution for the real sending pipeline.
 *
 * The sending mailbox is the source of truth: campaign dispatch, Unified Inbox
 * replies, Compose and test sends all resolve the signature from the mailbox
 * the message actually leaves through — never from anything the browser sent.
 *
 * Lookups are memoised per workspace + mailbox address for a short window so a
 * large campaign does not re-query the signature for every recipient.
 */
import {
  renderSignature,
  senderFieldsFrom,
  type RenderedSignature,
  type SignatureRow,
  type SignatureSenderFields,
} from "@/lib/signature-model";

type AnyClient = { from: (table: string) => any };

type CacheEntry = { value: RenderedSignature | null; at: number };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Test / admin helper: forget memoised signatures. */
export function clearSignatureCache() {
  cache.clear();
}

function cached(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

type MailboxRow = {
  id: string;
  email_address: string;
  display_name: string | null;
};

function nameParts(displayName: string | null | undefined, fallbackEmail: string) {
  const name = (displayName ?? "").trim();
  if (!name) {
    const local = (fallbackEmail.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
    return { first: local.split(" ")[0] ?? "", last: local.split(" ").slice(1).join(" ") };
  }
  const parts = name.split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/**
 * Sender variable values for one mailbox. Stored per-signature details (company,
 * job title, phone, website) are merged over the mailbox's own identity.
 */
export function senderFieldsForMailbox(
  mailbox: MailboxRow,
  stored: Partial<SignatureSenderFields> | null | undefined,
  fromName?: string | null,
): SignatureSenderFields {
  const { first, last } = nameParts(mailbox.display_name ?? fromName ?? null, mailbox.email_address);
  const base = senderFieldsFrom({
    first_name: first,
    last_name: last,
    email: mailbox.email_address,
  });
  const merged = senderFieldsFrom(stored);
  for (const key of Object.keys(base) as Array<keyof SignatureSenderFields>) {
    if (!merged[key]) merged[key] = base[key];
  }
  return merged;
}

async function loadMailboxByEmail(
  client: AnyClient,
  workspaceId: string,
  email: string,
): Promise<MailboxRow | null> {
  try {
    const { data } = await client
      .from("mailboxes")
      .select("id, email_address, display_name")
      .eq("workspace_id", workspaceId)
      .ilike("email_address", email)
      .limit(1)
      .maybeSingle();
    return (data as MailboxRow | null) ?? null;
  } catch {
    return null;
  }
}

async function loadSignatureRow(
  client: AnyClient,
  workspaceId: string,
  mailboxId: string,
): Promise<SignatureRow | null> {
  try {
    const { data, error } = await client
      .from("email_signatures")
      .select("id, workspace_id, mailbox_id, name, html_signature, plain_text_signature, enabled, sender_fields")
      .eq("workspace_id", workspaceId)
      .eq("mailbox_id", mailboxId)
      .maybeSingle();
    // Table not deployed yet (or unreadable): sending continues без signature.
    if (error) return null;
    return (data as SignatureRow | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * The active signature for a mailbox id, already rendered. `null` when there is
 * no signature, it is disabled, or it renders empty — the email then goes out
 * exactly as before.
 */
export async function resolveSignatureForMailboxId(
  client: AnyClient,
  workspaceId: string,
  mailboxId: string,
  fromName?: string | null,
): Promise<RenderedSignature | null> {
  const key = `id:${workspaceId}:${mailboxId}`;
  const hit = cached(key);
  if (hit) return hit.value;

  let value: RenderedSignature | null = null;
  try {
    const { data: mailbox } = await client
      .from("mailboxes")
      .select("id, email_address, display_name")
      .eq("workspace_id", workspaceId)
      .eq("id", mailboxId)
      .maybeSingle();
    if (mailbox) {
      const row = await loadSignatureRow(client, workspaceId, mailboxId);
      value = renderSignature(
        row,
        senderFieldsForMailbox(mailbox as MailboxRow, row?.sender_fields ?? null, fromName),
      );
    }
  } catch {
    value = null;
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}

/**
 * The active signature for the mailbox an email is actually being sent from,
 * identified by its address (the `sending_accounts.from_email` the pipeline
 * already resolved server-side).
 */
export async function resolveSignatureForSender(
  client: AnyClient,
  workspaceId: string | null | undefined,
  fromEmail: string | null | undefined,
  fromName?: string | null,
): Promise<RenderedSignature | null> {
  const workspace = (workspaceId ?? "").trim();
  const email = (fromEmail ?? "").trim().toLowerCase();
  if (!workspace || !email) return null;

  const key = `email:${workspace}:${email}`;
  const hit = cached(key);
  if (hit) return hit.value;

  let value: RenderedSignature | null = null;
  const mailbox = await loadMailboxByEmail(client, workspace, email);
  if (mailbox) {
    const row = await loadSignatureRow(client, workspace, mailbox.id);
    value = renderSignature(
      row,
      senderFieldsForMailbox(mailbox, row?.sender_fields ?? null, fromName),
    );
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}
