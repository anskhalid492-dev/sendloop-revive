/**
 * Platform warmup recipient pool.
 *
 * These mailboxes are managed by platform admins and are the only recipients
 * the warmup engine mails automatically. They are completely separate from
 * customer campaign leads: no campaign ever sends to them and no warmup send
 * ever touches a customer lead.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WarmupPoolRecipient = {
  id: string;
  email: string;
  name: string | null;
  mailboxProvider: string | null;
  enabled: boolean;
  status: string;
  notes: string | null;
  sentCount: number;
  receivedCount: number;
  bounceCount: number;
  replyCount: number;
  lastSentAt: string | null;
  lastReceivedAt: string | null;
  lastBounceAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type WarmupPoolHistoryRow = {
  id: string;
  createdAt: string;
  sentAt: string | null;
  fromEmail: string;
  status: string;
  placement: string | null;
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function map(row: Record<string, unknown>): WarmupPoolRecipient {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    name: (row["name"] as string | null) ?? null,
    mailboxProvider: (row["mailbox_provider"] as string | null) ?? null,
    enabled: Boolean(row["enabled"]),
    status: (row["status"] as string) ?? "active",
    notes: (row["notes"] as string | null) ?? null,
    sentCount: (row["sent_count"] as number) ?? 0,
    receivedCount: (row["received_count"] as number) ?? 0,
    bounceCount: (row["bounce_count"] as number) ?? 0,
    replyCount: (row["reply_count"] as number) ?? 0,
    lastSentAt: (row["last_sent_at"] as string | null) ?? null,
    lastReceivedAt: (row["last_received_at"] as string | null) ?? null,
    lastBounceAt: (row["last_bounce_at"] as string | null) ?? null,
    lastError: (row["last_error"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
  };
}

export async function listWarmupPool(search?: string | null): Promise<{
  recipients: WarmupPoolRecipient[];
  totals: { total: number; active: number; disabled: number; bounced: number };
}> {
  let query = supabaseAdmin
    .from("warmup_recipients")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (search) query = query.ilike("email", `%${search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const recipients = ((data ?? []) as Array<Record<string, unknown>>).map(map);
  return {
    recipients,
    totals: {
      total: recipients.length,
      active: recipients.filter((r) => r.enabled && r.status === "active").length,
      disabled: recipients.filter((r) => !r.enabled && r.status !== "bounced").length,
      bounced: recipients.filter((r) => r.status === "bounced").length,
    },
  };
}

export type WarmupImportReport = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  failed: number;
};

/** Parses a pasted CSV/list of recipients: `email[,name[,provider]]` per line. */
export function parseRecipientList(raw: string): {
  rows: Array<{ email: string; name: string | null; provider: string | null }>;
  total: number;
  invalid: number;
  duplicates: number;
} {
  const out = new Map<string, { email: string; name: string | null; provider: string | null }>();
  let total = 0;
  let invalid = 0;
  let duplicates = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    total += 1;
    const parts = trimmed.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
    const email = (parts.find((p) => EMAIL_RE.test(p)) ?? "").toLowerCase();
    if (!email) {
      // header rows count as neither valid nor invalid
      if (!/^\s*e-?mail/i.test(trimmed)) invalid += 1;
      continue;
    }
    if (out.has(email)) {
      duplicates += 1;
      continue;
    }
    const rest = parts.filter((p) => p.toLowerCase() !== email);
    out.set(email, { email, name: rest[0] || null, provider: rest[1] || null });
  }
  return { rows: Array.from(out.values()), total, invalid, duplicates };
}

/**
 * Bulk import into the GLOBAL warmup pool.
 *
 * Emails are normalized (trim + lowercase) and deduplicated in-file and against
 * the existing pool before insert, so re-uploading the same CSV never creates
 * duplicates. Uniqueness is enforced globally by the `lower(email)` unique
 * index — the pool is platform infrastructure, never workspace-scoped.
 */
export async function importWarmupRecipients(
  raw: string,
  userId: string,
): Promise<WarmupImportReport> {
  const parsed = parseRecipientList(raw);
  const report: WarmupImportReport = {
    total: parsed.total,
    imported: 0,
    duplicates: parsed.duplicates,
    invalid: parsed.invalid,
    failed: 0,
  };
  if (parsed.rows.length === 0) return report;

  const CHUNK = 500;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK);
    const emails = chunk.map((r) => r.email);

    const { data: existing, error: existErr } = await supabaseAdmin
      .from("warmup_recipients")
      .select("email")
      .in("email", emails);
    if (existErr) throw new Error(existErr.message);
    const known = new Set(
      ((existing ?? []) as Array<Record<string, unknown>>).map((r) =>
        String(r["email"]).toLowerCase(),
      ),
    );

    const fresh = chunk.filter((r) => !known.has(r.email));
    report.duplicates += chunk.length - fresh.length;
    if (fresh.length === 0) continue;

    const payload = fresh.map((r) => ({
      email: r.email,
      name: r.name,
      mailbox_provider: r.provider,
      created_by: userId,
    }));

    const { data, error } = await supabaseAdmin
      .from("warmup_recipients")
      .insert(payload as never)
      .select("id");

    if (!error) {
      report.imported += (data ?? []).length;
      continue;
    }

    // Fall back to row-by-row so one bad address can't fail the whole batch.
    for (const row of payload) {
      const { error: rowErr } = await supabaseAdmin
        .from("warmup_recipients")
        .insert(row as never);
      if (!rowErr) report.imported += 1;
      else if (rowErr.code === "23505") report.duplicates += 1;
      else report.failed += 1;
    }
  }

  return report;
}


export async function addWarmupRecipient(input: {
  email: string;
  name?: string | null | undefined;
  provider?: string | null | undefined;
  notes?: string | null | undefined;
  userId: string;
}): Promise<WarmupPoolRecipient> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
  const { data, error } = await supabaseAdmin
    .from("warmup_recipients")
    .insert({
      email,
      name: input.name ?? null,
      mailbox_provider: input.provider ?? null,
      notes: input.notes ?? null,
      created_by: input.userId,
    } as never)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That recipient is already in the pool.");
    throw new Error(error.message);
  }
  return map(data as Record<string, unknown>);
}

export async function setWarmupRecipientEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("warmup_recipients")
    .update({ enabled, status: enabled ? "active" : "disabled", last_error: null } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeWarmupRecipient(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("warmup_recipients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Real per-message history for one pool recipient. */
export async function warmupRecipientHistory(id: string): Promise<WarmupPoolHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("warmup_jobs")
    .select("id, created_at, processed_at, from_email, status, placement, provider, provider_message_id, error")
    .eq("pool_recipient_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row["id"] as string,
    createdAt: row["created_at"] as string,
    sentAt: (row["processed_at"] as string | null) ?? null,
    fromEmail: (row["from_email"] as string) ?? "",
    status: (row["status"] as string) ?? "queued",
    placement: (row["placement"] as string | null) ?? null,
    provider: (row["provider"] as string | null) ?? null,
    providerMessageId: (row["provider_message_id"] as string | null) ?? null,
    error: (row["error"] as string | null) ?? null,
  }));
}

/**
 * Bulk enable / disable / remove for the admin warmup recipient pool.
 * Warmup-only: campaign leads and customer mailboxes are never touched here.
 */
export async function bulkWarmupRecipients(
  ids: string[],
  action: "enable" | "disable" | "remove",
): Promise<{ affected: number }> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return { affected: 0 };

  // PostgREST puts `in.(...)` filters in the URL, so a single call with
  // thousands of UUIDs exceeds the request-line limit and comes back as a bare
  // "Bad Request". Chunking keeps every request well inside that limit.
  const CHUNK = 100;
  const enabled = action === "enable";
  let affected = 0;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { error } =
      action === "remove"
        ? await supabaseAdmin.from("warmup_recipients").delete().in("id", chunk)
        : await supabaseAdmin
            .from("warmup_recipients")
            .update({
              enabled,
              status: enabled ? "active" : "disabled",
              last_error: null,
            } as never)
            .in("id", chunk);
    if (error) throw new Error(error.message);
    affected += chunk.length;
  }

  return { affected };
}

