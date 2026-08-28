import type { ReactNode } from "react";
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  FileStack,
  Inbox,
  KanbanSquare,
  Mail,
  Megaphone,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
      {initials}
    </span>
  );
}

function WorkspaceMark({
  initials,
  active,
}: {
  initials: string;
  active?: boolean | undefined;
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {initials}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background px-3 py-2">
      <p className="truncate text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function GhostButton({ children, icon: Icon }: { children: ReactNode; icon?: typeof Plus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

function PrimaryButton({ children, icon: Icon }: { children: ReactNode; icon?: typeof Plus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-primary-foreground">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Hero — workspace management                                      */
/* ------------------------------------------------------------------ */

const WORKSPACES = [
  {
    initials: "AC",
    name: "ABC Consulting",
    slug: "abc-consulting",
    role: "Owner",
    members: "4 members",
    campaigns: "6 campaigns",
    mailboxes: "8 mailboxes",
    active: true,
  },
  {
    initials: "XM",
    name: "XYZ Marketing",
    slug: "xyz-marketing",
    role: "Admin",
    members: "3 members",
    campaigns: "4 campaigns",
    mailboxes: "5 mailboxes",
  },
  {
    initials: "AA",
    name: "Acme Agency",
    slug: "acme-agency",
    role: "Member",
    members: "6 members",
    campaigns: "9 campaigns",
    mailboxes: "12 mailboxes",
  },
];

export function WorkspaceManagerMock() {
  return (
    <AppWindow title="MunchReach — Workspaces" breadcrumb="Settings / Workspaces">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Search className="size-3.5" />
          Search workspaces
        </span>
        <span className="ml-auto flex items-center gap-2">
          <GhostButton>3 workspaces</GhostButton>
          <PrimaryButton icon={Plus}>Create workspace</PrimaryButton>
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {WORKSPACES.map((w) => (
          <div key={w.slug} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <WorkspaceMark initials={w.initials} active={w.active} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">{w.name}</span>
                <Pill tone={w.role === "Owner" ? "primary" : "muted"}>{w.role}</Pill>
                {w.active ? <Pill tone="ok">Current</Pill> : null}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                munchreach.com/{w.slug}
              </p>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:grid-cols-3">
              <Stat label="Team" value={w.members} />
              <Stat label="Campaigns" value={w.campaigns} />
              <Stat label="Mailboxes" value={w.mailboxes} />
            </div>
            <GhostButton icon={Settings}>Manage</GhostButton>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Single workspace overview                                        */
/* ------------------------------------------------------------------ */

const WORKSPACE_NAV = [
  { icon: Megaphone, label: "Campaigns", meta: "6 active" },
  { icon: Users, label: "Leads", meta: "4,820" },
  { icon: Mail, label: "Email accounts", meta: "8 connected" },
  { icon: Inbox, label: "UniBox", meta: "12 unread" },
  { icon: KanbanSquare, label: "CRM", meta: "37 deals" },
  { icon: BarChart3, label: "Analytics", meta: "This week" },
  { icon: FileStack, label: "Templates", meta: "14 saved" },
  { icon: Settings, label: "Settings", meta: "Team & sending" },
];

export function WorkspaceOverviewMock() {
  return (
    <AppWindow title="ABC Consulting — Workspace" breadcrumb="Workspace overview">
      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        <div className="border-b border-border/70 p-3 md:border-r md:border-b-0">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2">
            <WorkspaceMark initials="AC" active />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">ABC Consulting</p>
              <p className="truncate text-[10px] text-muted-foreground">Owner · You</p>
            </div>
            <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-3 space-y-1">
            {WORKSPACE_NAV.map((n, i) => (
              <div
                key={n.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  i === 0 ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
                )}
              >
                <n.icon className="size-3.5 shrink-0" />
                <span className="truncate">{n.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">Workspace: ABC Consulting</h4>
            <Pill tone="ok">Active</Pill>
            <span className="ml-auto flex -space-x-1.5">
              <Avatar initials="MK" />
              <Avatar initials="JD" />
              <Avatar initials="SR" />
              <Avatar initials="+1" />
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {WORKSPACE_NAV.map((n) => (
              <div key={n.label} className="rounded-xl border border-border/70 bg-background p-3">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <n.icon className="size-3.5" />
                </span>
                <p className="mt-2 text-xs font-semibold">{n.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{n.meta}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
            Everything on this screen belongs to ABC Consulting only. Nothing here is visible from
            another workspace.
          </p>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4 + 7. Multiple clients side by side                                */
/* ------------------------------------------------------------------ */

const CLIENT_COLUMNS = [
  {
    initials: "CA",
    name: "Client A",
    workspace: "ABC Consulting",
    rows: [
      { label: "Campaigns", value: "6 active" },
      { label: "Leads", value: "4,820" },
      { label: "Mailboxes", value: "8 connected" },
      { label: "Inbox", value: "12 unread" },
      { label: "CRM", value: "37 deals" },
    ],
  },
  {
    initials: "CB",
    name: "Client B",
    workspace: "XYZ Marketing",
    rows: [
      { label: "Campaigns", value: "4 active" },
      { label: "Leads", value: "2,140" },
      { label: "Mailboxes", value: "5 connected" },
      { label: "Inbox", value: "3 unread" },
      { label: "CRM", value: "18 deals" },
    ],
  },
  {
    initials: "CC",
    name: "Client C",
    workspace: "Acme Agency",
    rows: [
      { label: "Campaigns", value: "9 active" },
      { label: "Leads", value: "9,305" },
      { label: "Mailboxes", value: "12 connected" },
      { label: "Inbox", value: "27 unread" },
      { label: "CRM", value: "64 deals" },
    ],
  },
];

export function MultiClientMock() {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-3">
      {CLIENT_COLUMNS.map((c) => (
        <div key={c.name} className="min-w-0 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <WorkspaceMark initials={c.initials} active />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Workspace: {c.workspace}
              </p>
            </div>
          </div>
          <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border/70 bg-background">
            {c.rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">{r.label}</span>
                <span className="text-[11px] font-medium">{r.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Separate data. Separate sending. Separate replies.
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Team access                                                      */
/* ------------------------------------------------------------------ */

const MEMBERS = [
  {
    initials: "MK",
    name: "Maya Kerr",
    email: "maya@abcconsulting.com",
    role: "Owner",
    tone: "primary" as const,
    scope: "Full control, billing, delete workspace",
  },
  {
    initials: "JD",
    name: "Jonas Duval",
    email: "jonas@abcconsulting.com",
    role: "Admin",
    tone: "ok" as const,
    scope: "Manage settings, team, sending accounts",
  },
  {
    initials: "SR",
    name: "Sara Reyes",
    email: "sara@abcconsulting.com",
    role: "Member",
    tone: "muted" as const,
    scope: "Work in campaigns, inbox and CRM",
  },
  {
    initials: "TL",
    name: "tom@partneragency.com",
    email: "Invitation pending",
    role: "Member",
    tone: "muted" as const,
    scope: "Invited — access starts once accepted",
  },
];

export function TeamAccessMock() {
  return (
    <AppWindow title="ABC Consulting — Team" breadcrumb="Workspace settings / Team">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="text-xs font-medium">Members</span>
        <Pill tone="muted">4 people</Pill>
        <span className="ml-auto flex items-center gap-2">
          <GhostButton>Role: All</GhostButton>
          <PrimaryButton icon={Plus}>Invite member</PrimaryButton>
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {MEMBERS.map((m) => (
          <div key={m.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar initials={m.initials} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{m.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
            </div>
            <span className="hidden max-w-[240px] truncate text-[11px] text-muted-foreground lg:block">
              {m.scope}
            </span>
            <Pill tone={m.tone}>{m.role}</Pill>
            <GhostButton icon={ChevronDown}>Change role</GhostButton>
          </div>
        ))}
      </div>
      <div className="border-t border-border/70 bg-secondary/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        Roles available in MunchReach: Owner, Admin, Member. Access is granted per workspace — a
        teammate only sees the workspaces they belong to.
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Agency client separation                                         */
/* ------------------------------------------------------------------ */

const AGENCY_PAIRS = [
  {
    client: "ABC Consulting",
    workspace: "ABC Consulting",
    initials: "AC",
    items: [
      "6 campaigns running on ABC domains",
      "4,820 leads imported for ABC",
      "8 ABC mailboxes with their own warmup",
      "Replies land in the ABC UniBox",
    ],
  },
  {
    client: "XYZ Marketing",
    workspace: "XYZ Marketing",
    initials: "XM",
    items: [
      "4 campaigns running on XYZ domains",
      "2,140 leads imported for XYZ",
      "5 XYZ mailboxes with their own warmup",
      "Replies land in the XYZ UniBox",
    ],
  },
];

export function AgencySeparationMock() {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {AGENCY_PAIRS.map((p) => (
        <div key={p.client} className="min-w-0 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Building2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Client</p>
              <p className="truncate text-sm font-semibold">{p.client}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
            <WorkspaceMark initials={p.initials} active />
            <div className="min-w-0">
              <p className="text-[10px] tracking-wide text-primary uppercase">Workspace</p>
              <p className="truncate text-xs font-semibold">{p.workspace}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {p.items.map((i) => (
              <li key={i} className="flex gap-2 text-[12px] text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. Workspace switcher                                               */
/* ------------------------------------------------------------------ */

export function WorkspaceSwitcherMock() {
  return (
    <div className="mx-auto max-w-md">
      <AppWindow title="Workspace switcher">
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
            <WorkspaceMark initials="AC" active />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">ABC Consulting</p>
              <p className="truncate text-[10px] text-muted-foreground">Current workspace</p>
            </div>
            <ChevronDown className="ml-auto size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 rounded-xl border border-border/70 bg-card p-1.5">
            <p className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">
              Switch workspace
            </p>
            {[
              { initials: "AC", name: "ABC Consulting", role: "Owner", current: true },
              { initials: "XM", name: "XYZ Marketing", role: "Admin" },
              { initials: "AA", name: "Acme Agency", role: "Member" },
            ].map((w) => (
              <div
                key={w.name}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-2",
                  w.current ? "bg-primary/10" : "",
                )}
              >
                <WorkspaceMark initials={w.initials} active={w.current} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{w.name}</span>
                <Pill tone={w.current ? "primary" : "muted"}>{w.role}</Pill>
                {w.current ? <Check className="size-3.5 text-primary" /> : null}
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2 rounded-lg border-t border-border/60 px-2 pt-2 pb-1 text-xs text-primary">
              <Plus className="size-3.5" />
              Create workspace
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Switching changes the campaigns, leads, mailboxes, inbox and CRM you are looking at.
            Nothing is merged across workspaces.
          </p>
        </div>
      </AppWindow>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow rail                                                       */
/* ------------------------------------------------------------------ */

export function WorkspaceFlowRail({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-stretch gap-2">
          <div className="flex w-[150px] flex-col justify-center rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 text-center">
            <span className="text-[10px] font-semibold text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="mt-1 text-xs font-medium">{s}</span>
          </div>
          {i < steps.length - 1 ? (
            <span className="flex items-center text-muted-foreground">→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
