import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  Filter,
  Inbox,
  Layers,
  LineChart,
  Mail,
  Megaphone,
  Repeat,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Long-form content for the eight MunchReach solution pages.
 *
 * The list is intentionally closed: exactly these audiences exist, and the
 * Solutions navigation (mega menu + "By use case") is generated from it, so a
 * page and its nav entry can never drift apart.
 */
export type SolutionContent = {
  slug: string;
  nav: string;
  navText: string;

  /* Hero */
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  heroBenefits: string[];

  /* SEO */
  seoTitle: string;
  seoDescription: string;

  /* Problem (dark contrast section) */
  problemHeading: string;
  problemIntro: string;
  problemItems: { title: string; text: string }[];

  /* MunchReach solution */
  solutionHeading: string;
  solutionIntro: string;
  pillars: { icon: LucideIcon; title: string; text: string }[];

  /* Audience-specific capabilities */
  featuresHeading: string;
  featuresIntro: string;
  features: { icon: LucideIcon; title: string; text: string }[];

  /* Audience workflow */
  workflowHeading: string;
  workflowIntro: string;
  workflow: { title: string; text: string }[];

  /* Outcomes */
  outcomes: { title: string; text: string }[];
  before: string[];
  after: string[];

  /* Close */
  faqs: { q: string; a: string }[];
  ctaTitle: string;
  ctaDescription: string;
};

export const solutions: SolutionContent[] = [
  {
    slug: "agencies",
    nav: "Agencies",
    navText: "Run client outreach from one workspace.",
    eyebrow: "For agencies",
    title: "Run Client Outreach Without",
    highlight: "the Spreadsheet Chaos",
    description:
      "Manage campaigns, leads, sending accounts, replies, and reporting from one place — without rebuilding the same outreach workflow for every client.",
    heroBenefits: [
      "A separate workspace per client",
      "Central sending account management",
      "Client-ready campaign reporting",
    ],
    seoTitle: "Cold Email Platform for Agencies | MunchReach",
    seoDescription:
      "MunchReach is a cold email platform for agencies: separate client workspaces, campaigns, sending accounts, a unified inbox and reporting in one place.",
    problemHeading: "Still juggling separate outreach systems for every client?",
    problemIntro:
      "Agency outbound rarely fails because the messaging is wrong. It fails because the operation around the messaging is spread across too many places, and every new client multiplies the work.",
    problemItems: [
      {
        title: "Multiple client campaigns",
        text: "Every client has its own audience, offer and cadence, and each one ends up living in a different tool, tab or spreadsheet. Nobody has a single view of what is running this week.",
      },
      {
        title: "Repetitive setup",
        text: "The same sequence structure, the same field mapping, the same schedule — rebuilt from zero on every onboarding. Setup time eats into the first month of the retainer.",
      },
      {
        title: "Multiple sending accounts",
        text: "Different clients bring different mailboxes and domains. Keeping track of which mailbox belongs to which client, and how much each one sent today, becomes a job of its own.",
      },
      {
        title: "Client reporting",
        text: "Month-end turns into an export exercise. Numbers get copied between tools and slide decks, and the figures rarely reconcile with what the campaign screen showed.",
      },
      {
        title: "Reply management",
        text: "Answers land in several mailboxes belonging to several clients. Without one place to work them, interested prospects wait days for a response.",
      },
      {
        title: "Operational overhead",
        text: "Coordinators spend their time administering campaigns instead of improving them, so the account only scales when you hire another coordinator.",
      },
    ],
    solutionHeading: "One platform for your agency's outbound operation",
    solutionIntro:
      "MunchReach brings the pieces of client outreach into a single workspace: prospect data, campaigns, sequences, sending accounts, scheduling, warmup, replies, analytics, CRM and automations. Instead of connecting five tools per client, you run the same repeatable workflow every time.",
    pillars: [
      {
        icon: Building2,
        title: "Workspace per client",
        text: "Leads, campaigns, mailboxes, conversations and analytics stay separated by client, with one login for your team.",
      },
      {
        icon: Send,
        title: "Central sending accounts",
        text: "Connect each client's mailboxes once, set daily limits, and see sending capacity across every account you manage.",
      },
      {
        icon: Inbox,
        title: "Replies in one inbox",
        text: "Every conversation from every campaign lands in the unified inbox, with the full thread and prospect context attached.",
      },
      {
        icon: Repeat,
        title: "Reusable playbooks",
        text: "Save the sequences and schedules that work and roll them out to the next client instead of starting from a blank page.",
      },
      {
        icon: BarChart3,
        title: "Reporting you can send",
        text: "Campaign, mailbox and reply analytics per client, so the numbers you report are the numbers in the product.",
      },
    ],
    featuresHeading: "Everything agencies need to run client outreach",
    featuresIntro:
      "The capabilities agency teams lean on most, built around how account managers and coordinators actually work.",
    features: [
      {
        icon: Layers,
        title: "Client campaign organization",
        text: "Group campaigns by client and workspace so it is always obvious what is live, paused or finished for each account.",
      },
      {
        icon: Mail,
        title: "Multiple sending accounts",
        text: "Manage all connected mailboxes centrally, with per-account daily limits, health status and warmup in one screen.",
      },
      {
        icon: Users,
        title: "Lead organization",
        text: "Import lists per client, map your own fields, filter duplicates and keep segments ready for the next campaign.",
      },
      {
        icon: Inbox,
        title: "Reply management",
        text: "Work every reply from the unified inbox, keep notes on the thread and hand conversations to the right team member.",
      },
      {
        icon: LineChart,
        title: "Campaign analytics",
        text: "Follow sends, delivery, replies and positive replies per campaign so client conversations are grounded in data.",
      },
      {
        icon: Workflow,
        title: "Repeatable workflows",
        text: "Templates, sequences and automations that turn a new client onboarding into a checklist instead of a project.",
      },
    ],
    workflowHeading: "How an agency runs MunchReach",
    workflowIntro:
      "The same sequence of steps for every account, so onboarding a client looks identical whether it is your third or your thirtieth.",
    workflow: [
      { title: "Prospect", text: "Define the client's target audience and gather the list." },
      { title: "Client campaign", text: "Spin up a workspace and campaign scoped to that client." },
      { title: "Sending accounts", text: "Connect and warm the mailboxes that will carry the sends." },
      { title: "Sequence", text: "Load the proven sequence and adapt the messaging to the offer." },
      { title: "Replies", text: "Work answers from the unified inbox and route them to the account owner." },
      { title: "Reporting", text: "Report from the same analytics the campaign runs on." },
    ],
    outcomes: [
      { title: "Less campaign administration", text: "Setup and day-to-day management collapse into one workflow instead of a per-client stack." },
      { title: "More consistent client workflows", text: "Every account runs the same steps, so quality does not depend on who is staffed on it." },
      { title: "Better visibility", text: "One place to see what is live, what is sending and where replies are waiting." },
      { title: "Centralized conversations", text: "No more hunting through client mailboxes to find the thread you need." },
    ],
    before: [
      "A different tool stack per client",
      "Mailboxes tracked in a spreadsheet",
      "Replies scattered across inboxes",
      "Manual month-end reporting",
    ],
    after: [
      "One workspace per client, one login",
      "Sending accounts managed centrally",
      "Every reply in a shared inbox",
      "Reporting straight from campaign data",
    ],
    faqs: [
      { q: "Can I manage outreach for multiple clients?", a: "Yes. Each client gets its own workspace with separate leads, campaigns, sending accounts, conversations and analytics, and you switch between them from one account." },
      { q: "Can I manage multiple sending accounts?", a: "Yes. You can connect several mailboxes per client, set a daily limit for each and see health and warmup status for all of them in one screen." },
      { q: "Can I organize campaigns by client?", a: "Campaigns belong to the workspace they are created in, so client work never mixes. Inside a workspace you can run as many campaigns as the account needs." },
      { q: "Can I manage client replies?", a: "All replies land in the unified inbox for that workspace, with the full thread, the prospect record and any notes your team added." },
      { q: "Can I track campaign performance?", a: "Analytics cover sends, deliveries, replies, positive replies and unsubscribes per campaign, plus performance per sending account." },
      { q: "Can I create separate campaigns for different clients?", a: "Yes, and they stay isolated. Separate campaigns can also use separate sending accounts and separate schedules." },
      { q: "Can I manage leads for different campaigns?", a: "Leads are imported and segmented per workspace, and you decide which segment feeds which campaign. Duplicates and suppressed contacts are filtered before launch." },
      { q: "How does MunchReach fit into an agency workflow?", a: "Most agencies use it as the operating layer for delivery: strategy and copy stay with your team, while list management, sending, follow-ups, replies and reporting run inside MunchReach." },
    ],
    ctaTitle: "Ready to simplify client outreach?",
    ctaDescription: "Create your first workspace, load a client campaign, and run the whole operation from one place.",
  },

  {
    slug: "sales-teams",
    nav: "Sales Teams",
    navText: "One place for your team to run outbound.",
    eyebrow: "For sales teams",
    title: "Give Your Sales Team One Place",
    highlight: "to Run Outbound",
    description:
      "Build campaigns, manage prospects, follow up consistently, and keep sales conversations organized without jumping between disconnected tools.",
    heroBenefits: [
      "Shared sequences every rep can follow",
      "Follow-ups that stop on reply",
      "A shared inbox for every conversation",
    ],
    seoTitle: "Cold Outreach Platform for Sales Teams | MunchReach",
    seoDescription:
      "A cold outreach platform for sales teams: shared sequences, automated follow-ups, a unified inbox, CRM stages and campaign analytics in one workspace.",
    problemHeading: "Still piecing together your outbound process across multiple tools?",
    problemIntro:
      "Most sales teams do not lack activity. They lack one place where prospecting, sending, following up and replying belong to the same process.",
    problemItems: [
      { title: "Prospect data", text: "Lists live in exports, personal spreadsheets and half-updated CRM records, so nobody trusts the data enough to work it." },
      { title: "Campaign management", text: "Each rep builds their own version of the same sequence, and results cannot be compared because nothing is standard." },
      { title: "Follow-ups", text: "The second and third touches are where replies come from, and they are the first thing to disappear when a rep gets busy." },
      { title: "Inbox", text: "Answers arrive in individual mailboxes, so a manager cannot see which conversations are still open." },
      { title: "CRM", text: "Updating stages is manual, so pipeline reviews are based on memory rather than the actual state of conversations." },
      { title: "Reporting", text: "Nobody can say which message created the meeting, so coaching turns into opinion instead of evidence." },
    ],
    solutionHeading: "One outbound workflow the whole team runs",
    solutionIntro:
      "MunchReach connects leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics, CRM and automations. Reps get one screen for the day, and managers get one place to see the state of outbound.",
    pillars: [
      { icon: Workflow, title: "Standard sequences", text: "One proven motion the whole team runs, instead of a personal version per rep." },
      { icon: Repeat, title: "Follow-up on autopilot", text: "Steps continue on schedule and stop the moment a prospect replies." },
      { icon: Inbox, title: "Shared inbox", text: "Assign conversations, add notes and keep every answer visible to the team." },
      { icon: Target, title: "CRM stages", text: "Move prospects from replied to meeting to won without leaving the conversation." },
      { icon: LineChart, title: "Team analytics", text: "See activity and reply performance per campaign and per rep." },
    ],
    featuresHeading: "Give your reps a workflow they can actually follow",
    featuresIntro: "Everything a rep touches in a day, in one place, with the manager view built in.",
    features: [
      { icon: Filter, title: "Targeted prospecting", text: "Import and segment accounts by role, industry or region so each campaign talks to one clear audience." },
      { icon: Workflow, title: "Sequences", text: "Multi-step sequences with personalization variables and safe fallbacks on every send." },
      { icon: Repeat, title: "Automated follow-ups", text: "Timed follow-ups that pause automatically when someone answers, bounces or unsubscribes." },
      { icon: Inbox, title: "Unified inbox", text: "All replies from all campaigns and mailboxes in one thread view your team shares." },
      { icon: Users, title: "CRM workflow", text: "Statuses, owners and notes on the prospect record, updated as conversations progress." },
      { icon: BarChart3, title: "Analytics", text: "Reply and positive-reply performance per campaign so you can coach on real numbers." },
    ],
    workflowHeading: "How a sales team runs MunchReach",
    workflowIntro: "From the profile you sell to, through to the opportunity in your pipeline.",
    workflow: [
      { title: "ICP", text: "Agree the profile worth contacting this quarter." },
      { title: "Prospects", text: "Import the accounts and segment them for the team." },
      { title: "Sequence", text: "Build one sequence everyone runs." },
      { title: "Follow-up", text: "Let scheduled touches do the chasing." },
      { title: "Replies", text: "Work answers together from the shared inbox." },
      { title: "CRM", text: "Move the conversation through your stages." },
    ],
    outcomes: [
      { title: "Less manual follow-up", text: "Reps stop maintaining reminder lists and spend the time on live conversations." },
      { title: "Better prospect organization", text: "One clean source of prospect data instead of exports on desktops." },
      { title: "More consistent outreach", text: "Every account gets the same number of touches, whatever the week looks like." },
      { title: "Clearer visibility", text: "Managers can see activity, replies and open conversations without asking for an update." },
    ],
    before: [
      "Every rep with their own process",
      "Follow-ups tracked by memory",
      "Replies hidden in personal mailboxes",
      "Pipeline reviews based on recall",
    ],
    after: [
      "One sequence the team shares",
      "Scheduled follow-ups that stop on reply",
      "A shared inbox for every answer",
      "Stages updated from real conversations",
    ],
    faqs: [
      { q: "Can several reps work the same campaign?", a: "Yes. Invite your team to the workspace, assign replies and keep shared notes on every conversation." },
      { q: "Do follow-ups stop when a prospect replies?", a: "Automatically. The remaining steps are cancelled as soon as a reply, bounce or unsubscribe is detected." },
      { q: "Can I see which rep is working which conversation?", a: "Conversations can be assigned in the unified inbox, and the owner is visible on the thread and on the prospect record." },
      { q: "Can I standardize messaging across the team?", a: "Save templates and sequences at workspace level so every rep launches from the same approved copy." },
      { q: "How do prospects get into MunchReach?", a: "Import a CSV and map your columns, or push leads in through the API. Duplicates and suppressed contacts are filtered before a campaign launches." },
      { q: "Can I track stages like a CRM?", a: "Yes. Each prospect carries a status you can move through your own pipeline stages, updated from the inbox as conversations develop." },
      { q: "Can I compare two different messages?", a: "Run separate campaigns against comparable segments and compare reply and positive-reply rates side by side." },
      { q: "Does every rep need their own mailbox?", a: "Not necessarily. You can send from shared mailboxes or connect one per rep, with independent daily limits on each." },
    ],
    ctaTitle: "Ready to give your team a better outbound workflow?",
    ctaDescription: "Set up your workspace, load your first sequence and let the whole team work from one screen.",
  },

  {
    slug: "lead-generation",
    nav: "Lead Generation",
    navText: "Run more campaigns with less admin.",
    eyebrow: "For lead generation",
    title: "Run More Outreach Campaigns",
    highlight: "Without More Operational Work",
    description:
      "Manage prospect lists, campaigns, sending accounts, replies, and performance from one centralized outbound platform.",
    heroBenefits: [
      "Large list imports with dedupe",
      "Scheduling and limits per campaign",
      "Reply handling in one inbox",
    ],
    seoTitle: "Lead Generation Outreach Platform | MunchReach",
    seoDescription:
      "A lead generation outreach platform for managing large prospect lists, multiple campaigns, sending accounts, scheduling, replies and reporting in one place.",
    problemHeading: "Still spending more time managing campaigns than generating opportunities?",
    problemIntro:
      "Lead generation is a volume business, and volume is exactly what breaks a stack held together by spreadsheets and manual steps.",
    problemItems: [
      { title: "Large lead lists", text: "Tens of thousands of rows, inconsistent columns, duplicates across sources — and cleaning happens by hand before every launch." },
      { title: "Multiple campaigns", text: "Several campaigns run at once across segments and offers, and keeping track of what is live becomes guesswork." },
      { title: "Sending accounts", text: "More volume means more mailboxes, and each one needs limits, warmup and monitoring." },
      { title: "Scheduling", text: "Time zones, sending windows and daily caps have to line up, or the day's volume never actually goes out." },
      { title: "Reporting", text: "Comparing segments means exporting from several places and rebuilding the same sheet each week." },
      { title: "Reply management", text: "Replies arrive faster than anyone can triage them, and the interesting ones get buried." },
    ],
    solutionHeading: "Campaign operations, centralized",
    solutionIntro:
      "Leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics, CRM and automations run inside one system, so adding another campaign does not mean adding another process.",
    pillars: [
      { icon: Users, title: "List operations", text: "Bulk import with field mapping, duplicate filtering and suppression handling." },
      { icon: CalendarClock, title: "Scheduling control", text: "Sending windows, daily caps and per-hour limits set per campaign and per mailbox." },
      { icon: Send, title: "Sending capacity", text: "Distribute volume across every connected account with health and warmup visibility." },
      { icon: Inbox, title: "Reply triage", text: "Classify answers as interested, not now or unsubscribe and act on them from one screen." },
      { icon: BarChart3, title: "Segment performance", text: "See which lists, segments and messages actually create conversations." },
    ],
    featuresHeading: "Scale campaign operations without scaling the chaos",
    featuresIntro: "Built for teams that run many campaigns at once and need the operational side to stay boring.",
    features: [
      { icon: Users, title: "Large lead lists", text: "Import big CSVs, map your own columns and let duplicates and suppressed addresses be filtered automatically." },
      { icon: Layers, title: "Campaign management", text: "Run many campaigns side by side with clear status, volume and progress on each." },
      { icon: Mail, title: "Sending account management", text: "Add mailboxes, set limits, monitor health and keep capacity ahead of planned volume." },
      { icon: CalendarClock, title: "Scheduling", text: "Per-campaign sending windows, time zones, daily caps and delays between sends." },
      { icon: Inbox, title: "Unified inbox", text: "Every reply across every campaign in one place, ready to triage and route." },
      { icon: LineChart, title: "Reporting and analytics", text: "Delivery, reply and positive-reply performance by campaign, segment and mailbox." },
    ],
    workflowHeading: "How a lead gen team runs MunchReach",
    workflowIntro: "The operating loop behind consistent campaign output.",
    workflow: [
      { title: "Lead list", text: "Import, clean and segment the source data." },
      { title: "Campaigns", text: "Create one campaign per segment or offer." },
      { title: "Sending accounts", text: "Assign mailboxes and confirm capacity." },
      { title: "Scheduling", text: "Set windows, caps and delays for the week." },
      { title: "Replies", text: "Triage answers and route the interesting ones." },
      { title: "Reporting", text: "Compare segments and feed the next batch." },
    ],
    outcomes: [
      { title: "Less operational overhead", text: "Cleaning, scheduling and monitoring happen inside the platform instead of around it." },
      { title: "More organized campaigns", text: "Every campaign has a clear segment, sequence, schedule and owner." },
      { title: "Centralized lead management", text: "One source of prospect data feeding every campaign you run." },
      { title: "Better campaign visibility", text: "Volume, delivery and replies visible per campaign without an export." },
    ],
    before: [
      "Manual list cleaning before every launch",
      "Sending capacity tracked by hand",
      "Replies triaged across mailboxes",
      "Weekly reporting rebuilt from exports",
    ],
    after: [
      "Import, map and dedupe in one step",
      "Capacity and limits visible per account",
      "One inbox for every campaign's replies",
      "Segment performance available on demand",
    ],
    faqs: [
      { q: "Can I import large lists?", a: "Yes. Upload a CSV, map your columns, and duplicates plus suppressed contacts are filtered before the campaign launches." },
      { q: "How many campaigns can run at once?", a: "You can run multiple campaigns in parallel; the practical limit is the sending capacity of the mailboxes you have connected." },
      { q: "Can different campaigns use different sending accounts?", a: "Yes. Each campaign is assigned the accounts it should send from, with its own daily limits." },
      { q: "Can I control sending windows and daily volume?", a: "Every campaign has a time zone, a sending window, a daily cap, an hourly maximum and a delay range between sends." },
      { q: "How are unsubscribes handled?", a: "Unsubscribes are suppressed automatically and excluded from future campaigns in that workspace." },
      { q: "Can I compare performance between segments?", a: "Run a campaign per segment and compare delivery, reply and positive-reply rates in analytics." },
      { q: "Can I feed leads in from another system?", a: "Yes, through CSV import or the API, so an enrichment or scraping workflow can push prospects in directly." },
      { q: "What happens when a prospect replies?", a: "Remaining follow-ups stop for that prospect and the conversation appears in the unified inbox for triage." },
    ],
    ctaTitle: "Ready to run more campaigns with less operational work?",
    ctaDescription: "Import your first list, set your schedule, and let the platform handle the moving parts.",
  },

  {
    slug: "recruiting",
    nav: "Recruiting",
    navText: "A repeatable outreach engine for hiring.",
    eyebrow: "For recruiting",
    title: "Build a Repeatable Outreach Engine",
    highlight: "for Recruiting",
    description:
      "Organize outreach, manage sequences, follow up consistently, and keep recruiting conversations moving from one workspace.",
    heroBenefits: [
      "One campaign per role",
      "Follow-ups that keep candidates warm",
      "Shared visibility across recruiters",
    ],
    seoTitle: "Recruiting Outreach Platform | MunchReach",
    seoDescription:
      "A recruiting outreach platform for candidate and client outreach: organized prospect lists, sequences, follow-ups, a shared inbox and campaign visibility.",
    problemHeading: "Still managing outreach from spreadsheets, inboxes, and disconnected tools?",
    problemIntro:
      "Recruiting outreach is high volume and high touch at the same time, which is exactly where a manual process starts leaking candidates.",
    problemItems: [
      { title: "Candidate and prospect organization", text: "Shortlists live in sheets per role, and it is never clear who has already been contacted for which vacancy." },
      { title: "Follow-ups", text: "The best candidates answer on the second or third touch, and that is usually the touch nobody sends." },
      { title: "Multiple campaigns", text: "Several roles are open at once, each needing its own messaging, and they blur together in a single mailbox." },
      { title: "Conversations", text: "Threads sit in individual recruiter inboxes, so context disappears when someone is off." },
      { title: "Team visibility", text: "Nobody can see, at a glance, how much outreach a role has had this week or where it stalled." },
      { title: "Client outreach", text: "Business development for new clients competes with candidate outreach for the same limited time." },
    ],
    solutionHeading: "One workspace for candidate and client outreach",
    solutionIntro:
      "Leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics, CRM and automations sit together, so a role's outreach is a campaign rather than a personal to-do list.",
    pillars: [
      { icon: ClipboardList, title: "Role-based campaigns", text: "One campaign per vacancy, with its own list, messaging and cadence." },
      { icon: Repeat, title: "Consistent follow-up", text: "Scheduled touches keep interested candidates warm without manual chasing." },
      { icon: Inbox, title: "Shared conversations", text: "Every recruiter can see the full history on a candidate or client thread." },
      { icon: Target, title: "Pipeline stages", text: "Track contacts from first outreach through to placement using your own statuses." },
      { icon: LineChart, title: "Role-level visibility", text: "See outreach volume and responses per role, not just per recruiter." },
    ],
    featuresHeading: "A better workflow for recruiting outreach",
    featuresIntro: "Designed for teams filling several roles at once while still developing new client relationships.",
    features: [
      { icon: Users, title: "Prospect organization", text: "Import candidate or client lists per role and keep them tidy with duplicate filtering." },
      { icon: Filter, title: "Segmentation", text: "Split lists by skill, seniority, location or industry so messaging stays relevant." },
      { icon: Workflow, title: "Sequences", text: "Role-specific sequences with personalization that reads like a recruiter wrote it." },
      { icon: Repeat, title: "Follow-ups", text: "Timed touches that stop as soon as a candidate replies or asks to be removed." },
      { icon: Inbox, title: "Conversations", text: "A shared inbox where any recruiter can pick up a thread with full context." },
      { icon: BarChart3, title: "Campaign visibility", text: "See which roles are getting traction and which messaging is landing." },
    ],
    workflowHeading: "How a recruiting team runs MunchReach",
    workflowIntro: "One loop per role, repeated for every vacancy on the desk.",
    workflow: [
      { title: "Target", text: "Define the profile for the role or the client you want." },
      { title: "Prospects", text: "Build and import the shortlist." },
      { title: "Outreach", text: "Launch the role-specific sequence." },
      { title: "Follow-up", text: "Let scheduled touches keep the role visible." },
      { title: "Replies", text: "Work answers from the shared inbox." },
      { title: "Conversation", text: "Move interested people into your process." },
    ],
    outcomes: [
      { title: "More organized outreach", text: "Every role has its own list, sequence and record of what was sent." },
      { title: "Consistent follow-up", text: "Candidates get the second and third touch even on a busy week." },
      { title: "Centralized conversations", text: "Threads belong to the team, not to one recruiter's mailbox." },
      { title: "Better campaign visibility", text: "See where a role's outreach stands without asking for a status update." },
    ],
    before: [
      "A spreadsheet per open role",
      "Follow-ups sent when someone remembers",
      "Threads locked in personal inboxes",
      "No shared view of outreach volume",
    ],
    after: [
      "A campaign per role with its own list",
      "Scheduled follow-ups that stop on reply",
      "A shared inbox with full history",
      "Visible outreach and response per role",
    ],
    faqs: [
      { q: "Can I run candidate and client outreach separately?", a: "Yes. Use separate campaigns, or separate workspaces if you want fully isolated lists and reporting." },
      { q: "Can I run one campaign per vacancy?", a: "That is the usual setup: one campaign per role, with its own shortlist, sequence and schedule." },
      { q: "Does outreach stop when someone answers?", a: "Yes, remaining follow-ups are cancelled for that person as soon as they reply." },
      { q: "Can several recruiters share the same conversations?", a: "The unified inbox is shared at workspace level, so any recruiter can see the full thread and continue it." },
      { q: "Can I personalize messages per candidate?", a: "Use variables from your imported fields, with fallbacks so a missing value never leaves a gap in the email." },
      { q: "How do I avoid contacting the same person for two roles?", a: "Duplicate filtering runs on import, and suppressed or already-contacted addresses can be excluded before launch." },
      { q: "Can I see which roles are getting responses?", a: "Analytics show reply and positive-reply performance per campaign, which maps to per role in the usual setup." },
      { q: "Can candidates unsubscribe?", a: "Yes. Unsubscribes are honoured automatically and the address is suppressed for future campaigns." },
    ],
    ctaTitle: "Ready to build a more consistent recruiting outreach process?",
    ctaDescription: "Create a campaign for your hardest role and let the follow-ups run themselves.",
  },

  {
    slug: "saas",
    nav: "SaaS",
    navText: "A repeatable outbound engine for SaaS.",
    eyebrow: "For SaaS",
    title: "Build a Repeatable Outbound Engine",
    highlight: "for Your SaaS",
    description:
      "Turn your ideal customer profile into repeatable outbound campaigns with organized prospecting, follow-ups, conversations, and campaign visibility.",
    heroBenefits: [
      "ICP-focused campaigns",
      "Message testing across segments",
      "Demos tracked from reply to pipeline",
    ],
    seoTitle: "SaaS Outbound Sales Platform | MunchReach",
    seoDescription:
      "A SaaS outbound sales platform: turn your ICP into repeatable campaigns with sequences, follow-ups, a unified inbox, CRM stages and campaign analytics.",
    problemHeading: "Still relying heavily on inbound while outbound remains inconsistent?",
    problemIntro:
      "Inbound is unpredictable and outbound only compounds when it runs every week. Most SaaS teams stall because outbound depends on whoever has spare time.",
    problemItems: [
      { title: "ICP targeting", text: "The profile is described in a doc rather than encoded in lists, so every campaign targets a slightly different audience." },
      { title: "Prospecting", text: "Account research happens in bursts, and the list goes stale before anyone contacts it." },
      { title: "Sequences", text: "Messaging changes every run, so there is no baseline to improve against." },
      { title: "Follow-ups", text: "The first email goes out, the follow-ups do not, and the campaign is judged on a single touch." },
      { title: "Replies", text: "Demo requests arrive in one founder's inbox and are worked between everything else." },
      { title: "Performance", text: "Nobody can point to which sequence created which pipeline, so investment decisions are guesses." },
    ],
    solutionHeading: "Outbound as a system, not a side project",
    solutionIntro:
      "MunchReach connects leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics, CRM and automations, so outbound keeps running whether or not this week is busy.",
    pillars: [
      { icon: Target, title: "ICP in the product", text: "Segments built from your own fields turn the profile into lists you can actually run." },
      { icon: Sparkles, title: "Positioning tests", text: "Run two angles against comparable segments and let reply data settle the argument." },
      { icon: Repeat, title: "Always-on follow-up", text: "Sequences continue on schedule and halt the moment a prospect answers." },
      { icon: Inbox, title: "Demo requests in one place", text: "Every reply lands in the unified inbox with the full conversation attached." },
      { icon: LineChart, title: "Campaign attribution", text: "See which campaign and message created the conversations you care about." },
    ],
    featuresHeading: "Build a repeatable outbound pipeline",
    featuresIntro: "The pieces a product team needs to run outbound without hiring an operations function first.",
    features: [
      { icon: Target, title: "ICP-focused campaigns", text: "One campaign per segment of your ideal customer profile, with messaging matched to it." },
      { icon: Users, title: "Prospect organization", text: "Import target accounts, map your fields and keep segments ready for the next test." },
      { icon: Workflow, title: "Sequences", text: "Multi-step sequences with personalization variables and fallbacks." },
      { icon: Repeat, title: "Follow-ups", text: "Automatic touches that stop on reply, bounce or unsubscribe." },
      { icon: Inbox, title: "Reply management", text: "A unified inbox where demo requests and objections are worked in one pass." },
      { icon: BarChart3, title: "Analytics", text: "Delivery, reply and positive-reply rates per campaign and per message." },
    ],
    workflowHeading: "How a SaaS team runs MunchReach",
    workflowIntro: "From profile to pipeline, in a loop you can repeat every month.",
    workflow: [
      { title: "ICP", text: "Write down who the product is for, precisely." },
      { title: "Target accounts", text: "Import the companies and contacts that match." },
      { title: "Campaign", text: "Create a campaign per segment or angle." },
      { title: "Sequence", text: "Opener plus follow-ups, personalized from your fields." },
      { title: "Replies", text: "Work answers and book demos from the inbox." },
      { title: "CRM", text: "Track the conversation through your stages." },
    ],
    outcomes: [
      { title: "Repeatable outbound process", text: "The same loop runs every month instead of restarting from scratch." },
      { title: "Better prospect organization", text: "Target accounts live in segments you can reuse and refine." },
      { title: "Centralized conversations", text: "Demo requests and objections in one shared inbox." },
      { title: "Clearer campaign performance", text: "Reply data per message, so positioning decisions have evidence behind them." },
    ],
    before: [
      "Outbound whenever someone has time",
      "A new message every run",
      "Demo requests in a personal inbox",
      "No link between campaign and pipeline",
    ],
    after: [
      "A scheduled outbound loop",
      "Two angles tested against each other",
      "Every reply in the shared inbox",
      "Campaign performance you can act on",
    ],
    faqs: [
      { q: "Can I test two different pitches?", a: "Yes. Run parallel campaigns against comparable segments and compare reply and positive-reply rates." },
      { q: "Will this take engineering time?", a: "No. There is nothing to deploy or host; sending, scheduling and warmup are handled inside the platform." },
      { q: "Can I start with a small volume?", a: "Yes. Set a low daily cap while your sending accounts warm up and increase it as the campaign settles." },
      { q: "Can I connect MunchReach to other systems?", a: "The API lets you push prospects in and pull campaign data out, so it can sit alongside your existing stack." },
      { q: "How do I keep messaging relevant per segment?", a: "Use variables from your imported fields and run separate campaigns per segment rather than one generic blast." },
      { q: "What happens after someone replies?", a: "Follow-ups stop for that prospect, the conversation appears in the unified inbox and you can move their status as the deal progresses." },
      { q: "Can more than one person work outbound?", a: "Yes. Invite your team to the workspace and share the inbox, campaigns and prospect records." },
      { q: "Can I see which campaign created a conversation?", a: "Analytics attribute replies and positive replies to the campaign and message that produced them." },
    ],
    ctaTitle: "Ready to build your outbound engine?",
    ctaDescription: "Load your ICP list, launch two angles, and let reply data tell you what to scale.",
  },

  {
    slug: "consultants",
    nav: "Consultants",
    navText: "A consistent system for finding clients.",
    eyebrow: "For consultants",
    title: "Spend Less Time Finding Clients.",
    highlight: "More Time Serving Them.",
    description:
      "Build a consistent outbound workflow for finding relevant prospects, starting conversations, managing follow-ups, and developing new opportunities.",
    heroBenefits: [
      "A small, steady daily volume",
      "Follow-ups handled for you",
      "Every conversation in one thread",
    ],
    seoTitle: "Cold Outreach for Consultants | MunchReach",
    seoDescription:
      "Cold outreach for consultants: build target client lists, send personalized sequences, follow up automatically and track opportunities from one workspace.",
    problemHeading: "Still spending too much time finding the next client?",
    problemIntro:
      "Independent consulting runs on a simple tension: the weeks you are busiest delivering are the weeks no outreach happens, and that is what creates the gap two months later.",
    problemItems: [
      { title: "Prospect research", text: "Finding the right companies takes real time, and it is the first thing that gets dropped during delivery." },
      { title: "List management", text: "Contacts end up in old spreadsheets, notes and email threads with no single view of who you approached." },
      { title: "Outreach", text: "Sending individually written emails does not scale beyond a handful a week." },
      { title: "Follow-ups", text: "Warm prospects go quiet and never get the polite second email that would have restarted the conversation." },
      { title: "Conversations", text: "Threads disappear into a personal mailbox alongside client work and admin." },
      { title: "Opportunity tracking", text: "Without a light pipeline view, it is impossible to say how much work is actually in play." },
    ],
    solutionHeading: "A quiet, steady client acquisition routine",
    solutionIntro:
      "Leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics and a light CRM run in one place — designed so a one-person business can keep outreach going during delivery weeks.",
    pillars: [
      { icon: Clock, title: "Low daily volume", text: "A handful of well-targeted emails a day rather than an occasional blast." },
      { icon: Sparkles, title: "Personal tone", text: "Variables and fallbacks keep messages specific without writing each one by hand." },
      { icon: Repeat, title: "Follow-up handled", text: "Two or three scheduled touches that stop the moment someone replies." },
      { icon: Inbox, title: "One thread per prospect", text: "Every message and note about a prospect in one place you can scan quickly." },
      { icon: Target, title: "Light pipeline", text: "Simple statuses so you know how many real conversations are open." },
    ],
    featuresHeading: "Build a consistent system for finding new clients",
    featuresIntro: "Everything a solo consultant or small practice needs, and nothing that requires an operations team.",
    features: [
      { icon: Search, title: "Target client lists", text: "Build and import lists of the companies you actually want to work with." },
      { icon: Workflow, title: "Campaign creation", text: "One clear introduction plus follow-ups, set up in an afternoon." },
      { icon: Repeat, title: "Follow-ups", text: "Scheduled touches that keep the conversation alive without nagging." },
      { icon: Inbox, title: "Inbox", text: "Replies, notes and history for each prospect in a single view." },
      { icon: Users, title: "CRM", text: "Track prospects from contacted to proposal to signed with simple statuses." },
      { icon: LineChart, title: "Performance tracking", text: "See how many conversations your outreach actually started this month." },
    ],
    workflowHeading: "How a consultant runs MunchReach",
    workflowIntro: "A routine that keeps working while you are busy on client projects.",
    workflow: [
      { title: "Ideal client", text: "Describe the engagement you want more of." },
      { title: "Prospects", text: "Collect the companies that fit and import them." },
      { title: "Outreach", text: "Send a short, specific introduction." },
      { title: "Follow-up", text: "Two or three scheduled touches, then stop." },
      { title: "Replies", text: "Answer from the inbox and book the call." },
      { title: "Opportunity", text: "Track the conversation through to signed." },
    ],
    outcomes: [
      { title: "Less manual prospecting", text: "Outreach continues on schedule instead of waiting for a free afternoon." },
      { title: "Consistent follow-up", text: "Interested prospects get a second touch even during delivery weeks." },
      { title: "Centralized conversations", text: "Client development threads separate from your day-to-day mailbox noise." },
      { title: "Better visibility", text: "A clear view of how many conversations are open and where each one stands." },
    ],
    before: [
      "Outreach only when work runs out",
      "Prospects tracked in scattered notes",
      "Follow-ups forgotten",
      "No sense of the real pipeline",
    ],
    after: [
      "A steady daily send volume",
      "One list of target clients",
      "Scheduled follow-ups that stop on reply",
      "Simple, honest pipeline visibility",
    ],
    faqs: [
      { q: "Is this useful for a one-person business?", a: "Yes. A small daily volume with automatic follow-ups is exactly the setup a solo consultant needs." },
      { q: "How much time does it take to run?", a: "Setup usually takes an afternoon. After that most of the time goes into replying to conversations." },
      { q: "Will the emails still feel personal?", a: "You write the message; variables fill in specifics from your list, with fallbacks so nothing reads like a broken template." },
      { q: "Can I keep the volume low?", a: "Set a daily cap as low as you like and the campaign will pace itself over the days you choose." },
      { q: "Do I need my own email infrastructure?", a: "No. Sending, scheduling and warmup are handled inside MunchReach; you connect a mailbox and write the message." },
      { q: "Can I pause a campaign while I am delivering?", a: "Yes. Pause and resume at any time; scheduled messages stop until you restart." },
      { q: "How do I track opportunities?", a: "Each prospect carries a status you move as the conversation develops, giving you a light pipeline without a full CRM." },
      { q: "What happens if someone asks not to be contacted?", a: "Unsubscribes are honoured automatically and that address is suppressed from future campaigns." },
    ],
    ctaTitle: "Ready to build a more consistent client acquisition system?",
    ctaDescription: "Set up one campaign this week and let it keep working while you deliver.",
  },

  {
    slug: "founders",
    nav: "Founders",
    navText: "Outbound without a complicated sales stack.",
    eyebrow: "For founders",
    title: "Build Your Outbound Engine",
    highlight: "Without a Complicated Sales Stack",
    description:
      "Find prospects, launch campaigns, manage conversations, and understand what's working from one place — without building a complicated sales operation.",
    heroBenefits: [
      "Live in an afternoon",
      "No infrastructure to configure",
      "Conversations and pipeline in one view",
    ],
    seoTitle: "Cold Outreach Platform for Founders | MunchReach",
    seoDescription:
      "A cold outreach platform for founders: launch campaigns, automate follow-ups, manage replies and see what is working without building a sales operation.",
    problemHeading: "Still doing outbound manually between everything else you have to run?",
    problemIntro:
      "Founder-led outbound works — right up to the point where product, hiring and customers take the week, and the sending stops.",
    problemItems: [
      { title: "Limited time", text: "Outreach competes with every other job you own, so it happens in bursts and then stops for a month." },
      { title: "Manual prospecting", text: "Finding contacts one at a time is slow, and the list you built in January is already out of date." },
      { title: "Campaign setup", text: "Evaluating tools, connecting domains and configuring sending is a project on its own before a single email goes out." },
      { title: "Follow-up", text: "You know the replies come from touch two and three, and those are the ones that never get sent." },
      { title: "Reply management", text: "Answers mix into the same inbox as investors, support and suppliers, and some go cold." },
      { title: "Lack of visibility", text: "Without numbers you cannot tell whether outbound is not working or simply not running." },
    ],
    solutionHeading: "The whole outbound loop in one place",
    solutionIntro:
      "Leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics, CRM and automations, set up once, so outbound keeps going on the weeks you cannot touch it.",
    pillars: [
      { icon: Clock, title: "Set up in an afternoon", text: "Import a list, write a sequence, connect a mailbox and launch." },
      { icon: ShieldCheck, title: "No infrastructure work", text: "Scheduling, throttling and warmup are handled for you." },
      { icon: Repeat, title: "Follow-ups by default", text: "Touch two and three happen without you remembering them." },
      { icon: Inbox, title: "Outbound replies separated", text: "Prospect conversations in their own inbox, away from everything else." },
      { icon: LineChart, title: "Straight answers", text: "Simple numbers on sends, replies and positive replies so you know where you stand." },
    ],
    featuresHeading: "Everything you need without a complicated sales stack",
    featuresIntro: "The short list of things founder-led outbound actually depends on.",
    features: [
      { icon: Users, title: "Prospect management", text: "Import your target list, map fields and keep it in one place you can reuse." },
      { icon: Workflow, title: "Simple campaign setup", text: "Create a campaign, pick the audience, set the schedule and launch." },
      { icon: Megaphone, title: "Sequences", text: "An opener and a couple of follow-ups, personalized from your own data." },
      { icon: Repeat, title: "Follow-ups", text: "Scheduled touches that stop the moment someone answers." },
      { icon: Inbox, title: "Unified inbox", text: "Every prospect reply in one thread view, separate from your main mailbox." },
      { icon: BarChart3, title: "Analytics", text: "Sends, deliveries, replies and positive replies, without a reporting project." },
    ],
    workflowHeading: "How a founder runs MunchReach",
    workflowIntro: "Set it up once, then spend your outbound time on conversations instead of admin.",
    workflow: [
      { title: "Target market", text: "Decide who you want to talk to this quarter." },
      { title: "Leads", text: "Import the list and clean it on the way in." },
      { title: "Campaign", text: "One sequence, one audience, one schedule." },
      { title: "Follow-ups", text: "Let the scheduled touches do the chasing." },
      { title: "Replies", text: "Work answers from the inbox between other jobs." },
      { title: "Pipeline", text: "Track which conversations turn into real deals." },
    ],
    outcomes: [
      { title: "Less operational overhead", text: "No stack to assemble and no infrastructure to maintain." },
      { title: "Simpler outbound workflow", text: "One screen for prospects, campaigns, replies and numbers." },
      { title: "Centralized conversations", text: "Prospect threads separated from the noise of a founder inbox." },
      { title: "Better visibility", text: "You can tell whether outbound is working, and act on it." },
    ],
    before: [
      "Outbound in bursts, then silence",
      "Contacts spread across tools",
      "Follow-ups skipped",
      "No numbers to judge it by",
    ],
    after: [
      "A campaign that keeps running",
      "One prospect list you reuse",
      "Follow-ups on schedule",
      "Clear reply performance",
    ],
    faqs: [
      { q: "How long does it take to get started?", a: "Most founders are live the same day: import a list, write a short sequence, connect a mailbox and launch." },
      { q: "Do I need technical setup?", a: "No. Sending, scheduling and warmup are handled inside the platform, so there is nothing to host or configure." },
      { q: "Can I run this alongside everything else?", a: "That is the point. Once a campaign is live, your only regular job is answering replies." },
      { q: "Can I start small?", a: "Yes. A low daily cap is often the right start, and you can raise it as your sending accounts settle." },
      { q: "Where do replies go?", a: "Into the unified inbox, separate from your general mailbox, with the full thread and prospect record attached." },
      { q: "Can I add my team later?", a: "Yes. Invite people to the workspace when you hire, and they inherit the same campaigns, inbox and data." },
      { q: "What if the message is not working?", a: "Change the sequence and relaunch, or run two versions against comparable segments and compare reply rates." },
      { q: "Can I pause everything if I need to?", a: "Campaigns can be paused and resumed at any time without losing your list or history." },
    ],
    ctaTitle: "Ready to take outbound off your manual to-do list?",
    ctaDescription: "Launch your first campaign today and let follow-ups run while you build.",
  },

  {
    slug: "marketing-agencies",
    nav: "Marketing Agencies",
    navText: "A repeatable client acquisition engine.",
    eyebrow: "For marketing agencies",
    title: "Turn Your Agency's Expertise Into",
    highlight: "a Repeatable Outreach Engine",
    description:
      "Build targeted campaigns, manage prospects, follow up consistently, and keep client acquisition organized from one platform.",
    heroBenefits: [
      "One acquisition playbook, reused",
      "Client and own-pipeline campaigns",
      "Reporting straight from the product",
    ],
    seoTitle: "Cold Email Platform for Marketing Agencies | MunchReach",
    seoDescription:
      "A cold email platform for marketing agencies: repeatable client acquisition campaigns, targeted lead lists, sending accounts, a unified inbox and analytics.",
    problemHeading: "Still rebuilding the same acquisition workflow for every client?",
    problemIntro:
      "Marketing agencies know how to build campaigns. The bottleneck is the operational layer underneath them, rebuilt from scratch each time a new logo signs.",
    problemItems: [
      { title: "Client campaigns", text: "Every engagement starts with the same setup work, and none of it carries over to the next one." },
      { title: "Lead organization", text: "Audience lists arrive from research, exports and scrapes in different shapes, and cleaning them is manual." },
      { title: "Sending accounts", text: "Each client brings mailboxes and domains that need limits, warmup and monitoring." },
      { title: "Follow-ups", text: "The multi-touch plan in the proposal does not survive contact with a busy delivery week." },
      { title: "Reporting", text: "Clients expect clear numbers, and building them by hand each month eats profit on the retainer." },
      { title: "Campaign management", text: "Knowing what is live for whom requires asking three people and opening five tabs." },
    ],
    solutionHeading: "One platform behind every client engagement",
    solutionIntro:
      "Leads, campaigns, sequences, sending accounts, scheduling, warmup, the unified inbox, replies, analytics, CRM and automations run in one workspace per client, so your playbook becomes a product you deliver rather than a process you rebuild.",
    pillars: [
      { icon: Building2, title: "Workspace per client", text: "Complete separation of lists, campaigns, mailboxes, conversations and reporting." },
      { icon: Repeat, title: "Playbook reuse", text: "Save the sequence, schedule and segment structure that works and deploy it again." },
      { icon: Send, title: "Sending managed centrally", text: "Every mailbox you run for every client, with limits and health in one screen." },
      { icon: Inbox, title: "Conversations in one place", text: "Replies for each client grouped, assignable and easy to hand over." },
      { icon: BarChart3, title: "Reporting built in", text: "Campaign numbers that come from the campaign, ready to put in front of a client." },
    ],
    featuresHeading: "Turn your expertise into a repeatable acquisition process",
    featuresIntro: "What agency teams need to make client acquisition a delivery motion rather than a one-off build.",
    features: [
      { icon: Layers, title: "Client campaigns", text: "Campaigns scoped to a client workspace with their own audience, sequence and schedule." },
      { icon: Filter, title: "Targeted lead lists", text: "Import and segment audience data per client, with duplicate and suppression filtering." },
      { icon: Mail, title: "Sending account management", text: "Connect client mailboxes, set daily limits and keep warmup running in the background." },
      { icon: Workflow, title: "Sequences", text: "Multi-step sequences with personalization drawn from the client's own audience data." },
      { icon: Inbox, title: "Unified inbox", text: "One place for the team to work replies and pass conversations to the client." },
      { icon: LineChart, title: "Analytics", text: "Delivery, reply and positive-reply performance per campaign and per mailbox." },
    ],
    workflowHeading: "How a marketing agency runs MunchReach",
    workflowIntro: "The same delivery motion for every client you take on.",
    workflow: [
      { title: "Client", text: "Create the workspace and agree the offer." },
      { title: "Target market", text: "Define the audience worth contacting." },
      { title: "Leads", text: "Import and clean the audience data." },
      { title: "Campaign", text: "Deploy your proven sequence and schedule." },
      { title: "Sending accounts", text: "Connect and warm the client's mailboxes." },
      { title: "Replies", text: "Work conversations and hand over the good ones." },
      { title: "Reporting", text: "Report from live campaign analytics." },
    ],
    outcomes: [
      { title: "Repeatable acquisition workflows", text: "Your playbook is deployed rather than rebuilt for each engagement." },
      { title: "Less campaign administration", text: "Setup, scheduling and monitoring live in one system." },
      { title: "Centralized client outreach", text: "Every client's campaigns, mailboxes and replies in their own workspace." },
      { title: "Better campaign visibility", text: "What is live, what is sending and what is replying, without a status meeting." },
    ],
    before: [
      "A new setup for every client",
      "Audience data cleaned by hand",
      "Follow-up plans that slip",
      "Reports assembled manually",
    ],
    after: [
      "A deployable acquisition playbook",
      "Import, map and dedupe in one pass",
      "Scheduled follow-ups that stop on reply",
      "Client reporting from live data",
    ],
    faqs: [
      { q: "Can I run acquisition for several clients at once?", a: "Yes. Each client gets a separate workspace with its own lists, campaigns, sending accounts, inbox and analytics." },
      { q: "Can I reuse a sequence across clients?", a: "Save your templates and sequence structure and deploy them in a new workspace, then adapt the copy to the client's offer." },
      { q: "Can clients see their own results?", a: "You can invite a client to their workspace with limited access so they can follow performance without changing the setup." },
      { q: "Can I use the client's own mailboxes?", a: "Yes. Connect the mailboxes and domains the client provides, each with its own daily limits and warmup." },
      { q: "How is reporting handled?", a: "Analytics show sends, deliveries, replies, positive replies and unsubscribes per campaign, so the numbers you present match the product." },
      { q: "Can I also run outreach for my own agency?", a: "Most agencies keep one workspace for their own pipeline alongside the client workspaces." },
      { q: "What happens to replies?", a: "They land in that client's unified inbox where your team can respond, assign and add notes before handover." },
      { q: "How long does onboarding a new client take?", a: "Once your playbook is saved, onboarding is mostly importing the audience, connecting mailboxes and adapting the copy." },
    ],
    ctaTitle: "Ready to build a repeatable client acquisition engine?",
    ctaDescription: "Set up your first client workspace and deploy your playbook instead of rebuilding it.",
  },
];

export const solutionsBySlug = Object.fromEntries(
  solutions.map((s) => [s.slug, s]),
) as Record<string, SolutionContent>;

export const solutionNavLinks = solutions.map((s) => ({
  label: s.nav,
  to: `/solutions/${s.slug}`,
  text: s.navText,
}));
