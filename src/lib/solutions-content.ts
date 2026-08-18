import {
  Building2,
  Clock,
  Inbox,
  Layers,
  LineChart,
  MailX,
  Repeat,
  Search,
  ShieldCheck,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type SolutionContent = {
  slug: string;
  nav: string;
  navText: string;
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  pains: { icon: LucideIcon; title: string; text: string }[];
  features: { icon: LucideIcon; title: string; text: string }[];
  steps: { title: string; text: string }[];
  faqs: { q: string; a: string }[];
};

const managedFaq = {
  q: "Do I need my own email infrastructure?",
  a: "No. Sendloop manages the sending layer for you. You add prospects, write your sequence and launch — we take care of getting the emails delivered.",
};

export const solutions: SolutionContent[] = [
  {
    slug: "agencies",
    nav: "Agencies",
    navText: "Run outbound for every client from one place.",
    eyebrow: "For agencies",
    title: "Outbound for every client,",
    highlight: "from one workspace",
    description:
      "Keep client campaigns, prospects, replies and reporting separated by workspace, with one place for your team to run all of them.",
    pains: [
      { icon: Layers, title: "Client work scattered", text: "Every client lives in a different tool, spreadsheet and mailbox." },
      { icon: Clock, title: "Manual follow-ups", text: "Coordinators spend their days chasing prospects instead of booking meetings." },
      { icon: LineChart, title: "Reporting takes days", text: "Pulling numbers for each client at month end is a manual export job." },
    ],
    features: [
      { icon: Building2, title: "Workspace per client", text: "Separate leads, campaigns, inboxes and reporting." },
      { icon: Users, title: "Team roles", text: "Give coordinators, closers and clients the right access." },
      { icon: Inbox, title: "Shared inbox", text: "Assign replies to the right person on the account." },
      { icon: LineChart, title: "Client-ready reporting", text: "Reply, positive reply and meeting numbers per campaign." },
      { icon: Repeat, title: "Reusable sequences", text: "Save what works and roll it out to the next client." },
      { icon: ShieldCheck, title: "Managed sending", text: "No infrastructure setup per client." },
    ],
    steps: [
      { title: "Create a workspace", text: "One per client, fully separated." },
      { title: "Add the prospect list", text: "Import a CSV and map your fields." },
      { title: "Launch the sequence", text: "Initial email plus automatic follow-ups." },
      { title: "Work the replies", text: "Assign, respond and report." },
    ],
    faqs: [
      { q: "Can I keep clients separated?", a: "Yes. Each client gets its own workspace with its own leads, campaigns, inbox and analytics." },
      { q: "Can clients see their own results?", a: "Invite them with a read-only role so they can follow campaign performance without touching your setup." },
      managedFaq,
    ],
  },
  {
    slug: "sales-teams",
    nav: "Sales Teams",
    navText: "Fill the pipeline without manual chasing.",
    eyebrow: "For sales teams",
    title: "Pipeline that fills itself,",
    highlight: "conversation by conversation",
    description:
      "Give reps a repeatable outbound motion: personalized sequences, automatic follow-ups and a shared inbox where every reply is worked.",
    pains: [
      { icon: MailX, title: "Reps stop following up", text: "Most deals need several touches, and manual chasing dies after the first." },
      { icon: Inbox, title: "Replies get missed", text: "Answers land in personal mailboxes and never get worked." },
      { icon: Target, title: "No idea what works", text: "Nobody can say which message actually creates conversations." },
    ],
    features: [
      { icon: Workflow, title: "Repeatable sequences", text: "One proven motion the whole team runs." },
      { icon: Repeat, title: "Automatic follow-ups", text: "Chasing stops the moment a prospect replies." },
      { icon: Inbox, title: "Shared inbox", text: "Assign conversations and never lose a reply." },
      { icon: Users, title: "CRM stages", text: "Move prospects from replied to meeting to won." },
      { icon: LineChart, title: "Rep-level analytics", text: "See who and what is creating meetings." },
      { icon: ShieldCheck, title: "Managed sending", text: "Reps never touch technical setup." },
    ],
    steps: [
      { title: "Import your target accounts", text: "CSV import with duplicate filtering." },
      { title: "Write one strong sequence", text: "Personalized opener plus follow-ups." },
      { title: "Launch for the team", text: "Sending runs in the background." },
      { title: "Work replies together", text: "Assign, respond, book meetings." },
    ],
    faqs: [
      { q: "Can several reps work the same campaign?", a: "Yes. Invite your team, assign replies and keep notes on every conversation." },
      { q: "Do follow-ups stop after a reply?", a: "Automatically. The sequence halts as soon as a prospect responds." },
      managedFaq,
    ],
  },
  {
    slug: "lead-generation",
    nav: "Lead Generation",
    navText: "Turn cold lists into booked conversations.",
    eyebrow: "For lead generation",
    title: "Turn cold lists into",
    highlight: "booked conversations",
    description:
      "Import your list, personalize at scale, follow up automatically and hand over conversations that are ready to talk.",
    pains: [
      { icon: Search, title: "Lists go stale", text: "Data sits in spreadsheets while nobody works it." },
      { icon: Repeat, title: "One-and-done sending", text: "A single email to a cold list rarely creates replies." },
      { icon: LineChart, title: "No feedback loop", text: "Without reply data you cannot improve the next batch." },
    ],
    features: [
      { icon: Users, title: "Bulk import", text: "CSV upload with field mapping and dedupe." },
      { icon: Target, title: "Personalization", text: "Variables with safe fallbacks on every send." },
      { icon: Repeat, title: "Multi-step sequences", text: "Follow up until you get a decision." },
      { icon: Inbox, title: "Reply handling", text: "Classify interested, not now and unsubscribe." },
      { icon: LineChart, title: "List performance", text: "See which segments actually respond." },
      { icon: ShieldCheck, title: "Managed sending", text: "Volume handled for you." },
    ],
    steps: [
      { title: "Upload your list", text: "Map columns and clean duplicates." },
      { title: "Segment the audience", text: "Split by industry, role or region." },
      { title: "Launch sequences", text: "Test messages against each segment." },
      { title: "Hand over replies", text: "Qualify and route interested prospects." },
    ],
    faqs: [
      { q: "Can I import large lists?", a: "Yes. Upload a CSV, map your columns, and duplicates plus suppressed contacts are filtered before launch." },
      { q: "Can I test different messages?", a: "Run separate campaigns per segment and compare reply rates side by side." },
      managedFaq,
    ],
  },
  {
    slug: "recruiting",
    nav: "Recruiting",
    navText: "Reach candidates and clients at scale.",
    eyebrow: "For recruiting",
    title: "Reach candidates before",
    highlight: "your competitors do",
    description:
      "Run candidate and client outreach side by side, with personalized sequences and a shared inbox for every conversation.",
    pains: [
      { icon: Clock, title: "Slow outreach", text: "Good candidates are gone before the second email goes out." },
      { icon: Inbox, title: "Conversations everywhere", text: "Replies scattered across recruiters and mailboxes." },
      { icon: Repeat, title: "No structured follow-up", text: "Interested candidates go cold without a nudge." },
    ],
    features: [
      { icon: Users, title: "Candidate lists", text: "Import and segment by role or skill." },
      { icon: Workflow, title: "Role-specific sequences", text: "Different messaging per vacancy." },
      { icon: Inbox, title: "Shared inbox", text: "Every recruiter sees the full history." },
      { icon: Target, title: "Pipeline stages", text: "Track from contacted to placed." },
      { icon: LineChart, title: "Response analytics", text: "Learn which roles and messages land." },
      { icon: ShieldCheck, title: "Managed sending", text: "No technical setup for your team." },
    ],
    steps: [
      { title: "Build the shortlist", text: "Import candidates or client contacts." },
      { title: "Write the outreach", text: "Personalized opener and follow-ups." },
      { title: "Launch per role", text: "One campaign per vacancy." },
      { title: "Manage responses", text: "Assign, note and move forward." },
    ],
    faqs: [
      { q: "Can I run candidate and client outreach separately?", a: "Yes. Use separate campaigns, or separate workspaces if you want fully isolated reporting." },
      { q: "Does outreach stop when someone answers?", a: "Yes, follow-ups halt immediately on reply." },
      managedFaq,
    ],
  },
  {
    slug: "saas",
    nav: "SaaS",
    navText: "Predictable outbound for product-led teams.",
    eyebrow: "For SaaS companies",
    title: "Predictable outbound for",
    highlight: "growing SaaS teams",
    description:
      "Test positioning, reach your ICP and turn replies into demos without adding another tool your team has to configure.",
    pains: [
      { icon: Target, title: "Messaging guesswork", text: "No structured way to test which pitch resonates." },
      { icon: Clock, title: "Founder time drain", text: "Outbound stalls whenever the founder gets busy." },
      { icon: LineChart, title: "Unclear attribution", text: "Hard to tell which sequence created the demo." },
    ],
    features: [
      { icon: Workflow, title: "Message testing", text: "Compare sequences against the same ICP." },
      { icon: Repeat, title: "Automated follow-ups", text: "Consistent touches without founder time." },
      { icon: Inbox, title: "Unified inbox", text: "Every demo request in one place." },
      { icon: Users, title: "CRM pipeline", text: "From replied to demo to closed." },
      { icon: LineChart, title: "Campaign analytics", text: "Reply and meeting rates per sequence." },
      { icon: ShieldCheck, title: "Managed sending", text: "No infrastructure work for engineers." },
    ],
    steps: [
      { title: "Define your ICP list", text: "Import the accounts you want." },
      { title: "Write two angles", text: "Test positioning against each other." },
      { title: "Launch and iterate", text: "Double down on what replies." },
      { title: "Book demos", text: "Work replies from the inbox." },
    ],
    faqs: [
      { q: "Can I test two different pitches?", a: "Yes. Run parallel campaigns on comparable segments and compare reply rates." },
      { q: "Will this take engineering time?", a: "No. There is nothing to deploy or configure — sending is managed by Sendloop." },
      managedFaq,
    ],
  },
  {
    slug: "consultants",
    nav: "Consultants",
    navText: "Keep your calendar full between projects.",
    eyebrow: "For consultants",
    title: "Keep your calendar full",
    highlight: "between projects",
    description:
      "A steady, low-effort outreach routine so new conversations are already happening when your current project ends.",
    pains: [
      { icon: Clock, title: "Feast and famine", text: "Outreach only happens when work runs out." },
      { icon: Repeat, title: "Inconsistent follow-up", text: "Warm prospects go quiet and never get a second email." },
      { icon: Inbox, title: "Lost threads", text: "Conversations disappear in a personal mailbox." },
    ],
    features: [
      { icon: Workflow, title: "Always-on sequences", text: "A small, steady number of touches per week." },
      { icon: Target, title: "Personalization", text: "Messages that read like you wrote them." },
      { icon: Inbox, title: "One inbox", text: "Every reply and note in one thread." },
      { icon: Users, title: "Lightweight CRM", text: "Track prospects through to signed." },
      { icon: LineChart, title: "Simple analytics", text: "Know how many conversations you started." },
      { icon: ShieldCheck, title: "Managed sending", text: "Nothing technical to maintain." },
    ],
    steps: [
      { title: "List your target clients", text: "Companies you want to work with." },
      { title: "Write your intro", text: "One clear message plus two follow-ups." },
      { title: "Launch a small daily volume", text: "Consistent, not spiky." },
      { title: "Handle replies", text: "Book calls straight from the inbox." },
    ],
    faqs: [
      { q: "Is this useful for a one-person business?", a: "Yes. A small daily send volume with automatic follow-ups is exactly what a solo consultant needs." },
      { q: "How much time does it take?", a: "Setup takes an afternoon; after that you mostly work replies." },
      managedFaq,
    ],
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
