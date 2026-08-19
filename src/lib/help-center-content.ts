/**
 * Help Center content. Every article below is written from Sendloop's actual
 * feature set and the answers previously published on the Help Center page —
 * nothing here is placeholder copy.
 */

export type HelpCategory = {
  slug: string;
  name: string;
  description: string;
};

export type HelpArticle = {
  slug: string;
  title: string;
  description: string;
  category: string; // category slug
  updated: string; // ISO date
  popular?: boolean;
  gettingStarted?: boolean;
  /** Markdown-lite: "## Heading" lines plus paragraphs. */
  content: string;
};

export const HELP_CATEGORIES: HelpCategory[] = [
  { slug: "getting-started", name: "Getting Started", description: "Set up your workspace, connect a mailbox and launch a first campaign." },
  { slug: "campaigns", name: "Campaigns", description: "Sequences, schedules, variables, stop rules and launch readiness." },
  { slug: "email-accounts", name: "Email Accounts", description: "Connecting mailboxes, domains, DNS verification and account health." },
  { slug: "deliverability", name: "Sending & Deliverability", description: "Authentication, spam placement, bounces and sending limits." },
  { slug: "unified-inbox", name: "Unified Inbox", description: "Replies, threading, sending from the inbox and inbound processing." },
  { slug: "warmup", name: "Warmup", description: "How warmup ramps a mailbox and what the statuses mean." },
  { slug: "crm", name: "CRM", description: "Contacts, pipeline stages, activity timeline, tasks and notes." },
  { slug: "analytics", name: "Analytics", description: "Campaign metrics, the conversion funnel and drill-downs." },
  { slug: "integrations", name: "Integrations", description: "Slack, Zapier, Make, HubSpot, GoHighLevel, Calendly, Google Sheets and OpenAI." },
  { slug: "billing", name: "Billing", description: "Plans, seats, invoices, upgrades, downgrades and refunds." },
  { slug: "account", name: "Account & Workspace", description: "Profile, theme, roles, invitations, ownership and data export." },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "quick-start",
    title: "Quick start: from signup to your first campaign",
    description: "The shortest path through workspace setup, mailbox connection and your first sequence.",
    category: "getting-started",
    updated: "2026-08-12",
    popular: true,
    gettingStarted: true,
    content: `Sendloop is organised around a workspace. Everything — mailboxes, leads, campaigns, replies and billing — belongs to a workspace, and teammates get access by role.

## 1. Create your workspace
After signing up you land in onboarding, where you name your workspace. You can create more workspaces later and switch between them from the switcher in the sidebar.

## 2. Add and verify a sending domain
Sendloop sends on managed infrastructure, so a domain has to pass DNS verification before any mailbox on it can go active. Add the domain under Email Accounts, publish the records shown, then run the verification check.

## 3. Connect a mailbox
Once the domain is verified, connect a mailbox on that domain. The connection test runs immediately and the result is recorded on the mailbox timeline.

## 4. Import leads
Import a CSV under Leads. The import summary reports every skipped row and the reason: invalid address, duplicate inside the file, or an address that already exists in the workspace.

## 5. Build and launch
Create a campaign, write the first email plus follow-ups, attach a lead list and pick a schedule. The launch readiness bar tells you exactly what is still missing — an unverified mailbox, an empty list or an unresolved variable — before the campaign can start.`,
  },
  {
    slug: "connect-a-mailbox",
    title: "Connecting a mailbox and reading the connection test",
    description: "What the connection test checks and what to do when it fails.",
    category: "email-accounts",
    updated: "2026-08-14",
    gettingStarted: true,
    content: `Every mailbox you connect is tested straight away, and each attempt is written to the mailbox timeline so you can see when a connection started failing.

## Common SMTP settings
Port 587 with STARTTLS is the most common configuration. Use an app password rather than the account password — most providers reject the account password for third-party SMTP outright.

## When the test fails
Check the host and port first, then confirm the mailbox is allowed to use third-party SMTP at all; several providers disable it by default for new accounts.

## Domain verification comes first
A mailbox cannot become active until its sending domain is verified. If the mailbox stays in a pending state after a successful connection test, the domain is the blocker, not the credentials.`,
  },
  {
    slug: "smtp-550-5-7-1",
    title: 'Fixing a "550 5.7.1" SMTP error',
    description: "This response almost always points at missing SPF or DKIM alignment.",
    category: "email-accounts",
    updated: "2026-08-09",
    popular: true,
    content: `A 550 5.7.1 rejection means the receiving server refused the message for policy reasons. In cold email the cause is nearly always authentication.

## Work through the DNS checklist
Confirm the SPF record exists and includes the sending infrastructure, that the DKIM key is published and verifies for the sending domain, and that DMARC is published.

## Re-run verification after changes
DNS changes propagate within hours. Re-run the domain verification in Sendloop afterwards so the mailbox can return to an active state.`,
  },
  {
    slug: "why-import-skipped-rows",
    title: "Why did my import skip rows?",
    description: "Every skipped row is reported with a reason and a count in the import summary.",
    category: "getting-started",
    updated: "2026-08-05",
    popular: true,
    content: `Rows are skipped for three reasons only.

## Invalid email
The address failed validation and would bounce, which hurts domain reputation.

## Duplicate inside the file
The same address appeared more than once in the upload; only the first occurrence is kept.

## Already in the workspace
Leads are unique per workspace and email, so an existing lead is not duplicated. The import summary lists each reason with counts so you can reconcile the file.`,
  },
  {
    slug: "stop-rules",
    title: "Understanding stop rules in a sequence",
    description: "Sequences stop automatically on reply, bounce or unsubscribe.",
    category: "campaigns",
    updated: "2026-08-16",
    popular: true,
    content: `A sequence exists to start a conversation, so it ends the moment one starts.

## Default behaviour
A lead is removed from the remaining steps on reply, on a hard bounce, and on unsubscribe. No further email in that sequence is queued for them.

## Per-step exceptions
Exceptions are configured per step in the sequence editor, so you can keep a specific step running where it makes sense for your process.`,
  },
  {
    slug: "variables-and-fallbacks",
    title: "Using variables and fallbacks in campaign copy",
    description: "How variables resolve, what happens when data is missing, and the unresolved variable report.",
    category: "campaigns",
    updated: "2026-08-18",
    content: `Variables pull values from the lead record. A variable only resolves if the matching field exists on that lead.

## Fallbacks
Write a fallback so a missing field never breaks a sentence. Without one, an empty field produces an awkward gap in the copy.

## The unresolved variable report
The campaign preview lists every variable that will not resolve for the sampled leads, so you can fix the data or the copy before launching rather than after.

## Test sends
A test send goes out through the same managed infrastructure as production, and the preview reports the real result: accepted by the provider, then delivered or bounced once webhooks come back.`,
  },
  {
    slug: "launch-readiness",
    title: "What the launch readiness bar checks",
    description: "The list of conditions a campaign must satisfy before it can send.",
    category: "campaigns",
    updated: "2026-08-15",
    content: `Launch readiness recomputes every time the campaign changes.

## What it checks
At least one active sending account, a lead list that resolves to eligible recipients, at least one sequence step with subject and body, and a sending schedule.

## Eligible recipients
The eligible recipient count is recomputed and persisted, so the number you see is the number that will actually be queued after suppression and duplicates are removed.

## Audit trail
Every launch, pause and resume is recorded in the campaign audit trail with the user who performed it.`,
  },
  {
    slug: "mailbox-stuck-warming-up",
    title: 'Why is my mailbox stuck in "warming up"?',
    description: "Warmup runs for weeks and paces itself against engagement signals.",
    category: "warmup",
    updated: "2026-08-11",
    popular: true,
    content: `Warmup is not a switch, it is a ramp.

## Expected duration
Warmup typically runs two to four weeks and adjusts pace automatically based on engagement signals from the warmup network.

## Do not push volume
Scale by adding mailboxes rather than by increasing volume on a single warming mailbox. Campaign traffic on a mailbox that has not finished warming is the fastest way to land in spam.

## Continuous warmup
Warmup keeps running alongside campaign traffic once the mailbox is active — leaving it on protects reputation over time.`,
  },
  {
    slug: "inbox-replies-and-threading",
    title: "How replies reach the Unified Inbox",
    description: "Inbound processing, threading and replying from inside Sendloop.",
    category: "unified-inbox",
    updated: "2026-08-17",
    content: `Inbound email is received over a verified webhook and matched back to the campaign, lead and sending mailbox.

## Threading
Replies are threaded onto the original conversation so the whole exchange stays in one place, regardless of which mailbox sent the original message.

## CRM contacts
A reply creates or updates the matching CRM contact automatically, so the conversation and the pipeline record stay in sync.

## Replying
You can reply directly from the Unified Inbox. The reply is sent from the same mailbox that owns the thread, through the same managed sending path as campaigns.`,
  },
  {
    slug: "crm-pipeline-basics",
    title: "Working the CRM pipeline",
    description: "Stages, drag-and-drop, the contact drawer, tasks and notes.",
    category: "crm",
    updated: "2026-08-13",
    content: `The CRM board shows contacts as cards grouped by pipeline stage.

## Moving contacts
Drag a card to another stage to update it; the change is persisted immediately and appears on the contact's activity timeline.

## The contact drawer
Opening a contact shows its activity timeline, linked conversations and campaign history, plus tasks and notes.

## Where contacts come from
Contacts are created from replies and from leads you work, so the pipeline reflects real conversations rather than a separate list you maintain by hand.`,
  },
  {
    slug: "reading-analytics",
    title: "Reading campaign analytics and the conversion funnel",
    description: "How the funnel is calculated and how to drill into each step.",
    category: "analytics",
    updated: "2026-08-16",
    content: `Analytics are computed from deduplicated delivery events, not from raw provider callbacks.

## The funnel
The conversion funnel shows Sent, Delivered, Opened and Replied with a step-by-step rate between each stage.

## Drill-downs
Each funnel step can be opened to see the underlying recipients, which is the fastest way to tell a copy problem (low reply rate on healthy delivery) from an infrastructure problem (delivery falling off).`,
  },
  {
    slug: "connect-integrations",
    title: "Connecting an integration",
    description: "How connections are verified, where credentials live and what gets logged.",
    category: "integrations",
    updated: "2026-08-19",
    content: `Sendloop supports OpenAI, Slack, Zapier, Make, HubSpot, GoHighLevel, Calendly and Google Sheets.

## Verification before storage
Every connection is verified with a live call to the provider before it is saved, so a bad key fails at setup rather than silently at runtime.

## Credentials
Credentials are encrypted and never returned to the browser after they are stored.

## Inbound tools
Zapier and Make push leads into Sendloop through a token-authenticated endpoint that is validated and idempotent, so a retried delivery will not create duplicate leads.

## Activity
Every delivery and sync attempt is written to the integration event log in the Integrations tab.`,
  },
  {
    slug: "team-roles-and-visibility",
    title: "Roles, permissions and who can see a campaign",
    description: "Campaign visibility follows workspace roles.",
    category: "account",
    updated: "2026-08-08",
    content: `Access is granted per workspace, and every role has a fixed set of permissions.

## Read versus edit
Analysts and client viewers get read access. Campaign managers and above can edit.

## Invitations
Invite teammates from Workspace settings. An invitation is tied to the email address it was sent to and expires if unused.`,
  },
  {
    slug: "transfer-workspace-ownership",
    title: "Transferring workspace ownership",
    description: "Ownership transfer needs confirmation from both parties.",
    category: "account",
    updated: "2026-08-07",
    popular: true,
    content: `Ownership can be moved to another member of the same workspace.

## How it works
The transfer requires confirmation from both the current owner and the new owner, and takes effect immediately once confirmed. Billing responsibility moves with ownership.`,
  },
  {
    slug: "export-workspace-data",
    title: "Exporting all your workspace data",
    description: "Request a full export of leads, campaigns and reply history.",
    category: "account",
    updated: "2026-08-06",
    content: `You own your data and can take it with you at any time.

## Requesting an export
Request a full export from Settings, then Account. The export includes leads, campaigns and reply history as CSV and JSON.`,
  },
  {
    slug: "plans-and-invoices",
    title: "Reading your invoice and seat usage",
    description: "What each line item on a Sendloop invoice means.",
    category: "billing",
    updated: "2026-08-04",
    content: `Invoices break down by seat, mailbox add-ons and any overage.

## Seats
A seat is a member with edit access in the workspace. Read-only client viewers are billed differently from campaign managers.

## Mailbox add-ons
Mailboxes beyond the plan allowance appear as a separate line.

## Overage
Overage covers sending volume above the plan's included allowance for the period.`,
  },
  {
    slug: "cancel-downgrade-refunds",
    title: "Cancelling, downgrading and refunds",
    description: "How plan changes take effect and when a refund applies.",
    category: "billing",
    updated: "2026-08-04",
    popular: true,
    content: `Plan changes are self-service.

## Change your plan
Open Settings, then Billing, and change the plan. Downgrades take effect at the end of the current period and your data is retained.

## Refunds
Monthly plans are not refunded for partial periods. Annual plans within the first 14 days qualify for a full refund — contact support to process it.

## Support response time
Support answers within one business day on all plans, with priority routing for agency and enterprise workspaces.`,
  },
  {
    slug: "spam-placement-first-checks",
    title: "My emails are landing in spam — first checks",
    description: "The order to work through authentication, warmup, list quality and copy.",
    category: "deliverability",
    updated: "2026-08-18",
    popular: true,
    content: `Spam placement is almost always a mix of missing authentication, a cold domain, unverified lists or overly promotional copy.

## Fix in this order
Authentication and warmup first — they account for most cases. Then list quality, then copy.

## Volume
Cap a healthy warmed mailbox at 30 to 50 emails per day. Scale by adding mailboxes, never by pushing one mailbox harder.

## Copy signals
Keep the first email plain text with at most one link. Multiple links, tracking pixels and image-heavy HTML all add risk.

## Give it time
Authentication changes propagate within hours, but sender reputation is cumulative — expect one to three weeks of clean sending before inbox placement fully recovers.`,
  },
];

export function categoryName(slug: string): string {
  return HELP_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}

/** ~200 wpm, rounded up to whole minutes. */
export function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function formatUpdated(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export const ARTICLES_BY_UPDATED = [...HELP_ARTICLES].sort((a, b) =>
  a.updated < b.updated ? 1 : -1,
);

export function searchArticles(query: string, category: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  return HELP_ARTICLES.filter((a) => {
    if (category !== "all" && a.category !== category) return false;
    if (!q) return true;
    return (
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      categoryName(a.category).toLowerCase().includes(q)
    );
  });
}

/** Same-category first, then most recently updated. */
export function relatedArticles(article: HelpArticle, limit = 3): HelpArticle[] {
  const sameCategory = HELP_ARTICLES.filter(
    (a) => a.slug !== article.slug && a.category === article.category,
  );
  const rest = ARTICLES_BY_UPDATED.filter(
    (a) => a.slug !== article.slug && a.category !== article.category,
  );
  return [...sameCategory, ...rest].slice(0, limit);
}

export function articleNeighbours(slug: string) {
  const index = HELP_ARTICLES.findIndex((a) => a.slug === slug);
  return {
    previous: index > 0 ? HELP_ARTICLES[index - 1] : undefined,
    next: index >= 0 && index < HELP_ARTICLES.length - 1 ? HELP_ARTICLES[index + 1] : undefined,
  };
}
