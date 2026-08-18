/** Client-safe CRM types and presentation helpers. */

export type CrmStage = {
  id: string;
  key: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type CrmContact = {
  id: string;
  stage_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  status: string;
  tags: string[];
  owner_id: string | null;
  lead_source: string | null;
  deal_value: number | null;
  last_activity_at: string | null;
  created_at: string;
  /** Derived, never invented: counts come from real rows. */
  openTasks: number;
  nextTaskAt: string | null;
  lastReplyAt: string | null;
  unreadReplies: number;
};

export type CrmActivity = {
  id: string;
  kind: "activity" | "note" | "task" | "message";
  type: string;
  detail: string;
  at: string;
  campaignId?: string | null;
  conversationId?: string | null;
};

export type CrmConversationLink = {
  id: string;
  subject: string;
  status: string;
  unread: boolean;
  last_message_at: string;
  last_preview: string | null;
  last_direction: string;
  message_count: number;
  campaign_name: string | null;
  mailbox: string | null;
};

export type CrmCampaignLink = {
  campaign_id: string;
  campaign_name: string;
  status: string;
  current_step: number | null;
  sent: number;
  replies: number;
  last_email_at: string | null;
  next_email_at: string | null;
};

/** Stage colors, expressed with tokens so both themes stay correct. */
export const STAGE_COLORS = [
  { id: "slate", label: "Slate", dot: "bg-muted-foreground", soft: "bg-muted" },
  { id: "blue", label: "Blue", dot: "bg-primary", soft: "bg-primary/10" },
  { id: "violet", label: "Violet", dot: "bg-violet-500", soft: "bg-violet-500/10" },
  { id: "amber", label: "Amber", dot: "bg-amber-500", soft: "bg-amber-500/10" },
  { id: "emerald", label: "Emerald", dot: "bg-emerald-500", soft: "bg-emerald-500/10" },
  { id: "rose", label: "Rose", dot: "bg-rose-500", soft: "bg-rose-500/10" },
] as const;

export function stageColor(id: string) {
  return STAGE_COLORS.find((c) => c.id === id) ?? STAGE_COLORS[0];
}

export function contactName(contact: {
  first_name: string | null;
  last_name: string | null;
  email: string;
}) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email;
}
