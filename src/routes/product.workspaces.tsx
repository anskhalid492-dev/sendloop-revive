import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  FileStack,
  FolderKanban,
  Inbox,
  KanbanSquare,
  Mail,
  Megaphone,
  Rocket,
  ShieldAlert,
  Users,
  UsersRound,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  BulletList,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  AgencySeparationMock,
  MultiClientMock,
  TeamAccessMock,
  WorkspaceFlowRail,
  WorkspaceManagerMock,
  WorkspaceOverviewMock,
  WorkspaceSwitcherMock,
} from "@/components/site/WorkspacesProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What is a workspace?",
    a: "A workspace is a separate operating environment inside MunchReach. It holds its own campaigns, leads, email accounts, UniBox conversations, CRM records, templates, analytics and team — nothing is shared with your other workspaces.",
  },
  {
    q: "Why would an agency need multiple workspaces?",
    a: "So each client stays separate. One workspace per client keeps that client's campaigns, leads, sending accounts and replies in their own environment, instead of one account where everything is mixed together and hard to manage.",
  },
  {
    q: "Can team members access different workspaces?",
    a: "Yes. Access is granted per workspace, and a person can belong to several. Each membership has its own role — Owner, Admin or Member — so someone can be an Admin on one client and a Member on another.",
  },
  {
    q: "What can be managed inside a workspace?",
    a: "Campaigns, leads, email accounts, the UniBox, CRM, analytics, templates and workspace settings including team members and their roles.",
  },
  {
    q: "How do I switch between workspaces?",
    a: "Use the workspace switcher in the app. Pick another workspace and the whole environment changes with it — campaigns, leads, mailboxes, inbox and CRM all reload for that workspace only.",
  },
  {
    q: "Does each workspace keep campaigns and leads separate?",
    a: "Yes. A campaign, lead list, sending account and conversation belongs to exactly one workspace. Data is scoped per workspace, so one client's records never appear inside another client's workspace.",
  },
];

export const Route = createFileRoute("/product/workspaces")({
  head: () =>
    metaFor(
      "MunchReach Workspaces — Separate Every Client, Keep Your Team Organized",
      "Give each client or business its own workspace for campaigns, leads, mailboxes, conversations, CRM and team settings — without mixing everything together.",
      "/product/workspaces",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: FolderKanban,
    title: "Client data gets mixed",
    text: "Leads, campaigns and replies from different clients end up in the same lists.",
  },
  {
    icon: ShieldAlert,
    title: "Teams don't know what they can access",
    text: "Without separate environments, it's unclear who should be working where.",
  },
  {
    icon: Megaphone,
    title: "Campaigns and mailboxes become hard to manage",
    text: "One long list of campaigns and sending accounts across every client slows everything down.",
  },
];

const insideWorkspace = [
  {
    icon: Megaphone,
    title: "Campaigns",
    text: "Sequences, schedules and sending settings for that client only.",
  },
  {
    icon: Users,
    title: "Leads",
    text: "Imported contacts and lists that belong to this workspace.",
  },
  {
    icon: Mail,
    title: "Email accounts",
    text: "Connected sending accounts and their warmup, per workspace.",
  },
  {
    icon: Inbox,
    title: "UniBox",
    text: "Replies from this workspace's campaigns, in one inbox.",
  },
  {
    icon: KanbanSquare,
    title: "CRM",
    text: "Deals and pipeline stages scoped to this workspace.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    text: "Sending and reply performance for this workspace's campaigns.",
  },
  {
    icon: FileStack,
    title: "Templates",
    text: "Saved sequences the workspace team can reuse.",
  },
  {
    icon: UsersRound,
    title: "Team settings",
    text: "Members, invitations and roles — Owner, Admin, Member.",
  },
];

const teamAccess = [
  {
    icon: UsersRound,
    title: "Invite team members",
    text: "Send an invite by email and set their role in that workspace.",
  },
  {
    icon: ShieldAlert,
    title: "Control workspace access",
    text: "Owner, Admin or Member — the only roles MunchReach uses.",
  },
  {
    icon: Building2,
    title: "Keep client work separated",
    text: "People only see the workspaces they've been added to.",
  },
];

const audiences = [
  {
    icon: Building2,
    audience: "Agencies",
    scenario: "One workspace per client account, run from a single login.",
    outcome: "Manage multiple clients from one MunchReach account.",
  },
  {
    icon: Users,
    audience: "Sales Teams",
    scenario: "A workspace per team, region or product line.",
    outcome: "Separate teams, projects, or business units.",
  },
  {
    icon: Rocket,
    audience: "Growing Companies",
    scenario: "New outreach motions get their own workspace instead of one shared list.",
    outcome: "Keep different outreach operations organized as the team expands.",
  },
];

const howItWorks = [
  { title: "Create a workspace", text: "Name it after the client, team or business unit." },
  { title: "Add your team", text: "Invite people and set Owner, Admin or Member." },
  {
    title: "Connect your outreach infrastructure",
    text: "Add sending accounts and import that client's leads.",
  },
  { title: "Run and manage outreach", text: "Launch campaigns, handle replies, review results." },
];

const details = [
  "Each workspace has its own name and settings",
  "Campaigns, leads, email accounts, UniBox, CRM, templates and analytics are scoped to one workspace",
  "Team access is granted per workspace, with Owner, Admin and Member roles",
  "One login can belong to several workspaces, with a different role in each",
  "The workspace switcher changes the entire environment, not just a filter",
  "Sending accounts stay with the workspace they were connected in",
  "Replies from a workspace's campaigns arrive in that workspace's UniBox",
  "Removing someone from a workspace ends their access to that workspace only",
];

function Page() {
  return (
    <MarketingLayout>
      {/* 1. Hero */}
      <PageHero
        eyebrow="MunchReach Workspaces"
        title="Separate Every Client."
        highlight="Keep Your Team Organized."
        description="Give each client or business its own workspace for campaigns, leads, mailboxes, conversations, and settings — without mixing everything together."
        benefits={[
          "One workspace per client",
          "Access granted per workspace",
          "Switch without mixing data",
        ]}
        primaryCta="Create a Workspace"
        secondaryCta="See How Workspaces Work"
        secondaryHref="#overview"
      >
        <WorkspaceManagerMock />
      </PageHero>

      {/* 2. The problem */}
      <Section
        title="One Account Gets Messy When Everything Lives Together."
        description="Running every client from a single environment turns into guesswork fast."
      >
        <PainPoints items={problems} />
      </Section>

      {/* 3. Workspace overview */}
      <BigPreview
        id="overview"
        eyebrow="Workspace overview"
        title="Every Client Gets Their Own Workspace"
        description="A workspace is a separate operating environment: its own campaigns, leads, mailboxes, conversations, CRM and settings."
      >
        <div className="p-4 sm:p-6">
          <WorkspaceOverviewMock />
        </div>
      </BigPreview>

      {/* 4. Multiple clients */}
      <Section
        title="Manage Multiple Clients Without Mixing Their Data"
        description="Each client runs in their own workspace with their own campaigns, leads, mailboxes, inbox and CRM."
        muted
      >
        <MultiClientMock />
      </Section>

      {/* 5. Team access */}
      <Section
        title="Give People Access to the Right Workspace"
        description="Invite teammates into a workspace and set their role. MunchReach uses three roles: Owner, Admin and Member."
      >
        <div className="space-y-8">
          <TeamAccessMock />
          <FeatureGrid items={teamAccess} />
          <p className="mx-auto max-w-2xl text-center text-sm text-muted-foreground">
            You decide who works inside each workspace — a person only sees the workspaces they've
            been added to.
          </p>
        </div>
      </Section>

      {/* 6. Workspace workflow */}
      <Section
        title="How a Workspace Comes Together"
        description="From an empty workspace to outreach you can report on."
        muted
      >
        <div className="overflow-x-auto pb-1">
          <WorkspaceFlowRail
            steps={[
              "Create workspace",
              "Add team members",
              "Connect sending accounts",
              "Import leads",
              "Create campaigns",
              "Manage replies",
              "Review performance",
            ]}
          />
        </div>
      </Section>

      {/* 7. Client separation */}
      <Section
        title="Built for Agencies Managing Multiple Clients"
        description="Two clients, two workspaces — campaigns, leads, mailboxes and conversations never become one mixed system."
      >
        <AgencySeparationMock />
      </Section>

      {/* 8. What lives inside a workspace */}
      <Section
        title="What Lives Inside a Workspace"
        description="Eight areas, all scoped to the workspace you're in."
        muted
      >
        <FeatureGrid items={insideWorkspace} />
      </Section>

      {/* 9. Switch workspaces */}
      <Section
        title="Move Between Clients Without Losing Context"
        description="Pick a workspace from the switcher and the entire environment changes with it."
      >
        <WorkspaceSwitcherMock />
      </Section>

      {/* 10. Before vs after */}
      <Section title="Before vs After" description="Same account. Very different day." muted>
        <BeforeAfter
          beforeTitle="Before"
          afterTitle="After"
          before={[
            "One account for every client",
            "Mixed leads across clients",
            "Mixed campaigns in one list",
            "Mixed mailboxes and warmup",
            "Confusing access for the team",
          ]}
          after={[
            "Workspace A — its own campaigns, leads and mailboxes",
            "Workspace B — its own inbox and CRM",
            "Workspace C — its own team and settings",
            "Each environment separated and organized",
            "People only see the workspaces they belong to",
          ]}
        />
      </Section>

      {/* 11. Who it's for */}
      <Section title="Who It's For" description="Three teams that outgrow a single environment.">
        <UseCaseGrid items={audiences} />
      </Section>

      {/* 12. How it works */}
      <Section title="How It Works" description="Four steps to a running workspace." muted>
        <WorkflowStrip steps={howItWorks} />
      </Section>

      {/* 13. Details that matter */}
      <Section title="Details That Matter">
        <BulletList items={details} />
      </Section>

      {/* 14. Loved by outreach teams — unchanged */}
      <TestimonialCarousel page="workspaces" title="Agencies running MunchReach" />

      {/* 15. FAQ */}
      <Section muted>
        <PageFaqs page="workspaces" defaults={faqs} />
      </Section>

      {/* 16. Final CTA */}
      <CtaBlock
        title="Give Every Client Their Own Workspace."
        description="Keep campaigns, leads, mailboxes, conversations, and teams organized in one place."
        cta="Create a Workspace"
      />
    </MarketingLayout>
  );
}
