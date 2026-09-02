/**
 * The exact email that left the platform for one specific recipient.
 *
 * Campaign copy is personalized per lead (merge variables, AI first lines,
 * spintax, unsubscribe links). Once an email is delivered, that rendered copy
 * is history: it must never be re-derived from the campaign template, because
 * the lead's data — and the template itself — can change afterwards.
 *
 * These helpers are pure so both the sender and the inbox agree on what the
 * stored "final sent email" is.
 */

export type SentSnapshot = {
  final_subject: string;
  final_body: string;
  final_html: string | null;
  final_from_email: string;
  final_from_name: string | null;
  final_to_email: string;
  rendered_at: string;
};

export function buildSentSnapshot(input: {
  subject: string | null | undefined;
  body: string | null | undefined;
  html?: string | null;
  fromEmail: string;
  fromName?: string | null;
  toEmail: string;
  renderedAt?: string;
}): SentSnapshot {
  return {
    final_subject: input.subject ?? "",
    final_body: input.body ?? "",
    final_html: input.html ?? null,
    final_from_email: input.fromEmail,
    final_from_name: input.fromName ?? null,
    final_to_email: input.toEmail,
    rendered_at: input.renderedAt ?? new Date().toISOString(),
  };
}

export type StoredSentRow = {
  final_subject?: string | null;
  final_body?: string | null;
  final_html?: string | null;
  final_from_email?: string | null;
  final_from_name?: string | null;
  final_to_email?: string | null;
  subject?: string | null;
  body?: string | null;
  to_email?: string | null;
};

export type SentCopy = {
  subject: string;
  body: string;
  html: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  /** true when the stored final render was used, false for the legacy fallback. */
  exact: boolean;
};

/**
 * Source of truth for "what did this prospect actually receive".
 * Prefers the stored final render; older rows fall back to the per-recipient
 * queue copy. Never touches the campaign step template.
 */
export function sentCopyOf(row: StoredSentRow | null | undefined): SentCopy {
  const finalBody = row?.final_body ?? null;
  const exact = typeof finalBody === "string" && finalBody.length > 0;
  return {
    subject: (exact ? row?.final_subject : null) ?? row?.subject ?? "",
    body: (exact ? finalBody : null) ?? row?.body ?? "",
    html: exact ? (row?.final_html ?? null) : null,
    fromEmail: row?.final_from_email ?? null,
    fromName: row?.final_from_name ?? null,
    toEmail: row?.final_to_email ?? row?.to_email ?? null,
    exact,
  };
}
