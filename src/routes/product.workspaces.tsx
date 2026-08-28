import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Users,
  KeyRound,
  Mail,
  Lock,
  SlidersHorizontal,
  ShieldAlert,
  FolderKanban,
  Megaphone,
  CreditCard,
  History,
  LogOut,
  Palette,
  Clock,
} from "lucide-react";

import {
  BulletList,
  BeforeAfter,
  CtaBlock,
  DocSection,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  Walkthrough,
  WorkflowStrip,
  metaFor,
  BigPreview,
  FeatureBento,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Can one person belong to more than one workspace?", a: "Yes. Your login can hold membership in as many workspaces as you have clients, with a different role in each — Admin for one client and Member for another." },
  { q: "Can a client log into their own workspace and see only their data?", a: "Yes. Invite them with a role scoped to that workspace only. They see their campaigns and reporting, not any other client's data, and never see your other workspaces at all." },
  { q: "Is data actually isolated, or just hidden in the UI?", a: "Every campaign, lead, mailbox and conversation belongs to exactly one workspace at the data layer. Switching workspaces changes what the server returns, not just what a menu shows." },
  { q: "What roles are available inside a workspace?", a: "Owner, Admin and Member. Owners have full control including billing and deletion, Admins can manage settings, team and sending, and Members work inside campaigns, the inbox and CRM without touching workspace-level settings." },
  { q: "Can a campaign or mailbox move between workspaces?", a: "No — a campaign, sending account and its warmup history stay in the workspace they were created in. That's what keeps one client's sending reputation from ever mixing with another's." },
  { q: "What happens when I remove a teammate?", a: "Removing someone from a workspace revokes their access to that workspace's campaigns, inbox, leads and settings immediately. If they belong to other workspaces on your account, those memberships are untouched." },
  { q: "Is billing shared across workspaces or separate per client?", a: "Billing and plan usage are managed at the account level today, so switching workspaces doesn't change your invoice — but sending volume, mailbox counts and usage limits are still tracked and reported per workspace." },
  { q: "Can each workspace have its own name, logo and sending schedule?", a: "Yes. Name, slug, logo, timezone and sending window are all set per workspace, so each client's outreach runs on their own schedule under their own identity." },
  { q: "How do I delete a workspace?", a: "From the Danger Zone tab, workspace owners can permanently delete a workspace and everything inside it. This is deliberately restricted to owners and can't be undone." },
  { q: "Can I see who changed what inside a workspace?", a: "Yes — invitations, role changes and removals are tracked in the workspace's team activity so you always know who has access and when it changed." },
];

export const Route = createFileRoute("/product/workspaces")({
  head: () => metaFor(
    "Manage Outreach Teams & Workspaces | MunchReach",
    "Give every client their own isolated workspace with separate mailboxes, campaigns, leads and team roles — all from one MunchReach login.",
    "/product/workspaces",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: ShieldAlert, title: "Zero boundaries", text: "One login lets a contractor see every client's leads, mailboxes and replies." },
  { icon: FolderKanban, title: "Reporting is copy-paste", text: "Client updates mean exporting numbers instead of letting them log in." },
  { icon: Megaphone, title: "Tangled reputation", text: "One client's sending mistakes can quietly hurt another client's deliverability." },
];

const walkthroughSteps = [
  {
    title: "Create a workspace for the client",
    youDo: "Name the workspace after the client and set its slug, logo and timezone.",
    weHandle: "A fresh, fully isolated workspace is created with its own settings, empty of any other client's data.",
    youGet: "A clean starting point you can hand off or run yourself, with nothing carried over.",
    visual: (
      <MockPanel title="New workspace">
        <MockRows rows={[
          { left: "Workspace name", right: "Acme Robotics" },
          { left: "Slug", muted: "acme-robotics", right: "Available" },
          { left: "Timezone", right: "America/Chicago" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Invite the team with the right role",
    youDo: "Send email invitations to teammates and, if relevant, the client themselves.",
    weHandle: "Each invite carries a role — Owner, Admin or Member — that controls exactly what that person can see and do in this workspace.",
    youGet: "Teammates and clients with access scoped precisely to their job, not to your whole account.",
    visual: (
      <MockPanel title="Team — Acme Robotics">
        <MockRows rows={[
          { left: "Priya Shah", muted: "priya@agency.com", right: "Admin" },
          { left: "Marcus Lee", muted: "marcus@agency.com", right: "Member" },
          { left: "client@acmerobotics.com", muted: "Invited", right: "Member" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Connect this client's mailboxes",
    youDo: "Add sending accounts and domains that belong only to this client.",
    weHandle: "Warmup, sending limits, tracking domains and suppression lists are tracked per workspace, never shared with another client's mailboxes.",
    youGet: "Sending reputation that stays clean and specific to each client's domain.",
    visual: (
      <MockPanel title="Mailboxes — Acme Robotics">
        <MockRows rows={[
          { left: "hello@acmerobotics.com", right: "Warming up", badge: "Day 6" },
          { left: "sales@acmerobotics.com", right: "Active" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Build campaigns inside the workspace",
    youDo: "Create sequences, upload leads and launch campaigns as usual.",
    weHandle: "Every campaign, lead list, reply and report is written to this workspace only and is invisible from any other workspace.",
    youGet: "A campaign history and pipeline that belongs entirely to this one client.",
    visual: (
      <MockPanel title="Campaigns — Acme Robotics">
        <MockRows rows={[
          { left: "Q3 Outbound — Manufacturing", right: "Active", badge: "412 leads" },
          { left: "Warm re-engagement", right: "Draft" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Switch between clients instantly",
    youDo: "Pick a different workspace from the switcher whenever you move between clients.",
    weHandle: "The dashboard, inbox, campaigns and reporting reload to show only that workspace's data — no logging out required.",
    youGet: "The ability to run five or fifty client accounts from one login without ever mixing them up.",
    visual: (
      <MockPanel title="Active workspace">
        <MockRows rows={[
          { left: "Acme Robotics", right: "Admin", badge: "Current" },
          { left: "Fenwick Logistics", right: "Owner" },
          { left: "Northstar Legal", right: "Member" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Building2, title: "Isolated client workspaces", text: "Every client's campaigns, leads and mailboxes live in a separate workspace." },
  { icon: Users, title: "Owner, Admin and Member roles", text: "Three built-in roles control who can manage settings or just work inside." },
  { icon: KeyRound, title: "Email invitations with roles attached", text: "Invite a teammate or client by email with their role already set." },
  { icon: Mail, title: "Per-workspace mailbox separation", text: "Each client's sending accounts, warmup progress and domains are tracked independently." },
  { icon: Lock, title: "Data-layer isolation", text: "Access is enforced where the data lives, not just hidden in a screen." },
  { icon: SlidersHorizontal, title: "Per-workspace settings", text: "Name, slug, logo, timezone and sending window are all configured individually." },
  { icon: Megaphone, title: "Campaign separation", text: "Sequences, templates in use and send history stay attached to the workspace that created them." },
  { icon: History, title: "Team activity tracking", text: "Invitations, role changes and removals are visible so you know who has access." },
  { icon: LogOut, title: "Instant workspace switching", text: "Move between client accounts from a single switcher without signing out." },
  { icon: Palette, title: "Client-facing branding", text: "Give a workspace its own name and logo for the client's dashboard." },
  { icon: Clock, title: "Independent sending schedules", text: "Set sending days and hours per workspace to match each client's hours." },
  { icon: CreditCard, title: "Usage visibility per workspace", text: "Sending volume and mailbox counts are reported per workspace for each client." },
];

const workflowSteps = [
  { title: "Sign in once", text: "Log into MunchReach with your single account." },
  { title: "Pick a workspace", text: "Choose the client you're working on from the switcher." },
  { title: "Manage the team", text: "Invite or remove people with a role scoped to this workspace." },
  { title: "Connect mailboxes", text: "Add and warm up sending accounts for this client only." },
  { title: "Run campaigns", text: "Build sequences and launch outreach inside the workspace." },
  { title: "Work replies in context", text: "Handle inbox and pipeline without any cross-client noise." },
  { title: "Report back to the client", text: "Share scoped results, or invite them to view it directly." },
  { title: "Switch and repeat", text: "Move to the next client's workspace in one click." },
];

const useCases = [
  { icon: Building2, audience: "Agencies running multiple clients", scenario: "You manage outbound for a dozen clients and can't risk one seeing another's leads.", outcome: "Each client fully isolated under one login." },
  { icon: Users, audience: "In-house teams with contractors", scenario: "You bring in freelance SDRs for a quarter and need to fully revoke access later.", outcome: "Scoped roles and instant offboarding." },
  { icon: KeyRound, audience: "Clients who want visibility", scenario: "A client wants to check on progress without emailing you for a screenshot.", outcome: "A Member invite to their own workspace only." },
  { icon: FolderKanban, audience: "Multi-brand companies", scenario: "You run outreach for several product lines or regional entities from one org.", outcome: "Separate workspaces per brand, one bill." },
  { icon: Mail, audience: "Teams protecting sender reputation", scenario: "One client's aggressive sending shouldn't affect another client's deliverability.", outcome: "Mailboxes and warmup isolated per workspace." },
  { icon: ShieldAlert, audience: "Compliance-conscious teams", scenario: "You need to prove a client's data was never visible to unrelated staff.", outcome: "Access enforced at the data layer, not just hidden." },
];

const docGroups = [
  {
    title: "Clients & data isolation",
    items: [
      "Each workspace holds its own campaigns, leads, mailboxes and conversations",
      "Data access is enforced at the database layer, not just hidden in the interface",
      "A campaign or mailbox created in one workspace never appears in another",
      "Workspaces can be created and deleted independently without affecting others",
    ],
  },
  {
    title: "Team, roles & permissions",
    items: [
      "Owner, Admin and Member roles control exactly what each person can do",
      "Owners hold full control including billing visibility and workspace deletion",
      "Admins manage settings, sending accounts and team membership",
      "Members work inside campaigns, inbox and CRM without touching settings",
      "Invitations carry a role from the moment they're sent",
    ],
  },
  {
    title: "Settings & billing scope",
    items: [
      "Name, slug, logo, timezone and sending window are configured per workspace",
      "Sending volume and mailbox usage are reported at the workspace level",
      "Billing and plan management sit at the account level across all workspaces",
      "Workspace deletion is restricted to owners and is permanent",
    ],
  },
];

const details = [
  "Unlimited workspaces on a single MunchReach account",
  "Workspace switcher changes campaigns, inbox and reporting instantly",
  "Role changes take effect immediately, no re-login required",
  "Each workspace has its own logo, name and slug for client-facing views",
  "Sending days and hours are set independently per workspace",
  "Mailboxes, warmup and suppression lists never cross workspace boundaries",
  "Removing a teammate revokes access to that workspace only",
  "Workspace deletion is owner-only and cannot be undone",
  "Campaign, lead and mailbox counts are visible per workspace for reporting",
];

const beforeAfter = {
  before: [
    "Every client's leads and mailboxes sit in one undivided account",
    "Offboarding means hunting down access across shared logins",
    "Clients need a screenshot instead of their own login",
    "Sending reputation for one client can affect another's",
    "Client updates mean copy-pasting numbers into a report",
  ],
  after: [
    "Each client's data lives in its own isolated workspace",
    "Removing someone revokes access to that workspace immediately",
    "Clients can log in and see only their own workspace",
    "Mailboxes and warmup stay separate per client",
    "Clients can view their real dashboard directly, live",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Workspaces"
        title="A clean, separate workspace for"
        highlight="every client and team"
        description="Run every client's outreach from one login while their leads, mailboxes, campaigns and team access stay completely separate — enforced at the data layer, not just the interface."
        benefits={["Isolated client data", "Owner, Admin and Member roles", "Per-workspace mailboxes and settings"]}
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview
        id="product"
        eyebrow="Workspace switcher"
        title="Switch clients without switching accounts"
        description="Every workspace keeps its own team, mailboxes, campaigns and settings."
      >
        <div className="p-4 sm:p-6">
          <MockPanel title="Workspaces">
            <MockRows rows={[
              { left: "Acme Robotics", right: "Admin", badge: "Current" },
              { left: "Fenwick Logistics", muted: "6 members", right: "Owner" },
              { left: "Northstar Legal", muted: "2 members", right: "Member" },
            ]} />
          </MockPanel>
        </div>
      </BigPreview>
      <Section title="Why one account for every client falls apart">
        <PainPoints items={pains} />
      </Section>
      <Section id="how-it-works" title="How workspaces work" description="From new client to running campaigns, fully separated from everyone else.">
        <Walkthrough steps={walkthroughSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="A day running multiple clients" muted>
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Who workspaces are built for">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep capabilities" description="Everything workspaces control, grouped by what you're trying to protect.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={details} />
      </Section>
      <Section title="Before and after" description="What changes once every client has its own workspace.">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="workspaces" title="Agencies running MunchReach" />
      <Section muted>
        <PageFaqs page="workspaces" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Give every client their own clean workspace"
        description="Separate data, separate teams, separate mailboxes — all run from one account you control."
      />
    </MarketingLayout>
  );
}
