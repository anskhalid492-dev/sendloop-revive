import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const GETTING_STARTED_ARTICLES: HelpArticle[] = [
  {
    slug: "what-is-munchreach",
    title: "What is MunchReach?",
    description:
      "A plain explanation of what MunchReach does and who it is for, before you set anything up.",
    category: "getting-started",
    updated: UPDATED,
    gettingStarted: true,
    popular: true,
    keywords: ["what is munchreach", "overview", "cold email platform", "about"],
    related: ["how-munchreach-works", "quick-start", "munchreach-terminology"],
    content: `MunchReach is a cold outreach platform. You import a list of leads, write an email sequence, connect one or more sending mailboxes, and MunchReach sends the sequence on a schedule you control and collects the replies in one inbox.

## What it handles for you
- Mailbox connection for Gmail, Microsoft 365 and any IMAP/SMTP account, tested before it is enabled
- Mailbox health monitoring and daily/hourly limits
- Warmup, so a new mailbox builds reputation before it carries campaign traffic
- Sequence sending with per-lead scheduling, pacing and stop rules
- Reply capture and threading in a unified inbox
- Bounce, complaint and unsubscribe suppression
- Analytics on sends, delivery, opens, clicks, replies and bounces
- A public API and webhooks for your own systems

## What you are responsible for
Your list quality, your copy, and complying with the laws that apply where you and your recipients are.

## Who it is for
Sales teams, founders doing their own outreach, and agencies running outreach for several clients across separate workspaces.`,
    faqs: [
      {
        q: "Does MunchReach find leads for me?",
        a: "No. You bring the list — imported from CSV, added by hand, or pushed in through the API or an integration.",
      },
      {
        q: "Do I need my own mailbox?",
        a: "Yes. You connect a mailbox you already own — Gmail, Microsoft 365 or any IMAP/SMTP account — and campaigns send through it.",
      },
    ],
  },
  {
    slug: "how-munchreach-works",
    title: "How MunchReach works",
    description: "The path an email takes from your sequence to a reply in your inbox.",
    category: "getting-started",
    updated: UPDATED,
    gettingStarted: true,
    popular: true,
    keywords: ["how it works", "architecture", "flow", "pipeline"],
    related: ["what-is-munchreach", "how-sending-works", "campaign-queue", "quick-start"],
    content: `Everything in MunchReach belongs to a workspace: mailboxes, leads, campaigns, replies and billing.

## The flow
1. **Mailbox.** You connect a mailbox you own — Gmail, Microsoft 365 or IMAP/SMTP. MunchReach tests sending and receiving, stores the credentials encrypted, then you set its daily and hourly limits. Warmup starts automatically unless you turn it off.
2. **Leads.** You import a list. Invalid addresses, in-file duplicates and addresses already in the workspace are reported and skipped.
3. **Campaign.** You build a sequence, attach leads, choose mailboxes and set a schedule.
4. **Launch.** MunchReach checks readiness, then queues the audience in controlled batches. Once the whole audience is queued the campaign becomes Active.
5. **Sending.** Messages go out inside your sending window, respecting campaign limits, per-mailbox limits and pacing delays.
6. **Replies.** Inbound mail is threaded back onto the conversation, the lead and the campaign, and appears in the unified inbox.
7. **Suppression.** Bounces, complaints and unsubscribes stop the sequence for that lead and are suppressed for future sends.

## Important notes
Campaign email is sent through the mailboxes you connect, so delivery happens on your own accounts. You configure your mailboxes, your limits and your schedule, and MunchReach handles the sequencing, pacing and replies.`,
  },
  {
    slug: "quick-start",
    title: "Getting started with MunchReach",
    description: "The shortest path from signup to a launched first campaign.",
    category: "getting-started",
    updated: UPDATED,
    popular: true,
    gettingStarted: true,
    keywords: ["quick start", "setup", "first steps", "onboarding", "get started"],
    related: [
      "create-your-account",
      "connect-a-mailbox",
      "your-first-lead-list",
      "launch-first-campaign",
      "first-campaign-checklist",
    ],
    content: `## Short answer
Connect your mailbox, import leads, build a sequence, launch.

## Steps
1. **Create your workspace.** After signing up you name your workspace. You can create more later and switch between them from the sidebar.
2. **Connect your mailbox.** Go to Email Accounts → Add accounts and choose Gmail / Google Workspace, Microsoft 365 / Outlook or IMAP/SMTP. Enter the address and sender name, and MunchReach tests the connection before enabling it. Leave Start warmup on.
3. **Import leads.** Go to Leads → Import CSV. Map your columns, review the summary, confirm the list is verified and finish.
4. **Build a campaign.** Campaigns → new campaign. Add leads on the Leads tab, write the first email and follow-ups on Sequences, set your window on Schedule, choose mailboxes on Email Accounts.
5. **Launch.** When the readiness bar turns green, click Launch campaign.

## Important notes
- A mailbox cannot send until its connection test passes and it is active. That is the step people skip.
- Give warmup time before you push volume through a brand-new mailbox.

## Common problems
- **Launch button disabled** — the readiness bar lists exactly what is missing.
- **Import skipped rows** — the review step shows the reason for each one.`,
  },
  {
    slug: "create-your-account",
    title: "Create your MunchReach account",
    description: "Signing up, verifying your email and creating your first workspace.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["sign up", "signup", "register", "create account", "verify email"],
    related: ["complete-onboarding", "quick-start", "account-settings"],
    content: `## Steps
1. Go to the sign-up page and register with your email address and a password, or continue with Google.
2. Confirm your email address from the message we send. Until it is confirmed some actions stay locked.
3. Name your first workspace when prompted.

## Important notes
- Your workspace name appears on client-facing reporting, so use the business name rather than a placeholder.
- If the confirmation email has not arrived after a few minutes, check spam and then request a new one from the sign-in screen.

## Common problems
- **Password reset link expired** — request a new one; links are single-use and time limited.
- **Already have an account with that email** — use Forgot password rather than signing up again.`,
  },
  {
    slug: "complete-onboarding",
    title: "Complete your onboarding",
    description: "What the setup journey asks for and why each step matters.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["onboarding", "setup journey", "checklist", "first run"],
    related: ["quick-start", "recommended-setup", "connect-a-mailbox"],
    content: `After signup MunchReach shows a setup journey that tracks the things a workspace needs before it can send.

## What it covers
- Workspace created
- At least one mailbox connected and tested
- Leads imported
- A campaign created and launched

## Steps
Work top to bottom. Each item links straight to the screen that completes it, and ticks itself once the underlying condition is true — it is checked against real data, not a box you tick yourself.

## Important notes
You can skip the journey and set things up in any order; it will still reflect your actual progress. It disappears once every step is complete.`,
  },
  {
    slug: "understanding-the-dashboard",
    title: "Understanding the MunchReach dashboard",
    description: "What each panel on the dashboard tells you and where it links to.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["dashboard", "home", "overview screen", "kpi"],
    related: ["reading-analytics", "campaign-statuses", "mailbox-health"],
    content: `The dashboard is the landing screen for a workspace and answers one question: is outreach healthy right now?

## What you see
- Headline performance for the current period: emails sent, open rate, reply rate, bounce rate
- Campaign activity, so you can see which campaigns are actually sending
- Sending account health and any mailboxes that need attention
- Alerts for domains, mailboxes or campaigns that are blocking sends

## Steps
Click any figure or campaign name to open the underlying screen — Analytics for numbers, Campaigns for a specific campaign, Email Accounts for mailbox problems.

## Important notes
Dashboard numbers use deduplicated event data, the same source as Analytics and the API, so they agree with each other.`,
  },
  {
    slug: "your-first-lead-list",
    title: "Your first lead list",
    description: "Create a list, import into it, and keep it separate from everything else.",
    category: "getting-started",
    updated: UPDATED,
    gettingStarted: true,
    keywords: ["first list", "lead list", "folder", "segment"],
    related: ["import-leads", "csv-import-guide", "lead-lists"],
    content: `## Short answer
Create the list first, then choose it during import — otherwise the rows land in All leads.

## Steps
1. Go to Leads.
2. In the left sidebar, click New to create a list and give it a name that describes the audience, for example "Packaging — USA — Q4".
3. Click Import CSV.
4. Map your columns, and on the review step set Import into list to your new list.
5. Finish the import and confirm the list count matches what you expected.

## Important notes
A lead can belong to several lists. Lists are how you keep audiences apart; campaigns pull from them.

## Common problems
- **Leads went to All leads instead of my list** — the Import into list picker on the review step was left unset. Every lead also appears under All leads by design; the list is an additional grouping, not a separate storage location.`,
  },
  {
    slug: "your-first-campaign",
    title: "Your first campaign",
    description: "Build a simple three-step sequence that is safe to send on a new domain.",
    category: "getting-started",
    updated: UPDATED,
    gettingStarted: true,
    keywords: ["first campaign", "beginner", "sequence", "example"],
    related: ["create-a-campaign", "create-follow-ups", "launch-first-campaign"],
    content: `## Steps
1. Go to Campaigns and create a campaign. Name it after the audience and the offer.
2. On the **Leads** tab, add the list you imported.
3. On the **Sequences** tab, write the first email. Keep it plain text, short, one clear ask, at most one link.
4. Add two follow-ups with a wait of three to four working days between them. Send them on the same thread.
5. On the **Schedule** tab, pick your sending days, a window inside your prospects' working hours, and their timezone. Start with a low daily limit.
6. On the **Email Accounts** tab, select the mailboxes that should send.
7. Check the readiness bar, then click Launch campaign.

## Important notes
- Start with a small audience — a few hundred leads — while you learn how your copy performs.
- Do not increase daily volume in the first week. Reputation is built by consistency, not by bursts.`,
  },
  {
    slug: "launch-first-campaign",
    title: "Launch your first campaign",
    description: "What happens when you click Launch, and how long it takes.",
    category: "getting-started",
    updated: UPDATED,
    gettingStarted: true,
    popular: true,
    keywords: ["launch", "go live", "start campaign", "preparing"],
    related: ["launch-readiness", "large-campaigns", "campaign-queue", "campaign-not-sending"],
    content: `## Short answer
Launch queues your audience, then flips the campaign to Active. Sending begins at the next open moment in your sending window.

## Steps
1. Open the campaign and check the readiness bar at the top.
2. Click **Launch campaign**.
3. Wait while MunchReach prepares the queue. Larger audiences are prepared in controlled batches and show progress as they go.
4. When preparation finishes the status changes to Active and the Queue tab lists the scheduled messages.

## Important notes
- The campaign stays in draft until the entire audience is queued. That is deliberate: a half-queued campaign never sends.
- If you launch outside your sending window, messages wait for the window to open. Nothing is lost.

## Common problems
- **Launch button is disabled** — the readiness bar names the blocker.
- **Active but nothing sent yet** — check the sending window, the sending days and the daily limit.`,
  },
  {
    slug: "monitor-first-campaign",
    title: "Monitor your first campaign",
    description: "What to check in the first hours and the first week after launch.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["monitor", "after launch", "first week", "watch"],
    related: ["reading-analytics", "campaign-queue", "deliverability-basics"],
    content: `## First hour
Open the campaign's **Queue** tab and confirm messages are moving out of the scheduled state. Then check the **Analytics** tab for the first sends.

## First day
Watch the bounce rate. Anything above a couple of percent means the list needs work, and MunchReach may restrict sending to protect your domain.

## First week
- Reply rate tells you about the offer and the copy.
- Open rate tells you about the subject line and, indirectly, placement.
- Delivery and bounce rates tell you about list quality and authentication.

## Important notes
Do not judge copy on fewer than a few hundred sends. Small samples move wildly.

## Common problems
- **Opens look implausibly high or low** — open tracking depends on the recipient's mail client loading images and on your tracking setup. Treat replies as the reliable signal.`,
  },
  {
    slug: "munchreach-terminology",
    title: "MunchReach terminology",
    description: "The words used across the app, defined once.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["glossary", "terms", "definitions", "vocabulary"],
    related: ["how-munchreach-works", "campaign-statuses", "lead-statuses"],
    content: `**Workspace** — the container for everything: domains, mailboxes, leads, campaigns, replies, billing and team access.

**Sending domain** — a domain you control, verified in MunchReach, that mailboxes are created on.

**Mailbox / email account** — an address on a verified domain that sends campaign email and receives replies.

**Warmup** — automated low-volume sending that builds a mailbox's reputation before and alongside campaign traffic.

**Lead** — a person in your workspace, unique per email address.

**List** — a named group of leads used to build campaign audiences.

**Campaign** — a sequence plus an audience, a schedule and a set of mailboxes.

**Sequence step** — one email, wait, condition, task or stop in the campaign flow.

**Queue** — the scheduled messages a campaign has created but not yet sent.

**Sending window** — the days, hours and timezone during which a campaign may send.

**Daily limit** — the maximum number of emails a campaign, or a mailbox, may send in a day.

**Suppression** — an address that must not be emailed again, because it bounced, complained or unsubscribed.

**Conversation** — a threaded exchange with a lead in the unified inbox.`,
  },
  {
    slug: "recommended-setup",
    title: "Recommended setup before sending",
    description: "The configuration that prevents most deliverability problems later.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["best practice setup", "before sending", "preparation", "recommended"],
    related: ["verify-a-domain", "spf-dkim-dmarc", "how-warmup-works", "deliverability-basics"],
    content: `## Short answer
Send from a separate domain, authenticate it fully, warm the mailboxes, and start slow.

## Recommended
1. **Use a secondary domain** for outreach, not your main company domain. If reputation suffers, your corporate mail is unaffected.
2. **Publish SPF, DKIM and DMARC** for that domain and let verification pass before creating mailboxes.
3. **Two to four mailboxes per domain**, not one mailbox pushed hard.
4. **Leave warmup on** and give it at least two weeks before real volume.
5. **Cap each mailbox at 30–50 campaign emails a day** once warm. Scale by adding mailboxes.
6. **Verify your list** before importing. Bounces are the fastest way to damage a new domain.
7. **Set a realistic sending window** in your prospects' timezone with pacing delays between messages.

## Important notes
None of this guarantees inbox placement — no platform can. It removes the causes that are inside your control.`,
  },
  {
    slug: "first-campaign-checklist",
    title: "First campaign checklist",
    description: "Run through this list before you click Launch.",
    category: "getting-started",
    updated: UPDATED,
    keywords: ["checklist", "pre-launch", "before launch", "qa"],
    related: ["launch-readiness", "launch-first-campaign", "variables-and-fallbacks"],
    content: `## Domain and mailboxes
- Domain shows Ready to send
- SPF, DKIM and DMARC all verified
- Mailboxes active, warmup running, sensible daily and hourly limits

## Audience
- List imported and reviewed, invalid rows understood
- List confirmed as verified during import
- Suppressed and previously contacted leads excluded

## Copy
- First email is plain text, short, one ask, at most one link
- Follow-ups add something new rather than "just bumping this"
- Every variable has a fallback
- Preview shows no unresolved variables
- Test send received and read on a phone as well as a desktop

## Schedule
- Sending days and window match your prospects' working hours
- Timezone set to the audience, not to you
- Daily limit conservative for the first week
- Pacing delays set so messages do not go out in a block

## Final
- Readiness bar green
- The right mailboxes selected on the Email Accounts tab`,
  },
];
