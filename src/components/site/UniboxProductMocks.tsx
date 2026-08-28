import type { ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  AtSign,
  Clock,
  Inbox,
  Mail,
  Paperclip,
  Search,
  Send,
  StickyNote,
  Tag,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border/70 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function MailboxDot({ tone }: { tone: "a" | "b" | "c" }) {
  const tones = { a: "bg-primary", b: "bg-emerald-500", c: "bg-amber-500" } as const;
  return <span className={cn("size-2 shrink-0 rounded-full", tones[tone])} />;
}

/* ------------------------------------------------------------------ */
/* 3 — Full UniBox showcase                                            */
/* ------------------------------------------------------------------ */

const conversations = [
  {
    name: "Marcus Lee",
    company: "Fieldstack Robotics",
    snippet: "Can we grab 15 min this week?",
    mailbox: "sam@munchreach.dev",
    tone: "a" as const,
    time: "8:41am",
    tag: "Interested",
    tagTone: "ok" as const,
    active: true,
  },
  {
    name: "Aisha Toure",
    company: "Northline Logistics",
    snippet: "Send over pricing and I'll take a look.",
    mailbox: "priya@getmunchreach.io",
    tone: "b" as const,
    time: "8:12am",
    tag: "Pricing",
    tagTone: "primary" as const,
  },
  {
    name: "Devon Cross",
    company: "Orbit Analytics",
    snippet: "I'm out of office until the 14th.",
    mailbox: "sam@munchreach.dev",
    tone: "a" as const,
    time: "Yesterday",
    tag: "Snoozed",
    tagTone: "muted" as const,
  },
  {
    name: "Hannah Boyd",
    company: "Crestline Foods",
    snippet: "Who handles this on your side?",
    mailbox: "team@munchreachhq.com",
    tone: "c" as const,
    time: "Yesterday",
    tag: "Needs reply",
    tagTone: "warn" as const,
  },
];

export function UniboxMock() {
  return (
    <AppWindow title="UniBox" breadcrumb="Acme Growth / UniBox">
      <div className="grid min-w-0 lg:grid-cols-[190px_minmax(0,300px)_minmax(0,1fr)_240px]">
        {/* Mailbox sidebar */}
        <div className="hidden border-r border-border/70 lg:block">
          <PanelTitle>Mailboxes</PanelTitle>
          <ul className="space-y-1 p-2 text-sm">
            {[
              { label: "All conversations", count: "24", active: true },
              { label: "sam@munchreach.dev", count: "11", dot: "a" as const },
              { label: "priya@getmunchreach.io", count: "8", dot: "b" as const },
              { label: "team@munchreachhq.com", count: "5", dot: "c" as const },
            ].map((m) => (
              <li
                key={m.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2",
                  m.active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {m.dot ? <MailboxDot tone={m.dot} /> : <Inbox className="size-3.5 shrink-0" />}
                <span className="truncate text-xs font-medium">{m.label}</span>
                <span className="ml-auto text-[11px]">{m.count}</span>
              </li>
            ))}
          </ul>
          <PanelTitle>Views</PanelTitle>
          <ul className="space-y-1 p-2 text-xs text-muted-foreground">
            {["Assigned to me", "Unassigned", "Snoozed", "Archived"].map((v) => (
              <li key={v} className="rounded-lg px-2.5 py-1.5">
                {v}
              </li>
            ))}
          </ul>
        </div>

        {/* Conversation list */}
        <div className="border-r border-border/70">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
            <Search className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Search replies, people, companies</span>
          </div>
          <ul>
            {conversations.map((c) => (
              <li
                key={c.name}
                className={cn(
                  "border-b border-border/50 px-3 py-3 last:border-0",
                  c.active && "bg-primary/[0.06]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{c.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{c.time}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                <p className="mt-1 truncate text-xs text-foreground/80">{c.snippet}</p>
                <div className="mt-2 flex items-center gap-2">
                  <MailboxDot tone={c.tone} />
                  <span className="truncate text-[11px] text-muted-foreground">{c.mailbox}</span>
                  <span className="ml-auto">
                    <Pill tone={c.tagTone}>{c.tag}</Pill>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Thread */}
        <div className="min-w-0 border-r border-border/70">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Re: Quick question about Fieldstack</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Sent from sam@munchreach.dev · Campaign: Q4 Outbound — SaaS Founders
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
              <Tag className="size-3.5" />
              <Clock className="size-3.5" />
              <Archive className="size-3.5" />
              <User className="size-3.5" />
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-border/70 bg-background p-3">
              <p className="text-[11px] text-muted-foreground">You · Mon 9:02am · sam@munchreach.dev</p>
              <p className="mt-1 text-sm">
                Noticed Fieldstack is hiring three ops roles — usually that means onboarding is the
                bottleneck. Worth a quick look?
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-3">
              <p className="text-[11px] text-muted-foreground">You · Thu 9:14am · follow-up step 2</p>
              <p className="mt-1 text-sm">Following up — happy to send a two-minute walkthrough.</p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
              <p className="text-[11px] text-muted-foreground">Marcus Lee · Tue 8:41am</p>
              <p className="mt-1 text-sm">Can we grab 15 min this week? Thursday afternoon works.</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <StickyNote className="size-3" /> Internal note — not sent to the prospect
              </p>
              <p className="mt-1 text-sm">Sam: they asked about procurement last quarter. Loop in Priya.</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <p className="text-sm text-muted-foreground">
                Thursday 2pm works — sending an invite now.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                  <Send className="size-3.5" /> Reply from sam@munchreach.dev
                </span>
                <Pill tone="muted">
                  <Paperclip className="size-3" /> Attach
                </Pill>
                <Pill tone="muted">
                  <AtSign className="size-3" /> Mention
                </Pill>
                <Pill tone="muted">
                  <StickyNote className="size-3" /> Note
                </Pill>
              </div>
            </div>
          </div>
        </div>

        {/* Lead panel */}
        <div className="hidden xl:block">
          <PanelTitle>Lead</PanelTitle>
          <div className="space-y-3 p-3 text-xs">
            <div>
              <p className="text-sm font-semibold">Marcus Lee</p>
              <p className="text-muted-foreground">VP Operations · Fieldstack Robotics</p>
            </div>
            {[
              ["Campaign", "Q4 Outbound — SaaS Founders"],
              ["Sent from", "sam@munchreach.dev"],
              ["Sequence", "Stopped on reply"],
              ["Stage", "Meeting requested"],
              ["Owner", "Priya N."],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border/70 bg-background px-2.5 py-2">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{k}</p>
                <p className="mt-0.5 truncate font-medium">{v}</p>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="ok">Interested</Pill>
              <Pill tone="primary">Enterprise</Pill>
              <Pill tone="muted">Q4</Pill>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4A — One inbox for every mailbox                                    */
/* ------------------------------------------------------------------ */

export function MailboxRollupMock() {
  return (
    <AppWindow title="Mailboxes feeding UniBox" breadcrumb="UniBox / Sources">
      <div className="space-y-2 p-4">
        {[
          { m: "sam@munchreach.dev", n: "11 open", t: "a" as const },
          { m: "priya@getmunchreach.io", n: "8 open", t: "b" as const },
          { m: "team@munchreachhq.com", n: "5 open", t: "c" as const },
          { m: "sales@munchreachhq.com", n: "0 open", t: "c" as const },
        ].map((r) => (
          <div
            key={r.m}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
          >
            <MailboxDot tone={r.t} />
            <span className="truncate text-sm font-medium">{r.m}</span>
            <span className="ml-auto text-xs text-muted-foreground">{r.n}</span>
            <Pill tone="ok">Syncing</Pill>
          </div>
        ))}
        <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3.5 py-3 text-sm font-medium text-primary">
          <ArrowRight className="size-4" /> One UniBox — 24 conversations
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4B — Full conversation history                                      */
/* ------------------------------------------------------------------ */

export function ThreadHistoryMock() {
  return (
    <AppWindow title="Conversation history" breadcrumb="UniBox / Marcus Lee">
      <ol className="space-y-2 p-4">
        {[
          ["Mon 9:02am", "Step 1 sent from sam@munchreach.dev", "primary"],
          ["Mon 11:40am", "Opened", "muted"],
          ["Thu 9:14am", "Step 2 follow-up sent", "primary"],
          ["Tue 8:41am", "Reply received — thread matched", "ok"],
          ["Tue 8:41am", "Sequence stopped for this lead", "warn"],
          ["Tue 8:46am", "Assigned to Priya N.", "muted"],
          ["Tue 8:52am", "Internal note added by Sam", "muted"],
        ].map(([time, text, tone]) => (
          <li
            key={String(time) + String(text)}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
          >
            <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{time}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{text}</span>
            <Pill tone={tone as "primary" | "muted" | "ok" | "warn"}>Logged</Pill>
          </li>
        ))}
      </ol>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4C — Composer                                                       */
/* ------------------------------------------------------------------ */

export function ComposerMock() {
  return (
    <AppWindow title="Reply composer" breadcrumb="UniBox / Reply">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-xs">
          <Mail className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">From</span>
          <span className="font-medium">sam@munchreach.dev</span>
          <Pill tone="muted">Original sending account</Pill>
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-3.5">
          <p className="text-sm">Hi Marcus — Thursday 2pm works on my end.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            I'll send an invite with a short agenda so we can keep it to 15 minutes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            <Send className="size-3.5" /> Send reply
          </span>
          <Pill tone="muted">Snooze 3 days</Pill>
          <Pill tone="muted">Archive</Pill>
          <Pill tone="muted">Assign</Pill>
          <Pill tone="muted">Add tag</Pill>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4D — Routing and organisation                                       */
/* ------------------------------------------------------------------ */

export function RoutingMock() {
  return (
    <AppWindow title="Assign & organize" breadcrumb="UniBox / Triage">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Conversation</th>
              <th className="px-4 py-2.5 font-medium">Tag</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Marcus Lee", "Interested", "Priya N.", "Open", "ok"],
              ["Aisha Toure", "Pricing", "Sam K.", "Open", "primary"],
              ["Devon Cross", "Out of office", "Unassigned", "Snoozed to 14th", "muted"],
              ["Hannah Boyd", "Wrong person", "Sam K.", "Needs reply", "warn"],
            ].map(([name, tag, owner, state, tone]) => (
              <tr key={String(name)} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{name}</td>
                <td className="px-4 py-3">
                  <Pill tone={tone as "ok" | "primary" | "muted" | "warn"}>{tag}</Pill>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{owner}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Outbound flow                                                   */
/* ------------------------------------------------------------------ */

export function ReplyFlow({ steps }: { steps: string[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-stretch gap-3">
      {steps.map((s, i) => (
        <div key={s} className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
          <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card px-4 py-3">
            <span className="text-[11px] font-semibold text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="mt-1 text-sm font-medium">{s}</p>
          </div>
          {i < steps.length - 1 ? (
            <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground lg:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
