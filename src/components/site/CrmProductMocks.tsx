import type { ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Filter,
  Inbox,
  Mail,
  MessageSquare,
  Search,
  Send,
  StickyNote,
  Tag,
  User,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border/70 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
      {initials}
    </span>
  );
}

function Control({ children, icon: Icon }: { children: ReactNode; icon?: typeof Search }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Contact table                                                       */
/* ------------------------------------------------------------------ */

const contacts = [
  {
    initials: "ML",
    name: "Marcus Lee",
    company: "Fieldstack Robotics",
    email: "marcus@fieldstack.io",
    status: "Replied",
    tone: "primary" as const,
    owner: "Sam",
    tags: ["Interested", "Enterprise"],
    activity: "Reply received · 2h ago",
    next: "Review positive reply",
  },
  {
    initials: "AT",
    name: "Aisha Toure",
    company: "Northline Logistics",
    email: "aisha@northline.co",
    status: "Meeting Booked",
    tone: "ok" as const,
    owner: "Priya",
    tags: ["Pricing"],
    activity: "Meeting logged · Yesterday",
    next: "Send follow-up notes",
  },
  {
    initials: "DC",
    name: "Devon Cross",
    company: "Orbit Analytics",
    email: "devon@orbit.dev",
    status: "Contacted",
    tone: "muted" as const,
    owner: "Sam",
    tags: ["Step 2"],
    activity: "Email sent · 3d ago",
    next: "Wait for sequence step 3",
  },
  {
    initials: "HB",
    name: "Hannah Boyd",
    company: "Crestline Foods",
    email: "hannah@crestline.com",
    status: "New",
    tone: "muted" as const,
    owner: "Unassigned",
    tags: ["Imported"],
    activity: "Lead added · 3d ago",
    next: "Add to campaign",
  },
  {
    initials: "RK",
    name: "Ravi Krishnan",
    company: "Bluepeak Health",
    email: "ravi@bluepeak.health",
    status: "Won",
    tone: "ok" as const,
    owner: "Priya",
    tags: ["Closed"],
    activity: "Stage changed · 1w ago",
    next: "—",
  },
];

export function CrmTableMock({ compact = false }: { compact?: boolean }) {
  return (
    <AppWindow title="CRM — Contacts" breadcrumb="Acme Growth / CRM">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
          <Search className="size-3.5" />
          Search name, email or company
        </span>
        <Control icon={Filter}>Status: All</Control>
        <Control icon={Tag}>Tag: Any</Control>
        <Control icon={User}>Owner: Anyone</Control>
        <Control icon={Send}>Campaign: Any</Control>
        <span className="ml-auto text-[11px] text-muted-foreground">248 contacts</span>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 font-medium">Tags</th>
              <th className="px-3 py-2.5 font-medium">Last activity</th>
              <th className="px-4 py-2.5 font-medium">Next action</th>
            </tr>
          </thead>
          <tbody>
            {(compact ? contacts.slice(0, 3) : contacts).map((c) => (
              <tr key={c.email} className="border-t border-border/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar initials={c.initials} />
                    <span className="font-medium">{c.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{c.company}</td>
                <td className="px-3 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-3 py-3">
                  <Pill tone={c.tone}>{c.status}</Pill>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{c.owner}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{c.activity}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Contact detail + timeline                                           */
/* ------------------------------------------------------------------ */

const detailFields = [
  { label: "Email", value: "marcus@fieldstack.io" },
  { label: "Company", value: "Fieldstack Robotics" },
  { label: "Job title", value: "VP Operations" },
  { label: "Lead status", value: "Replied" },
  { label: "Owner", value: "Sam Patel" },
  { label: "Campaign", value: "Q3 Ops Directors" },
  { label: "Lead source", value: "CSV import" },
];

const detailTimeline = [
  { icon: Send, title: "Email sent", detail: "Step 1 · Q3 Ops Directors", at: "Mon 9:02am" },
  { icon: Mail, title: "Email delivered", detail: "sam@munchreach.dev", at: "Mon 9:02am" },
  { icon: Send, title: "Follow-up sent", detail: "Step 2 · 3 days later", at: "Thu 9:00am" },
  { icon: MessageSquare, title: "Reply received", detail: "\"Can we grab 15 min this week?\"", at: "Thu 11:24am", highlight: true },
  { icon: StickyNote, title: "Note added", detail: "Sam: prefers Thursday afternoons", at: "Thu 11:40am" },
  { icon: CalendarClock, title: "Task created", detail: "Schedule meeting · due Friday", at: "Thu 11:41am" },
];

export function CrmContactDetailMock() {
  return (
    <AppWindow title="CRM — Marcus Lee" breadcrumb="Acme Growth / CRM / Contact">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="border-b border-border/70 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
              ML
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Marcus Lee</div>
              <div className="truncate text-[11px] text-muted-foreground">
                VP Operations · Fieldstack Robotics
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            <Pill tone="primary">Interested</Pill>
            <Pill tone="muted">Enterprise</Pill>
            <Pill tone="muted">Ops</Pill>
          </div>
          <PanelTitle>Contact details</PanelTitle>
          <dl className="space-y-px bg-border/40">
            {detailFields.map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-3 bg-card px-4 py-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="truncate text-xs font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
          <PanelTitle>Open tasks</PanelTitle>
          <ul className="space-y-2 p-3 text-xs">
            <li className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
              <span className="size-3.5 rounded border border-primary/60" />
              <span>Schedule meeting</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Due Fri</span>
            </li>
            <li className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
              <span className="size-3.5 rounded border border-border" />
              <span>Send pricing overview</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Due Mon</span>
            </li>
          </ul>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-4 border-b border-border/70 px-4 py-2.5 text-[11px]">
            <span className="rounded-md bg-primary/12 px-2 py-1 font-medium text-primary">Activity</span>
            <span className="text-muted-foreground">Emails</span>
            <span className="text-muted-foreground">Notes</span>
            <span className="text-muted-foreground">Tasks</span>
          </div>
          <ol className="space-y-3 p-4">
            {detailTimeline.map((t) => (
              <li key={t.title + t.at} className="flex gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    t.highlight ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                  )}
                >
                  <t.icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{t.title}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{t.at}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Activity timeline (vertical, standalone)                            */
/* ------------------------------------------------------------------ */

const activitySteps = [
  { title: "Lead added", detail: "Imported from CSV or created manually.", icon: Users },
  { title: "Campaign started", detail: "Contact enters an outreach sequence.", icon: Send },
  { title: "Email sent", detail: "Step 1 leaves the assigned sending account.", icon: Mail },
  { title: "Email delivered", detail: "Provider confirms the message was accepted.", icon: CheckCircle2 },
  { title: "Follow-up sent", detail: "Next sequence step goes out on schedule.", icon: Send },
  { title: "Reply received", detail: "The response lands in UniBox and on the record.", icon: MessageSquare },
  { title: "Sales activity", detail: "Notes, tasks and stage changes logged by your team.", icon: StickyNote },
];

export function LeadActivityTimeline() {
  return (
    <ol className="relative mx-auto max-w-2xl space-y-3 pl-6">
      <span className="absolute top-3 bottom-3 left-[13px] w-px bg-border" aria-hidden />
      {activitySteps.map((s, i) => (
        <li key={s.title} className="relative">
          <span className="absolute top-3.5 -left-6 flex size-7 items-center justify-center rounded-full border border-border bg-card text-primary">
            <s.icon className="size-3.5" />
          </span>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium">{s.title}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

const pipeline = [
  {
    name: "New",
    tone: "border-border",
    cards: [
      { who: "Hannah Boyd", co: "Crestline Foods", meta: "Added 3d ago" },
      { who: "Tomas Vidal", co: "Harborline", meta: "Added 3d ago" },
    ],
  },
  {
    name: "Contacted",
    tone: "border-blue-500/40",
    cards: [
      { who: "Devon Cross", co: "Orbit Analytics", meta: "Step 2 sent" },
      { who: "Lena Fischer", co: "Vantive", meta: "Step 1 sent" },
    ],
  },
  {
    name: "Replied",
    tone: "border-violet-500/40",
    cards: [
      { who: "Marcus Lee", co: "Fieldstack Robotics", meta: "Reply 2h ago", moving: true },
    ],
  },
  {
    name: "Meeting Booked",
    tone: "border-amber-500/40",
    cards: [{ who: "Aisha Toure", co: "Northline Logistics", meta: "Thu 2:00pm" }],
  },
  {
    name: "Won",
    tone: "border-emerald-500/40",
    cards: [{ who: "Ravi Krishnan", co: "Bluepeak Health", meta: "Closed 1w ago" }],
  },
  {
    name: "Lost",
    tone: "border-rose-500/40",
    cards: [{ who: "Ivy Chen", co: "Palmwood", meta: "Not a fit" }],
  },
];

export function CrmPipelineMock() {
  return (
    <AppWindow title="CRM — Pipeline" breadcrumb="Acme Growth / CRM / Pipeline">
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground">
        <Filter className="size-3.5" />
        Default stages shown. Stages are configurable per workspace — rename, reorder or add your own.
      </div>
      <div className="min-w-0 overflow-x-auto p-4">
        <div className="flex min-w-[900px] gap-3">
          {pipeline.map((col) => (
            <div key={col.name} className="w-[150px] shrink-0">
              <div
                className={cn(
                  "rounded-lg border-t-2 bg-secondary/40 px-2.5 py-2 text-[11px] font-semibold",
                  col.tone,
                )}
              >
                {col.name}
                <span className="ml-1.5 font-normal text-muted-foreground">{col.cards.length}</span>
              </div>
              <div className="mt-2 space-y-2">
                {col.cards.map((c) => (
                  <div
                    key={c.who}
                    className={cn(
                      "rounded-xl border bg-card px-2.5 py-2",
                      c.moving
                        ? "border-primary/50 shadow-[0_10px_30px_-18px_hsl(var(--primary))]"
                        : "border-border/70",
                    )}
                  >
                    <div className="truncate text-[11px] font-medium">{c.who}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{c.co}</div>
                    <div className="mt-1.5 truncate text-[10px] text-muted-foreground">{c.meta}</div>
                    {c.moving ? (
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                        Moving <ArrowRight className="size-3" /> Meeting Booked
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

const tasks = [
  { title: "Review positive reply", who: "Marcus Lee · Fieldstack Robotics", due: "Today", tone: "warn" as const, label: "Due today" },
  { title: "Schedule meeting", who: "Aisha Toure · Northline Logistics", due: "Today", tone: "warn" as const, label: "Due today" },
  { title: "Follow up with prospect", who: "Devon Cross · Orbit Analytics", due: "Tomorrow", tone: "muted" as const, label: "Upcoming" },
  { title: "Contact prospect", who: "Hannah Boyd · Crestline Foods", due: "Fri", tone: "muted" as const, label: "Upcoming" },
  { title: "Update lead", who: "Lena Fischer · Vantive", due: "Yesterday", tone: "danger" as const, label: "Overdue" },
];

export function CrmTasksMock() {
  return (
    <AppWindow title="CRM — Tasks" breadcrumb="Acme Growth / CRM / Tasks">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3 text-[11px]">
        <span className="rounded-md bg-primary/12 px-2 py-1 font-medium text-primary">Open</span>
        <span className="text-muted-foreground">Overdue</span>
        <span className="text-muted-foreground">Completed</span>
        <Control icon={User}>Owner: Sam</Control>
      </div>
      <ul className="divide-y divide-border/60">
        {tasks.map((t) => (
          <li key={t.title} className="flex items-center gap-3 px-4 py-3">
            <span className="size-4 shrink-0 rounded border border-border" />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{t.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">{t.who}</div>
            </div>
            <span className="ml-auto shrink-0">
              <Pill tone={t.tone}>{t.label}</Pill>
            </span>
            <span className="hidden w-16 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
              {t.due}
            </span>
          </li>
        ))}
      </ul>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Organization                                                        */
/* ------------------------------------------------------------------ */

export function CrmOrganizationMock() {
  const groups = [
    { icon: Tag, label: "Tags", items: ["Interested", "Pricing", "Enterprise", "Wrong person", "Reschedule"] },
    { icon: CheckCircle2, label: "Lead status", items: ["New", "Contacted", "Replied", "Meeting Booked", "Won", "Lost"] },
    { icon: User, label: "Owner", items: ["Sam Patel", "Priya Nair", "Unassigned"] },
    { icon: Send, label: "Campaign", items: ["Q3 Ops Directors", "Founders — SaaS", "Reactivation"] },
    { icon: Building2, label: "Company", items: ["Fieldstack Robotics", "Northline Logistics", "Orbit Analytics"] },
    { icon: Inbox, label: "Lead source", items: ["CSV import", "Manual add", "Campaign reply"] },
  ];
  return (
    <AppWindow title="CRM — Filters" breadcrumb="Acme Growth / CRM">
      <div className="grid gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.label} className="bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <g.icon className="size-3.5" />
              {g.label}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {g.items.map((i) => (
                <span
                  key={i}
                  className="rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Flows                                                               */
/* ------------------------------------------------------------------ */

export function FlowChain({
  steps,
  dense = false,
}: {
  steps: { title: string; text?: string }[];
  dense?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s.title} className="flex items-stretch gap-2">
          <div
            className={cn(
              "rounded-xl border border-border/70 bg-card px-3.5 py-3 text-center",
              dense ? "w-[150px]" : "w-[168px]",
            )}
          >
            <div className="text-[10px] font-semibold text-primary">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="mt-1 text-xs font-medium">{s.title}</div>
            {s.text ? <p className="mt-1 text-[11px] text-muted-foreground">{s.text}</p> : null}
          </div>
          {i < steps.length - 1 ? (
            <span className="flex items-center text-muted-foreground">
              <ArrowRight className="size-4" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function InboxToCrmMock() {
  const nodes = [
    { icon: Send, label: "Campaign reply", text: "Prospect answers a sequence email." },
    { icon: Inbox, label: "UniBox", text: "The reply threads into the shared inbox." },
    { icon: User, label: "Lead", text: "The conversation is linked to the contact record." },
    { icon: StickyNote, label: "CRM activity", text: "The reply appears on the lead timeline." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {nodes.map((n, i) => (
        <div key={n.label} className="relative rounded-2xl border border-border/70 bg-card p-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <n.icon className="size-4" />
          </span>
          <h3 className="mt-3 text-sm font-semibold">{n.label}</h3>
          <p className="mt-1.5 text-xs text-muted-foreground">{n.text}</p>
          {i < nodes.length - 1 ? (
            <ArrowRight className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 text-muted-foreground lg:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
