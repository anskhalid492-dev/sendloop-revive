import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Users,
  KeyRound,
  Mail,
  Lock,
  SlidersHorizontal,
  ShieldAlert,
  UserX,
  FolderKanban,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  StatStrip,
  StepList,
  metaFor,
  BigPreview,
  FeatureBento,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  { q: "Can one person belong to many workspaces?", a: "Yes, with a different role in each — an agency owner can be Admin in one client workspace and Analyst in another." },
  { q: "Can a client log in and see only their data?", a: "Yes, invite them as a Client Viewer. They see reporting and pipeline for their workspace only, with no access to settings or billing." },
  { q: "Is data really isolated?", a: "Yes, every table is protected with row-level security tied to workspace membership, not just hidden in the interface." },
  { q: "Can I move a campaign between workspaces?", a: "Campaigns stay in the workspace they were created in, but templates and sequences can be shared or duplicated across workspaces." },
  { q: "What happens if I remove a team member?", a: "Their access is revoked immediately across every workspace they belonged to, and an audit log entry records the change." },
  { q: "Can I white-label a workspace for a client?", a: "Yes — branding, tracking domain and sender names can all be set per workspace." },
];

export const Route = createFileRoute("/product/workspaces")({
  head: () => metaFor(
    "Multi-Client Workspaces & Team Roles — MunchReach",
    "Run every client in its own workspace with isolated data, granular roles, invitations and per-workspace reporting.",
    "/product/workspaces",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: ShieldAlert, title: "One login, zero boundaries", text: "A junior contractor can see every client's leads and mailboxes because your tool has no concept of separate accounts." },
  { icon: UserX, title: "Offboarding is a manual scramble", text: "When someone leaves, you're hunting through five tools to revoke access instead of one click." },
  { icon: FolderKanban, title: "Client reporting means copy-paste", text: "Every client update means exporting numbers out of your real dashboard into something 'safe' to share." },
];

const solutionRows = [
  {
    eyebrow: "Isolation",
    title: "Every client lives in its own locked workspace",
    text: "Leads, campaigns, mailboxes and replies never cross workspace boundaries — enforced at the database layer, not just hidden in the UI.",
    bullets: ["Row-level security on every table", "Separate tracking domains and sending limits", "Own suppression and do-not-contact lists"],
    visual: (
      <MockPanel title="Workspaces">
        <MockRows rows={[
          { left: "Acme Robotics", right: "4 members", badge: "Active" },
          { left: "Fenwick Logistics", right: "6 members", badge: "Active" },
          { left: "Northstar Legal", right: "2 members", badge: "Invited" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Roles",
    title: "Granular permissions for every kind of teammate",
    text: "Owner, Admin, Campaign Manager, Inbox Manager, Analyst and Client Viewer — each with exactly the access their job requires, nothing more.",
    bullets: ["Role changes take effect immediately", "Client Viewer sees reporting only", "Invite by email with a role pre-attached"],
    visual: (
      <MockPanel title="Members — Acme Robotics">
        <MockRows rows={[
          { left: "Priya Shah", muted: "priya@acme.com", right: "Admin" },
          { left: "Marcus Lee", muted: "marcus@acme.com", right: "Campaign Manager" },
          { left: "client@acmerobotics.com", muted: "Invited 2 days ago", right: "Client Viewer" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Audit",
    title: "Know exactly who changed what, and when",
    text: "Every membership and permission change is logged, so offboarding a contractor or investigating an issue takes seconds, not a Slack thread.",
    visual: (
      <MockPanel title="Audit log">
        <MockRows rows={[
          { left: "Priya Shah invited marcus@acme.com as Analyst", right: "2h ago" },
          { left: "Owner transferred to Priya Shah", right: "Yesterday" },
          { left: "client@acmerobotics.com role changed to Client Viewer", right: "3d ago" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Building2, title: "Isolated data", text: "Leads, campaigns, mailboxes and replies never cross workspace boundaries." },
  { icon: Users, title: "Granular roles", text: "Owner, Admin, Campaign Manager, Inbox Manager, Analyst and Client Viewer." },
  { icon: KeyRound, title: "Email invitations", text: "Invite teammates or clients by email with a role attached to the invite." },
  { icon: Mail, title: "Per-workspace mailboxes", text: "Each client sends from their own domains and providers." },
  { icon: Lock, title: "Row-level security", text: "Access is enforced in the database, not just in the interface." },
  { icon: SlidersHorizontal, title: "Workspace settings", text: "Branding, tracking domain, sending limits and suppression lists per workspace." },
];

const steps = [
  { title: "Create a workspace", text: "Name it after the client and pick a slug." },
  { title: "Invite the team", text: "Send role-scoped invitations to teammates and the client." },
  { title: "Connect providers", text: "Add the client's mailboxes and warm them up." },
  { title: "Switch instantly", text: "Move between workspaces from the sidebar without logging out." },
];

const stats = [
  { value: "6", label: "Built-in role types" },
  { value: "Unlimited", label: "Workspaces per account" },
  { value: "0", label: "Cross-workspace data leaks by design" },
  { value: "<1 min", label: "To offboard a teammate everywhere" },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow={"Workspaces"}
        title={"Separate workspaces for every"}
        highlight={"client and team"}
        description={"Agencies run dozens of clients from one login. Each workspace has its own mailboxes, leads, campaigns, members and reporting, with strict data isolation."}
        secondaryCta="Explore Workspaces"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Workspace preview"
        title="Built for teams and agencies"
        description="Client separation, roles and per-workspace reporting."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="How MunchReach solves it" description="A workspace boundary for every client, enforced everywhere.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="How it works" muted>
        <StepList steps={steps} />
      </Section>
      <Section>
        <StatStrip stats={stats} />
      </Section>
      <TestimonialCarousel page="workspaces" title="Agencies running MunchReach" />
      <Section title="Details that matter">
        <BulletList items={["Unlimited workspaces per account", "Role changes take effect immediately", "Client viewers see reporting only", "Audit trail of member and role changes", "Per-workspace suppression and do-not-contact lists", "Transfer ownership without downtime"]} />
      </Section>
      <Section muted>
        <FaqBlock faqs={faqs} />
      </Section>
      <CtaBlock title={"Run every client from one account"} description={"Isolated workspaces, clear roles and reporting your clients can trust."} />
    </MarketingLayout>
  );
}
