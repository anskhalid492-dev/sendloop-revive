/**
 * Content for the MunchReach alternatives hub (/compare/munchreach-alternatives).
 *
 * Two rules govern everything in this file:
 *
 * 1. MunchReach cells describe capabilities that exist in this codebase
 *    (campaigns, sequences, warmup, unified inbox, CRM, automations, analytics,
 *    workspaces, API v1, webhooks). Nothing aspirational.
 * 2. Competitor cells describe publicly documented positioning in neutral
 *    terms and never state a price, a customer count, or a missing feature.
 *    Pricing always points the reader at the vendor's own page, because it
 *    changes constantly and a stale number here would be worse than none.
 */

export const ALTERNATIVES_REVIEWED_ON = "2026-08-29";

export type PlatformRow = {
  slug: string;
  name: string;
  /** Internal comparison route, when MunchReach publishes one. */
  href?: string;
  site?: string;
  bestFor: string;
  sending: string;
  sequences: string;
  followUps: string;
  inbox: string;
  crm: string;
  automation: string;
  analytics: string;
  warmup: string;
  api: string;
  webhooks: string;
  pricing: string;
  positioning: string;
};

const CHECK_VENDOR = "See vendor pricing";

export const PLATFORM_MATRIX: PlatformRow[] = [
  {
    slug: "munchreach",
    name: "MunchReach",
    href: "/pricing",
    bestFor: "Teams that want sending and everything after the send in one workspace",
    sending: "Own mailboxes (SMTP/IMAP, API providers) or managed sending, with per-mailbox caps",
    sequences: "Multi-step with per-step A/B variants and wait steps",
    followUps: "Scheduled on campaign sending days; stop on reply or unsubscribe",
    inbox: "Unified inbox across every connected mailbox, reply from the original account",
    crm: "Built-in pipeline, contacts, tasks, notes — created from replies",
    automation: "Visual trigger / condition / action / wait builder on a server-side scheduler",
    analytics: "Sent → delivered → opened → replied funnel, per campaign, mailbox and workspace",
    warmup: "Built-in warmup engine with ramp schedules and health scoring",
    api: "Public REST API v1 with scoped keys",
    webhooks: "Signed webhook endpoints with delivery history and retries",
    pricing: "Free plan, then paid tiers — see Pricing",
    positioning: "End-to-end outbound workspace",
  },
  {
    slug: "instantly",
    name: "Instantly",
    href: "/compare/munchreach-vs-instantly",
    site: "https://instantly.ai",
    bestFor: "High-volume sending teams that already run their own CRM",
    sending: "Connect multiple mailboxes; sending accounts can also be bought in-product",
    sequences: "Multi-step sequences with delays and variants",
    followUps: "Automated follow-ups that stop on reply",
    inbox: "Unified inbox for replies across connected mailboxes",
    crm: "Lead and opportunity views; many teams still sync to an external CRM",
    automation: "Campaign settings plus integrations such as webhooks and Zapier",
    analytics: "Campaign analytics and deliverability reporting",
    warmup: "Warmup is a core part of the platform",
    api: "API available",
    webhooks: "Webhooks available",
    pricing: CHECK_VENDOR,
    positioning: "Sending-first cold email platform",
  },
  {
    slug: "smartlead",
    name: "Smartlead",
    href: "/compare/munchreach-vs-smartlead",
    site: "https://smartlead.ai",
    bestFor: "Infrastructure-heavy teams and agencies running many mailboxes",
    sending: "Unlimited mailbox connections with rotation across accounts",
    sequences: "Multi-step sequences with delays and variants",
    followUps: "Automated follow-ups that pause on reply",
    inbox: "Master inbox across connected mailboxes",
    crm: "Lead status tracking inside campaigns; CRM usually external",
    automation: "Webhooks and an extensive API for building automations externally",
    analytics: "Campaign and mailbox analytics with deliverability reporting",
    warmup: "Warmup network included with the platform",
    api: "API-first product",
    webhooks: "Webhooks available",
    pricing: CHECK_VENDOR,
    positioning: "Scaled sending infrastructure",
  },
  {
    slug: "lemlist",
    name: "lemlist",
    href: "/compare/munchreach-vs-lemlist",
    site: "https://lemlist.com",
    bestFor: "Personalization-heavy, multichannel outreach",
    sending: "Connect mailboxes for sending as part of multichannel sequences",
    sequences: "Sequences that mix email with LinkedIn and calling steps",
    followUps: "Conditional follow-ups inside multichannel sequences",
    inbox: "Reply management for conversations started from sequences",
    crm: "Lead management plus integrations into external CRMs",
    automation: "Sequence-level conditions and integrations",
    analytics: "Campaign reporting on sequence performance",
    warmup: "Deliverability and warmup features are part of the suite",
    api: "API available",
    webhooks: "Webhooks available",
    pricing: CHECK_VENDOR,
    positioning: "Multichannel, personalization-led outreach",
  },
  {
    slug: "apollo",
    name: "Apollo",
    href: "/compare/munchreach-vs-apollo",
    site: "https://apollo.io",
    bestFor: "Teams whose main gap is finding contacts, not sending to them",
    sending: "Email sending as one channel inside a wider sales platform",
    sequences: "Sequences across email, calls and tasks",
    followUps: "Sequence steps with task-based follow-through",
    inbox: "Reply tracking inside the sales platform",
    crm: "CRM features plus deep integrations with Salesforce and HubSpot",
    automation: "Workflow automation across the sales platform",
    analytics: "Sales analytics across activity and pipeline",
    warmup: "Deliverability tooling; warmup is not the product's centre",
    api: "API available",
    webhooks: "Webhooks available",
    pricing: CHECK_VENDOR,
    positioning: "Contact database plus sales engagement",
  },
  {
    slug: "saleshandy",
    name: "Saleshandy",
    href: "/compare/munchreach-vs-saleshandy",
    site: "https://saleshandy.com",
    bestFor: "Straightforward cold email with a short learning curve",
    sending: "Connect mailboxes with sending limits and rotation",
    sequences: "Multi-step sequences with delays",
    followUps: "Automated follow-ups that stop on reply",
    inbox: "Unified inbox for replies",
    crm: "Lead states inside campaigns; CRM typically external",
    automation: "Campaign automation plus integrations",
    analytics: "Campaign and step-level reporting",
    warmup: "Warmup included with the platform",
    api: "API available",
    webhooks: "Webhooks available",
    pricing: CHECK_VENDOR,
    positioning: "Simple, accessible cold email",
  },
];

/** Column definitions so the desktop table and the mobile cards stay in sync. */
export const MATRIX_COLUMNS: { key: keyof PlatformRow; label: string }[] = [
  { key: "bestFor", label: "Best for" },
  { key: "sending", label: "Email sending" },
  { key: "sequences", label: "Sequences" },
  { key: "followUps", label: "Follow-ups" },
  { key: "inbox", label: "Inbox" },
  { key: "crm", label: "CRM" },
  { key: "automation", label: "Automation" },
  { key: "analytics", label: "Analytics" },
  { key: "warmup", label: "Warmup" },
  { key: "api", label: "API" },
  { key: "webhooks", label: "Webhooks" },
  { key: "pricing", label: "Starting price" },
  { key: "positioning", label: "Overall positioning" },
];

export const WHY_COMPARE = [
  {
    title: "All-in-one outbound workflow",
    body: "Outbound is not one job. Somebody has to build the list, warm the mailboxes, write the sequence, send it on a schedule the receiving servers accept, read the replies, and decide what happens next. Most platforms own two or three of those steps well and expect you to bolt on the rest. When you compare tools, the useful question is not which has more features but which owns the steps your team currently does by hand or in a spreadsheet.",
  },
  {
    title: "Campaign management",
    body: "A campaign is a scheduling problem as much as a copy problem: sending days, a window in the recipient's timezone, a daily limit per mailbox, an hourly ceiling, and follow-ups that must not overtake each other. Platforms differ in how much of that they enforce for you and how much you have to remember. MunchReach blocks a launch until domains, mailboxes, leads and template variables actually resolve, and re-plans the queue whenever schedule settings change.",
  },
  {
    title: "Unified inbox",
    body: "Once volume grows past a handful of mailboxes, replies are the bottleneck. Any tool can show you an open rate; the question is whether a reply lands somewhere threaded, attributable to a campaign, and answerable from the mailbox that originally sent — without logging into six webmail tabs. Check whether the inbox is a real product surface or a list of notifications.",
  },
  {
    title: "CRM and contact management",
    body: "Some teams already run Salesforce or HubSpot and want outbound to feed it. Others want the pipeline where the conversation is. Both are legitimate. What is worth checking is whether interest gets recorded at all when nobody copies it across: MunchReach creates and advances contact records from replies, and can still sync outward through integrations.",
  },
  {
    title: "Automation",
    body: "Automation means very different things across these products. Sometimes it is campaign settings (stop on reply), sometimes it is an API and a webhook you wire into an external workflow tool, sometimes it is a visual builder inside the product. None is automatically better — but the maintenance cost is different, and an external automation layer is another subscription and another thing that breaks silently.",
  },
  {
    title: "Analytics",
    body: "Compare what the numbers are counted from. A dashboard that counts a send as an open, or reports lifetime totals when you need today's, will quietly mislead a ramp-up. MunchReach separates today, the current run and lifetime, and builds the funnel from real delivery events with a drill-down to the campaign, mailbox or individual message behind each number.",
  },
];

export const FEATURE_DEEP_DIVES: {
  slug: string;
  title: string;
  what: string;
  why: string;
  munchreach: string;
  lookFor: string;
}[] = [
  {
    slug: "email-sending",
    title: "Email sending",
    what: "The mechanics of getting a message from your mailbox to an inbox: which account sends, at what rate, under whose reputation.",
    why: "Sending is where reputation is won or lost. A platform that pushes volume through the wrong mailbox at the wrong hour will burn a domain long before the copy matters.",
    munchreach:
      "Connect your own SMTP/IMAP mailboxes or API providers, or use managed sending. Each mailbox carries its own daily limit, a hard 70-per-hour ceiling, a rolling capacity window and a health state that pauses it when bounces spike.",
    lookFor:
      "Whether limits are per mailbox or global, whether the tool tells you why a mailbox stopped sending, and whether you keep control of the domains and accounts if you leave.",
  },
  {
    slug: "sequences",
    title: "Cold email sequences",
    what: "The ordered set of messages a prospect receives, with waits between them and variants to test.",
    why: "Most replies to cold outreach arrive after the first message. A sequence engine that cannot express 'wait three working days, then try a different angle' limits your results structurally.",
    munchreach:
      "Multi-step sequences with wait steps, A/B variants at the step level, and personalization variables resolved per lead. An unresolved-variable report runs before launch so no prospect receives a bare placeholder.",
    lookFor:
      "Per-step variants rather than whole-campaign A/B only, and what happens to an in-flight sequence when you edit it mid-run.",
  },
  {
    slug: "follow-ups",
    title: "Follow-ups",
    what: "Automatic later steps that stop the moment a prospect engages.",
    why: "Follow-ups drive volume, and volume drives risk. Timing that ignores sending days or the recipient's timezone turns a polite nudge into a Sunday-morning spam signal.",
    munchreach:
      "Follow-ups are planned against the campaign's selected sending days, window and timezone, and never pull earlier than their configured wait floor. A reply, an unsubscribe or a bounce cancels everything still queued for that contact.",
    lookFor:
      "Whether follow-ups respect the same schedule rules as first-touch, and whether editing the schedule re-plans messages already in the queue.",
  },
  {
    slug: "inbox-management",
    title: "Inbox management",
    what: "Reading and answering replies across many sending accounts in one place.",
    why: "Replies arrive in the mailbox that sent, not in your campaign tool. Without consolidation, response time slips and interested prospects go cold.",
    munchreach:
      "A three-panel unified inbox threads every conversation, shows the prospect record beside it, and sends the answer from the original mailbox so the thread stays intact for the recipient.",
    lookFor:
      "Threading quality on quoted replies, whether you can answer from the correct account, and whether notes and assignment exist for teams.",
  },
  {
    slug: "warmup",
    title: "Email warmup",
    what: "A controlled ramp of low-volume, high-engagement mail that establishes a new mailbox's reputation before real campaigns start.",
    why: "A brand-new mailbox that starts at a few hundred sends a day is the clearest spam signal there is. Warmup is the difference between a domain that lasts and one that is unusable in a month.",
    munchreach:
      "A built-in warmup engine with per-mailbox ramp schedules, daily statistics, health scoring and its own recipient pool — included rather than sold as a separate subscription.",
    lookFor:
      "Whether warmup is bundled or billed separately, whether it continues while campaigns run, and whether you can see per-mailbox health rather than one global score.",
  },
  {
    slug: "deliverability",
    title: "Deliverability",
    what: "Everything that decides whether a delivered message reaches the inbox: authentication, volume discipline, list hygiene and complaint handling.",
    why: "Deliverability problems are invisible until they are severe. Guardrails before a send are worth more than reports after one.",
    munchreach:
      "SPF, DKIM and DMARC are checked before a domain can send. Suppression lists, bounce and complaint handling, sending windows and per-account caps are enforced by the dispatcher, not left to the operator.",
    lookFor:
      "Whether the platform blocks an unsafe launch or merely warns, and how suppression is shared across campaigns in the same workspace.",
  },
  {
    slug: "crm",
    title: "CRM",
    what: "The record of who replied, what was said, what stage they are at and who owns the next step.",
    why: "Outbound that generates interest but loses it between tools is expensive. The pipeline has to be updated by the system, not by discipline.",
    munchreach:
      "A Kanban pipeline with stages, contact records, activity timelines, tasks and notes. Records are created and advanced from replies automatically, and can still sync to an external CRM through integrations.",
    lookFor:
      "Whether stages update from real events, and whether the outbound tool can hand off cleanly to the CRM you already pay for.",
  },
  {
    slug: "contact-management",
    title: "Contact management",
    what: "Importing, structuring, filtering and segmenting the people you want to reach.",
    why: "Personalization is only as good as your fields. A weak import step forces manual cleanup on every list you buy or build.",
    munchreach:
      "CSV import with field mapping, custom fields, saved filters, lead lists, activity history and list-level campaign targeting, plus retention rules for data you should not keep indefinitely.",
    lookFor:
      "Custom-field depth, duplicate handling on re-import, and whether filters can drive campaign audiences directly.",
  },
  {
    slug: "automation",
    title: "Automation",
    what: "Rules that act on outbound events without a person watching them.",
    why: "The follow-through after a reply — tag, move stage, notify, wait, act — is repetitive work that scales badly with headcount.",
    munchreach:
      "A visual builder with trigger, condition, action and wait steps running on a server-side scheduler, with a run history so you can see exactly which step fired and when.",
    lookFor:
      "Whether automation runs server-side (it keeps working when your browser is closed), and whether failed runs are visible and retryable.",
  },
  {
    slug: "analytics",
    title: "Analytics",
    what: "The funnel from send to reply, and the ability to see what is behind each number.",
    why: "Aggregate rates hide the problem. 'Open rate down' is not actionable; 'this mailbox stopped delivering on Tuesday' is.",
    munchreach:
      "Sent → delivered → opened → replied funnels across campaigns, mailboxes and the whole workspace, with today, current-run and lifetime figures reported separately and drill-downs to individual messages.",
    lookFor:
      "Whether the tool distinguishes accepted-by-provider from delivered, and whether warmup traffic is excluded from campaign numbers.",
  },
  {
    slug: "campaign-management",
    title: "Campaign management",
    what: "Creating, scheduling, launching, pausing and duplicating campaigns safely.",
    why: "Most damaging outbound mistakes are operational — the wrong list, an unverified domain, a schedule that ignores the timezone — not creative.",
    munchreach:
      "Launch readiness checks cover domains, mailbox availability, audience size and unresolved variables. Campaigns can be paused, resumed, duplicated and archived in bulk, and the queue re-plans itself when schedule settings change.",
    lookFor:
      "Whether the platform prevents a bad launch, how bulk actions behave across workspaces, and what a paused campaign does with already-queued mail.",
  },
  {
    slug: "workspaces",
    title: "Workspaces",
    what: "Separation between clients, brands or internal teams, with roles that limit what each person can do.",
    why: "Agencies cannot show one client another client's data, and an analyst should not be able to launch a campaign.",
    munchreach:
      "Multiple workspaces with owner, admin, campaign manager, inbox manager, analyst and client viewer roles, invitations, and per-workspace usage limits enforced server-side.",
    lookFor:
      "Whether isolation is real (enforced in the database) rather than a UI filter, and whether client-viewer style read-only access exists.",
  },
  {
    slug: "api",
    title: "API",
    what: "Programmatic access to the same objects the interface uses.",
    why: "Any outbound programme eventually needs to create campaigns from another system, sync contacts, or pull results into a warehouse.",
    munchreach:
      "A public REST API v1 with scoped bearer keys, cursor pagination, idempotency keys on writes, per-key rate limits and a published OpenAPI specification.",
    lookFor:
      "Scoped keys rather than one all-powerful token, idempotency on writes, and whether the documentation is generated from the real endpoints.",
  },
  {
    slug: "webhooks",
    title: "Webhooks",
    what: "Outbound events pushed to your endpoint as they happen.",
    why: "Polling an API for replies is slow and wasteful; a webhook lets your systems react the moment a prospect responds.",
    munchreach:
      "Signed webhook endpoints for send, reply and campaign events, with delivery history, automatic retries with backoff, and a signature you can verify.",
    lookFor:
      "Signature verification, retry behaviour, and whether you can inspect and replay a failed delivery.",
  },
  {
    slug: "integrations",
    title: "Integrations",
    what: "Connections to the CRM, enrichment and workflow tools you already run.",
    why: "Outbound is rarely the system of record. What matters is that the handoff is reliable and observable.",
    munchreach:
      "An integrations directory with connection health, sync logs and webhook endpoints, so a broken connection is visible rather than silent.",
    lookFor:
      "Whether sync failures surface anywhere, and whether the integration is two-way or export-only.",
  },
];

export const AUDIENCES = [
  {
    title: "Agencies",
    best: "MunchReach or Smartlead",
    why: "Agencies need client separation, many mailboxes and per-client reporting. MunchReach gives each client a workspace with roles including a read-only client viewer; Smartlead is strong when the priority is raw mailbox rotation at scale.",
    consider:
      "Count the clients you will onboard this year and check how each platform prices additional workspaces and seats.",
  },
  {
    title: "SaaS companies",
    best: "MunchReach or Apollo",
    why: "SaaS teams usually already have a CRM. If outbound needs to feed it and stay observable, an end-to-end workspace with an API and webhooks fits; if the harder problem is finding the right accounts, a contact database matters more.",
    consider: "Whether your bottleneck is data quality or execution — they point at different tools.",
  },
  {
    title: "Founders",
    best: "MunchReach or Saleshandy",
    why: "A founder sending their own outreach wants setup measured in an afternoon and guardrails that prevent an expensive domain mistake. Both keep the path short; MunchReach also keeps replies and pipeline in the same place so nothing is lost while you are busy building.",
    consider: "How much time you can give this weekly — a heavier platform will not get configured.",
  },
  {
    title: "Sales teams",
    best: "Apollo or MunchReach",
    why: "If reps work calls, tasks and email together inside an existing sales stack, a sales engagement platform is the natural home. If the team's job is to book meetings from cold email and hand them over, an outbound workspace with a shared inbox is usually less friction.",
    consider: "Where reps already spend their day; adoption follows habit more than features.",
  },
  {
    title: "Lead generation companies",
    best: "Smartlead or MunchReach",
    why: "Volume businesses live on mailbox capacity, rotation and deliverability discipline. Smartlead is built around that infrastructure; MunchReach adds reply handling and per-client reporting when you deliver conversations rather than sends.",
    consider: "Whether you are paid for meetings or for sends — that decides which side matters.",
  },
  {
    title: "Freelancers",
    best: "Saleshandy or MunchReach",
    why: "One or two mailboxes, modest volume, no team. The deciding factor is usually the entry plan and how much setup is required before the first campaign.",
    consider: "Start on a free or low tier and only pay for capacity you are actually using.",
  },
  {
    title: "High-volume outbound teams",
    best: "Smartlead, Instantly or MunchReach",
    why: "Above a few thousand sends a day, the platform's scheduler and per-mailbox controls matter more than its UI. All three are built for that volume with different emphases: infrastructure, sending workflow, and consolidation respectively.",
    consider:
      "Ask how each one behaves when a daily quota is exhausted mid-run — parking cleanly until the next window is what protects reputation.",
  },
];

export const USE_CASES = [
  {
    need: "High-volume cold email",
    pick: "Smartlead or Instantly",
    body: "Both are built around pushing large volume across many mailboxes with rotation and warmup. MunchReach handles the same volume with per-mailbox caps and an hourly ceiling, and is the better pick when replies and pipeline also need a home.",
  },
  {
    need: "Lead databases",
    pick: "Apollo",
    body: "If your gap is contact data, Apollo's database is the reason to use it. MunchReach does not sell contact data — you bring lists or use an enrichment integration.",
  },
  {
    need: "Sales engagement",
    pick: "Apollo, or Instantly with your CRM",
    body: "Multi-channel rep workflows with calls and tasks belong in a sales engagement platform. Cold email tools cover the email channel well but are not a full rep workspace.",
  },
  {
    need: "Agencies",
    pick: "MunchReach or Smartlead",
    body: "Workspace isolation, roles, and per-client reporting are the deciding factors. Check whether a client can be given read-only access without seeing another client's data.",
  },
  {
    need: "CRM-heavy teams",
    pick: "Apollo or MunchReach",
    body: "If Salesforce or HubSpot is the system of record, prioritise integration depth. If you would rather not maintain a second pipeline for outbound, a built-in CRM removes the sync entirely.",
  },
  {
    need: "Automation",
    pick: "MunchReach or Smartlead",
    body: "MunchReach runs automations visually inside the product; Smartlead's API-first approach suits teams who prefer to build the logic in their own stack. Pick based on who maintains it.",
  },
  {
    need: "Simple outbound",
    pick: "Saleshandy or MunchReach",
    body: "For a small number of mailboxes and one or two campaigns, the shortest setup wins. Anything that requires a week of configuration will not survive contact with a busy schedule.",
  },
];

export const WHY_SWITCH = [
  {
    title: "\u201cI need more than email sending\u201d",
    body: "Sending is the first third of the job. Teams usually hit the wall when replies arrive: the campaign tool shows a reply count, but the conversation itself is scattered across mailboxes and the pipeline lives in a spreadsheet. Consolidation is worth switching for when reply volume is high enough that follow-through is slipping.",
  },
  {
    title: "\u201cI want replies and campaigns together\u201d",
    body: "Attribution breaks when the inbox is separate from the campaign. Answering from a generic mailbox splits the thread for the recipient and loses the link back to the sequence step that earned the reply — which is exactly the data you need to improve the next campaign.",
  },
  {
    title: "\u201cI want fewer disconnected tools\u201d",
    body: "A typical stack is a sender, a warmup subscription, a workflow automation tool, a CRM and a reporting sheet. Every boundary is a place data goes stale. Fewer tools is not automatically better, but each one should earn its place — count how many exist only to move data between two others.",
  },
  {
    title: "\u201cI need better campaign visibility\u201d",
    body: "Lifetime totals hide the thing you need during a ramp: what happened today, in this run, on this mailbox. Teams switch when they cannot answer 'why did we send 40 emails yesterday instead of 400?' without exporting data.",
  },
  {
    title: "\u201cI want API access\u201d",
    body: "Once outbound is part of a larger system — a product signup triggering a sequence, results flowing to a warehouse — an API stops being a nice-to-have. Check for scoped keys, idempotent writes and webhooks, not just the existence of endpoints.",
  },
  {
    title: "\u201cI need centralized outbound management\u201d",
    body: "Multiple brands, clients or regions each with their own domains, mailboxes, limits and reporting is an administration problem. Workspaces with real isolation and roles solve it; running separate accounts per client does not scale past a handful.",
  },
];

export const MIGRATION_STEPS = [
  {
    title: "Export contacts",
    body: "Export your leads from your current platform as CSV, including custom fields and any status column you rely on. Export per campaign rather than one combined file so audiences stay separable when you rebuild.",
  },
  {
    title: "Connect mailboxes",
    body: "Add the same mailboxes in MunchReach and complete SPF, DKIM and DMARC verification. Domains cannot send until authentication passes, which is deliberate — it is the check most migrations skip.",
  },
  {
    title: "Import campaign data",
    body: "Import lists with field mapping, then confirm custom fields landed where your templates expect them. Import your existing suppression and unsubscribe list first, so nobody who already opted out receives a message from the new tool.",
  },
  {
    title: "Rebuild or import sequences",
    body: "Recreate each active sequence step by step with its waits and variants. Run the unresolved-variable report and a test send before anything goes to a real prospect.",
  },
  {
    title: "Launch and monitor",
    body: "Start below your previous daily volume, keep warmup running on every mailbox, and watch the delivered and bounce numbers for the first few days before ramping back to full volume.",
  },
];

export const MIGRATION_CHECKLIST = [
  "Export contacts from your current platform",
  "Review custom fields and how they map",
  "Connect sending accounts",
  "Verify DNS (SPF, DKIM, DMARC)",
  "Import the existing suppression list",
  "Review sequence timing and wait steps",
  "Configure sending limits and windows",
  "Import contacts into lists",
  "Send a test campaign and check variables",
  "Launch at reduced volume, then ramp",
];

export const DECISION_GUIDE = [
  { need: "Need prospecting data or a contact database?", answer: "Consider Apollo", detail: "MunchReach does not sell contact data; bring your own lists or enrich through an integration." },
  { need: "Need sales engagement across calls, tasks and email?", answer: "Compare Apollo and Instantly", detail: "Rep-centric workflows belong where reps already work." },
  { need: "Need very high sending volume across many mailboxes?", answer: "Compare Smartlead and Instantly", detail: "Both are built around sending infrastructure and rotation at scale." },
  { need: "Need personalization-heavy, multichannel outreach?", answer: "Compare lemlist", detail: "Strongest when email is one step in a wider personalised sequence." },
  { need: "Need a simple setup for one or two mailboxes?", answer: "Compare Saleshandy", detail: "Short learning curve for straightforward cold email." },
  { need: "Need one workspace for sending, replies, pipeline and reporting?", answer: "Consider MunchReach", detail: "Campaigns, warmup, unified inbox, CRM, automations, analytics and an API in one product." },
];

export const ALTERNATIVES_FAQS = [
  {
    q: "What is the best MunchReach alternative?",
    a: "There is no single answer, because these products optimise for different parts of outbound. Instantly and Saleshandy are sending-first, Smartlead emphasises sending infrastructure and an API, lemlist leans into personalised multichannel sequences, and Apollo bundles a contact database with sales engagement. Decide by which part of your outbound is currently the bottleneck.",
  },
  {
    q: "Is MunchReach similar to Instantly?",
    a: "They overlap on campaigns, sequences, mailbox connections, warmup and a unified inbox. The practical difference is what happens after the reply: MunchReach includes a CRM pipeline, visual automations and workspace roles in the same product, whereas Instantly is typically paired with an external CRM.",
  },
  {
    q: "Is MunchReach similar to Smartlead?",
    a: "Both run multi-step campaigns across many mailboxes with warmup and deliverability controls. Smartlead is API-first and infrastructure-focused; MunchReach puts more of the reply-side workflow — inbox, pipeline, automations, reporting — inside the product rather than expecting you to assemble it.",
  },
  {
    q: "How does MunchReach compare with Apollo?",
    a: "Apollo's distinguishing asset is its contact database and wider sales platform. MunchReach does not sell contact data; it focuses on executing and managing email outbound with your own lists and mailboxes. Teams whose gap is finding people should look at Apollo; teams whose gap is running and managing the campaigns should look at MunchReach.",
  },
  {
    q: "Can I migrate from Instantly to MunchReach?",
    a: "Yes. Export your leads and sequence copy as CSV, connect the same mailboxes and pass DNS verification, import your suppression list, rebuild the sequences, then ramp volume back up while warmup keeps running.",
  },
  {
    q: "Can I migrate from Smartlead to MunchReach?",
    a: "Yes, and the process is the same: lists and custom fields first, then mailboxes and authentication, then sequences. If you drive Smartlead through its API, plan the equivalent calls against the MunchReach API v1 before you cut over.",
  },
  {
    q: "Does MunchReach support cold email sequences?",
    a: "Yes. Sequences support multiple steps, wait times, A/B variants per step and personalization variables resolved per lead, and they stop automatically when a prospect replies, unsubscribes or bounces.",
  },
  {
    q: "Does MunchReach have an API?",
    a: "Yes. The public REST API v1 covers campaigns, sequences, contacts, mailboxes, replies, analytics and webhooks, using scoped bearer keys, cursor pagination and idempotency keys on writes. The full reference and OpenAPI specification are on the API documentation page.",
  },
  {
    q: "Does MunchReach support webhooks?",
    a: "Yes. You can register signed webhook endpoints for send, reply and campaign events. Deliveries are retried with backoff and every attempt is visible so you can diagnose a failing endpoint.",
  },
  {
    q: "Does MunchReach include CRM features?",
    a: "Yes — a Kanban pipeline with stages, contact records, activity timelines, tasks and notes. Records are created and updated from replies, so the pipeline reflects what actually happened without manual copying.",
  },
  {
    q: "Does MunchReach have a unified inbox?",
    a: "Yes. Replies from every connected mailbox arrive in one threaded inbox with the prospect record alongside, and answers are sent from the mailbox that originally sent the message.",
  },
  {
    q: "Which platform is best for agencies?",
    a: "Agencies should weigh client isolation and reporting above raw feature counts. MunchReach provides separate workspaces with roles including a read-only client viewer; Smartlead is a common choice where mailbox rotation at very high volume is the main requirement.",
  },
  {
    q: "Which platform is best for high-volume outbound?",
    a: "Smartlead, Instantly and MunchReach all handle high volume. The differences show up in the controls: how limits are set per mailbox, what happens when a daily quota is exhausted mid-run, and whether the queue re-plans itself against your schedule.",
  },
  {
    q: "How long does migration take?",
    a: "The mechanical work — exporting lists, connecting mailboxes, rebuilding sequences — is usually a day or two for a typical setup. DNS propagation and a sensible volume ramp are what set the real timeline, so plan for one to two weeks before you are back at full send volume.",
  },
  {
    q: "Can I test MunchReach before switching?",
    a: "Yes. Start on the free plan, connect a single mailbox, import a small list and run one campaign end to end. That exercises sending, warmup, the inbox and the pipeline without touching your current setup.",
  },
  {
    q: "Do you keep this comparison up to date?",
    a: `It was last reviewed on ${ALTERNATIVES_REVIEWED_ON}. Competitor products change frequently and we do not publish their prices here — check each vendor's own site for current pricing and features before deciding.`,
  },
];
