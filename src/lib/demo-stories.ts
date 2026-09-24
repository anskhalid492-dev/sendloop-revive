/**
 * Customer stories for /customer-reviews.
 *
 * Every entry with `demo: true` is illustrative placeholder content and is
 * visibly labeled on the page. Replace one entry at a time with a verified
 * customer story (set `demo: false`) — the layout does not change.
 */
export type Story = {
  id: string;
  demo: boolean;
  quote: string;
  headline: string;
  name: string;
  role: string;
  company: string;
  avatarSeed: string;
  avatarUrl?: string;
  feature: string;
  featureText: string;
  bullets: string[];
};

export const STORIES: Story[] = [
  {
    id: "workflow",
    demo: true,
    headline: "One workflow instead of five tools.",
    quote:
      "We replaced several disconnected outreach tools with one workflow and finally had a clearer view of our campaigns.",
    name: "Demo Profile",
    role: "Sales Lead",
    company: "Illustrative company",
    avatarSeed: "demo-sales-lead",
    feature: "Campaigns & Sequences",
    featureText:
      "Multi-step sequences with delays, sending windows, sending days and daily limits, all paused or resumed from one place.",
    bullets: ["Multi-step sequences", "Sending windows & days", "Pause and resume anytime"],
  },
  {
    id: "ai",
    demo: true,
    headline: "Personal at a scale we couldn't write by hand.",
    quote:
      "AI drafts give every first line a real reason to exist. Our team edits instead of starting from a blank page.",
    name: "Demo Profile",
    role: "Growth Marketer",
    company: "Illustrative agency",
    avatarSeed: "demo-growth-marketer",
    feature: "AI Personalization",
    featureText:
      "Lead variables and AI-written drafts help each message reference the prospect's company and role.",
    bullets: ["Lead variables", "AI campaign writer", "Edit before anything sends"],
  },
  {
    id: "inbox",
    demo: true,
    headline: "Replies stopped slipping through the cracks.",
    quote:
      "Every reply from every mailbox lands in one inbox, already sorted. Nobody asks 'did someone answer this?' anymore.",
    name: "Demo Profile",
    role: "SDR Manager",
    company: "Illustrative SaaS team",
    avatarSeed: "demo-sdr-manager",
    feature: "Unified Inbox",
    featureText:
      "Conversations across connected mailboxes with reply classification, assignments, internal notes and CRM context.",
    bullets: ["Reply classification", "Assignments & notes", "AI Reply drafts"],
  },
  {
    id: "followups",
    demo: true,
    headline: "Follow-ups that know when to stop.",
    quote:
      "Follow-ups run on their own and stop the moment someone replies. That alone saved us from a lot of awkward emails.",
    name: "Demo Profile",
    role: "Founder",
    company: "Illustrative consultancy",
    avatarSeed: "demo-founder",
    feature: "Follow-ups",
    featureText: "Multi-step follow-ups with delays and reply-aware stop conditions.",
    bullets: ["Automatic delays", "Stops on reply", "Per-step content"],
  },
  {
    id: "crm",
    demo: true,
    headline: "From first reply to closed deal in one place.",
    quote:
      "Positive replies move straight into our pipeline, so the handoff from outreach to sales finally makes sense.",
    name: "Demo Profile",
    role: "Head of Recruiting",
    company: "Illustrative recruiting firm",
    avatarSeed: "demo-recruiting",
    feature: "Built-in CRM",
    featureText: "Contacts, pipeline stages, tasks and full conversation history connected to your campaigns.",
    bullets: ["Pipeline stages", "Tasks", "Conversation history"],
  },
  {
    id: "warmup",
    demo: true,
    headline: "We watch mailbox health instead of guessing.",
    quote:
      "Warmup and health warnings tell us when a mailbox needs a break before it becomes a problem.",
    name: "Demo Profile",
    role: "Operations Manager",
    company: "Illustrative B2B services company",
    avatarSeed: "demo-ops",
    feature: "Warmup & Health",
    featureText: "Mailbox warmup, health monitoring and deliverability warnings for connected mailboxes.",
    bullets: ["Mailbox warmup", "Health monitoring", "Deliverability warnings"],
  },
];

export const SHORT_QUOTES: { id: string; demo: boolean; quote: string; role: string }[] = [
  { id: "q1", demo: true, quote: "Setup took an afternoon, not a week.", role: "Demo Profile — Account Executive" },
  { id: "q2", demo: true, quote: "CSV import with field mapping just works.", role: "Demo Profile — Marketing Ops" },
  { id: "q3", demo: true, quote: "Analytics show exactly which step gets replies.", role: "Demo Profile — Sales Lead" },
  { id: "q4", demo: true, quote: "Our whole team works from one workspace now.", role: "Demo Profile — Agency Owner" },
];

/** Illustrative figures only — not MunchReach platform totals. */
export const DEMO_METRICS = [
  { value: "1,240", label: "Campaigns managed" },
  { value: "2.8M", label: "Emails sent" },
  { value: "6.4%", label: "Reply rate" },
  { value: "930", label: "Meetings booked" },
];
