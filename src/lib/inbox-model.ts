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
  sendingAccountId?: string | null;
  prospectEmail: string;
  subject?: string | null;
}): string {
  const email = input.prospectEmail.trim().toLowerCase();
  if (input.campaignId) return `campaign:${input.campaignId}:${email}`;
  const account = input.sendingAccountId?.trim();
  const subject = normalizeSubject(input.subject);
  if (account) return subject ? `direct:${account}:${email}:${subject}` : `direct:${account}:${email}`;
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
  /automatic(ally)? (reply|response|generated)/i,
  /auto[- ]?(reply|response|responder)/i,
  /this is an automated/i,
  /on (annual|parental|vacation|sick|maternity|paternity) leave/i,
  /away from (my|the) (desk|email|inbox|computer|office)/i,
  /(currently|presently) (away|travell?ing|unavailable|on holiday|on vacation|out of)/i,
  /(i am|i'm) (away|travell?ing|on (holiday|vacation|leave)|out (of|until))/i,
  /(will|shall) (respond|reply|get back to you) (to you )?(as soon as|when i|upon my return)/i,
  /limited access to (my )?email/i,
  /(back|return(ing)?) (to the office|on) /i,
  /thank you for your (email|message)[.,!]? i (am|'m) /i,
];
const BOUNCE_PATTERNS = [
  /mail delivery (failed|subsystem)/i,
  /undeliverable/i,
  /delivery status notification \(failure\)/i,
  /address not found/i,
  /recipient rejected/i,
  /message could not be delivered/i,
  /no longer with (the|our) (company|organi[sz]ation)/i,
];
const UNSUB_PATTERNS = [
  // Deliberately NOT a bare /unsubscribe/i: our own campaign footer contains
  // that word, and quoted replies would otherwise look like opt-outs.
  /^\s*unsubscribe\s*[.!]?\s*$/im,
  /(please |kindly )?unsubscribe (me|us)\b/i,
  /\b(i|we) (want|wish|would like) to unsubscribe\b/i,
  /remove me (from|off)/i,
  /(please )?remove (me|my (email|address|details))\b/i,
  /take me off/i,
  /stop (emailing|contacting|messaging|sending)/i,
  /opt[- ]?(me )?out/i,
  /(do not|don'?t) (email|contact|message) me (again|any ?more)/i,
  /delete my (data|details|information)/i,
];
const NEGATIVE_PATTERNS = [
  /not interested/i,
  /no,? thank/i,
  /no thanks/i,
  /we'?re (all set|good|happy with)/i,
  /(do|does) not (need|require)/i,
  /(don'?t|do not) (need|want)/i,
  /not (a|the) right (fit|time)/i,
  /not looking/i,
  /no need/i,
  /wrong person/i,
  /pass (on this|for now)/i,
  /(no|zero) (interest|budget)/i,
  /already (have|using|work with)/i,
];
const POSITIVE_PATTERNS = [
  /\binterested\b/i,
  /sounds (good|great|interesting|promising)/i,
  /let'?s (talk|chat|connect|schedule|set ?up|do it|discuss)/i,
  /(book|schedule|set ?up) a (call|time|meeting|demo|chat)/i,
  /happy to (chat|talk|connect|learn more)/i,
  /(send|share) (me )?(more|the|some) ?(info|information|details|deck|pricing|numbers)?/i,
  /tell me more/i,
  /(know|learn|hear) more/i,
  /can we (discuss|chat|talk|connect|meet|jump on)/i,
  /(i'?m|i am) (available|free|open|keen|in)\b/i,
  /would love to (chat|talk|connect|learn)/i,
  /works for me/i,
  /count me in/i,
  /^\s*(yes|sure|ok(ay)?)\b/i,
  /\b(yes|sure),? (please|send|i'?d|we'?d|let'?s)/i,
];

/** Header hints that prove a message was generated by a machine. */
export function isAutoReplyHeaders(headers?: Record<string, string> | null): boolean {
  if (!headers) return false;
  const get = (key: string) => {
    const found = Object.entries(headers).find(([k]) => k.toLowerCase() === key);
    return (found?.[1] ?? "").toLowerCase();
  };
  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (get("x-autoreply") || get("x-auto-response-suppress") || get("x-autorespond")) return true;
  if (["auto_reply", "auto-reply", "vacation", "bulk"].includes(get("precedence"))) return true;
  return false;
}

/**
 * Best-effort classification of an inbound reply; never blocks ingestion.
 *
 * Order matters: a bounce is not a reply, an away message is never positive
 * interest, and an opt-out outranks any friendly wording around it.
 */
const QUOTE_START_PATTERNS = [
  /^\s*>/m,
  /^\s*on .{0,200}\bwrote:\s*$/im,
  /^\s*-{2,}\s*original message\s*-{2,}\s*$/im,
  /^\s*_{5,}\s*$/m,
  /^\s*from:\s.+$/im,
  /^\s*sent from my /im,
];

/**
 * Keep only what the human actually typed: everything from the first quoted
 * block onwards is our own campaign email (footer and unsubscribe link
 * included) and must never drive classification.
 */
export function stripQuotedReply(body: string): string {
  let cut = body.length;
  for (const pattern of QUOTE_START_PATTERNS) {
    const match = pattern.exec(body);
    if (match && match.index < cut) cut = match.index;
  }
  const own = body.slice(0, cut);
  return own
    .split("\n")
    .filter((line) => !/unsubscribe/i.test(line) || !/https?:\/\//i.test(line))
    .join("\n")
    .trim();
}

export function classifyInbound(
  subject: string,
  body: string,
  headers?: Record<string, string> | null,
): ConversationStatus | null {
  const own = stripQuotedReply(body);
  const text = `${subject}\n${own || body}`.slice(0, 4000);
  if (BOUNCE_PATTERNS.some((p) => p.test(text))) return "bounced";
  if (UNSUB_PATTERNS.some((p) => p.test(text))) return "unsubscribed";
  if (isAutoReplyHeaders(headers)) return "ooo";
  if (OOO_PATTERNS.some((p) => p.test(text))) return "ooo";
  if (NEGATIVE_PATTERNS.some((p) => p.test(text))) return "not_interested";
  if (POSITIVE_PATTERNS.some((p) => p.test(text))) return "interested";
  return null;
}

export type ReplySentiment = "positive" | "negative" | "out_of_office" | "neutral";

/** Sentiment stored on the campaign reply log for a detected status. */
export function replySentimentFor(detected: ConversationStatus | null): ReplySentiment {
  if (detected === "interested") return "positive";
  if (detected === "not_interested" || detected === "unsubscribed") return "negative";
  if (detected === "ooo") return "out_of_office";
  return "neutral";
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
