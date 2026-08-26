import { classifyEvent, externalIdOf, normalizeInbound } from "../src/lib/inbound-parse";
import { resendInboundEvent } from "../src/lib/email-providers/resend-inbound";

const url = "https://rihgzkofoxcjljlbvbya.supabase.co";
const key = process.env["SB_SERVICE_ROLE_KEY"]!;
const res = await fetch(
  `${url}/rest/v1/email_events?select=id,provider,kind,external_id,payload,from_email,to_email&kind=eq.inbound&order=created_at.desc&limit=1`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
const rows = (await res.json()) as any[];
const row = rows[0];
if (!row) { console.log("no inbound events"); process.exit(0); }
const raw = row.payload as Record<string, unknown>;
const kind = classifyEvent(raw);
const legacy = normalizeInbound(raw);
const next = resendInboundEvent(raw);
console.log(JSON.stringify({
  eventRowId: row.id, provider: row.provider, kind, storedExternalId: row.external_id,
  legacy: {
    externalId: externalIdOf(raw, kind), from: legacy?.["from"], to: legacy?.["to"],
    subject: legacy?.["subject"], messageId: legacy?.["messageId"],
    inReplyTo: legacy?.["inReplyTo"], references: legacy?.["references"],
  },
  next: next && {
    providerEventId: next.providerEventId, providerMessageId: next.providerMessageId,
    from: next.from, to: next.to, subject: next.subject, messageId: next.messageId,
    inReplyTo: next.inReplyTo, references: next.references, receivedAt: next.receivedAt,
  },
}, null, 2));
