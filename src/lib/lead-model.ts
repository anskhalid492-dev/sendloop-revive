export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "meeting", label: "Meeting" },
  { value: "bounced", label: "Bounced" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];

export const LEAD_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, s.label]),
);

/** Tailwind classes per status, built on semantic tokens only. */
export const LEAD_STATUS_STYLES: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  contacted: "bg-primary/10 text-primary",
  replied: "bg-primary/15 text-primary",
  interested: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  not_interested: "bg-muted text-muted-foreground",
  meeting: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  bounced: "bg-destructive/10 text-destructive",
  unsubscribed: "bg-destructive/10 text-destructive",
  completed: "bg-primary/10 text-primary",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export const CRM_STAGES = [
  { value: "none", label: "No stage" },
  { value: "prospect", label: "Prospect" },
  { value: "engaged", label: "Engaged" },
  { value: "qualified", label: "Qualified" },
  { value: "opportunity", label: "Opportunity" },
  { value: "customer", label: "Customer" },
  { value: "lost", label: "Lost" },
] as const;

export const LEAD_FIELDS = [
  { id: "email", label: "Email", required: true },
  { id: "first_name", label: "First name", required: false },
  { id: "last_name", label: "Last name", required: false },
  { id: "company", label: "Company", required: false },
  { id: "job_title", label: "Job title", required: false },
  { id: "phone", label: "Phone", required: false },
  { id: "website", label: "Website", required: false },
  { id: "city", label: "City", required: false },
  { id: "state", label: "State / region", required: false },
  { id: "country", label: "Country", required: false },
  { id: "linkedin_url", label: "LinkedIn URL", required: false },
] as const;

export const LEAD_COLUMNS = [
  { id: "name", label: "Name", width: 190 },
  { id: "email", label: "Email", width: 240 },
  { id: "company", label: "Company", width: 180 },
  { id: "job_title", label: "Job title", width: 170 },
  { id: "phone", label: "Phone", width: 150 },
  { id: "location", label: "Location", width: 170 },
  { id: "website", label: "Website", width: 180 },
  { id: "linkedin_url", label: "LinkedIn", width: 200 },
  { id: "status", label: "Status", width: 140 },
  { id: "tags", label: "Tags", width: 180 },
  { id: "campaign", label: "Campaign", width: 180 },
  { id: "last_activity_at", label: "Last activity", width: 150 },
  { id: "created_at", label: "Created", width: 130 },
] as const;

export type LeadColumnId = (typeof LEAD_COLUMNS)[number]["id"];

export type LeadRow = {
  id: string;
  list_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  crm_stage: string;
  tags: string[];
  custom_fields: Record<string, string>;
  last_activity_at: string | null;
  created_at: string;
  campaignNames?: string[];
};

export type LeadFilters = {
  search?: string | undefined;
  listId?: string | undefined;
  name?: string | undefined;
  email?: string | undefined;
  company?: string | undefined;
  jobTitle?: string | undefined;
  location?: string | undefined;
  statuses?: string[] | undefined;
  campaignId?: string | undefined;
  tags?: string[] | undefined;
  createdFrom?: string | undefined;
  createdTo?: string | undefined;
  customKey?: string | undefined;
  customValue?: string | undefined;
};


export const EMPTY_FILTERS: LeadFilters = {};

export function activeFilterCount(f: LeadFilters): number {
  let n = 0;
  if (f.name) n++;
  if (f.email) n++;
  if (f.company) n++;
  if (f.jobTitle) n++;
  if (f.location) n++;
  if (f.statuses?.length) n++;
  if (f.campaignId) n++;
  if (f.tags?.length) n++;
  if (f.createdFrom) n++;
  if (f.createdTo) n++;
  if (f.customKey && f.customValue) n++;
  return n;
}

export function leadName(lead: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
}

export function leadLocation(lead: {
  city: string | null;
  state: string | null;
  country: string | null;
}): string {
  return [lead.city, lead.state, lead.country].filter(Boolean).join(", ");
}
