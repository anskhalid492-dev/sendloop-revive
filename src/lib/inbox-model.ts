/**
 * Unified Inbox shared model.
 *
 * Pure data + helpers so both the browser UI and the server ingestion code
 * agree on statuses, folders and how an email thread is identified.
 */

export const CONVERSATION_STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "interested", label: "Interested" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "meeting_completed", label: "Meeting completed" },
  { value: "won", label: "Won" },
  { value: "not_interested", label: "Not interested" },
  { value: "ooo", label: "Out of office" },
  { value: "unsubscribed", label: "Unsubscribe" },
  { value: "bounced", label: "Bounced" },
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]["value"];

export const CONVERSATION_STATUS_VALUES = CONVERSATION_STATUSES.map((s) => s.value) as [
  ConversationStatus,
  ...ConversationStatus[],
];

export const CONVERSATION_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  CONVERSATION_STATUSES.map((s) => [s.value, s.label]),
);

export const CONVERSATION_STATUS_STYLES: Record<string, string> = {
  lead: "bg-muted text-muted-foreground",
  interested: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  meeting_booked: "bg-primary/15 text-primary",
  meeting_completed: "bg-primary/20 text-primary",
  won: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  not_interested: "bg-muted text-muted-foreground",
  ooo: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  unsubscribed: "bg-destructive/10 text-destructive",
  bounced: "bg-destructive/10 text-destructive",
};

/** Left-hand navigation of the inbox. */
export const INBOX_FOLDERS = [
  { id: "inbox", label: "Inbox" },
  { id: "unread", label: "Unread" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  { id: "interested", label: "Interested" },
  { id: "meeting_booked", label: "Meeting booked" },
  { id: "meeting_completed", label: "Meeting completed" },
  { id: "won", label: "Won" },
  { id: "not_interested", label: "Not interested" },
  { id: "ooo", label: "OOO" },
  { id: "unsubscribed", label: "Unsubscribe" },
  { id: "bounced", label: "Bounced" },
  { id: "archived", label: "Archived" },
  { id: "snoozed", label: "Snoozed" },
  { id: "assigned_to_me", label: "Assigned to me" },
  { id: "all", label: "All conversations" },
] as const;

export type InboxFolder = (typeof INBOX_FOLDERS)[number]["id"];

export const INBOX_FOLDER_IDS = INBOX_FOLDERS.map((f) => f.id) as [InboxFolder, ...InboxFolder[]];

export type ConversationRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  sending_account_id: string | null;
  subject: string;
  prospect_email: string;
  status: string;
  assigned_to: string | null;
  tags: string[];
  unread: boolean;
  archived: boolean;
  snoozed_until: string | null;
  message_count: number;
  last_message_at: string;
  last_direction: string;
  last_preview: string | null;
};

export type ConversationListItem = ConversationRow & {
  lead_name: string | null;
  lead_company: string | null;
  campaign_name: string | null;
  sending_account_email: string | null;
  assignee_name: string | null;
};

export type ConversationMessage = {
  id: string;
  direction: "outbound" | "inbound";
  from_email: string;
  from_name: string | null;
  to_email: string;
  cc_emails: string[];
  subject: string;
  body: string;
  html: string | null;
  attachments: { name: string; url?: string | undefined; size?: number | undefined }[];
  opened_at: string | null;
  clicked_at: string | null;
  occurred_at: string;
  provider_message_id: string | null;
};

export type ConversationNote = {
  id: string;
  body: string;
  author_id: string;
  author_name: string | null;
  mentions: string[];
  created_at: string;
  updated_at: string;
};

/** Strip Re:/Fwd: prefixes and collapse whitespace so replies match their thread. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/^(\s*(re|fw|fwd|aw|sv|antwoord)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** One conversation per prospect per campaign; standalone threads fall back to the email. */
export function buildThreadKey(input: {
  campaignId?: string | null;
  prospectEmail: string;
  subject?: string | null;
}): string {
  const email = input.prospectEmail.trim().toLowerCase();
  if (input.campaignId) return `campaign:${input.campaignId}:${email}`;
  const subject = normalizeSubject(input.subject);
  return subject ? `direct:${email}:${subject}` : `direct:${email}`;
}

export function stripAngle(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  const match = /<([^>]+)>/.exec(trimmed);
  return (match?.[1] ?? trimmed).trim() || null;
}

export function previewOf(body: string | null | undefined, max = 180): string {
  return (body ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const OOO_PATTERNS = [
  /out of (the )?office/i,
  /automatic reply/i,
  /auto[- ]?reply/i,
  /on (annual|parental|vacation) leave/i,
  /away from my desk/i,
];
const BOUNCE_PATTERNS = [
  /mail delivery (failed|subsystem)/i,
  /undeliverable/i,
  /delivery status notification \(failure\)/i,
  /address not found/i,
  /recipient rejected/i,
];
const UNSUB_PATTERNS = [/unsubscribe/i, /remove me from your list/i, /stop emailing/i, /take me off/i];
const NEGATIVE_PATTERNS = [/not interested/i, /no thanks/i, /we're all set/i, /do not contact/i];
const POSITIVE_PATTERNS = [
  /interested/i,
  /sounds good/i,
  /let's (talk|chat|connect)/i,
  /book a (call|time|meeting)/i,
  /happy to (chat|talk)/i,
];

/** Best-effort classification of an inbound reply; never blocks ingestion. */
export function classifyInbound(subject: string, body: string): ConversationStatus | null {
  const text = `${subject}\n${body}`.slice(0, 4000);
  if (BOUNCE_PATTERNS.some((p) => p.test(text))) return "bounced";
  if (OOO_PATTERNS.some((p) => p.test(text))) return "ooo";
  if (UNSUB_PATTERNS.some((p) => p.test(text))) return "unsubscribed";
  if (NEGATIVE_PATTERNS.some((p) => p.test(text))) return "not_interested";
  if (POSITIVE_PATTERNS.some((p) => p.test(text))) return "interested";
  return null;
}

export function initialsOf(name: string | null, email: string): string {
  const source = (name ?? "").trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function displayName(
  lead: { first_name?: string | null; last_name?: string | null } | null,
  email: string,
): string {
  const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim();
  return name || email;
}
