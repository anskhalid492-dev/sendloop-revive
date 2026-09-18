import type { ReactNode } from "react";

import scheduleScreenshot from "@/assets/campaign-schedule.png.asset.json";
import aiPersonalizationScreenshot from "@/assets/campaign-ai-personalization.png.asset.json";

import {
  ArrowRight,
  Ban,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Mail,
  MailX,
  Pause,
  Play,
  RotateCcw,
  Send,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

/** App-window chrome used for every campaign screenshot on this page. */
export function AppWindow({
  title,
  breadcrumb,
  children,
  className,
}: {
  title: string;
  breadcrumb?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_30px_80px_-60px_hsl(var(--primary)/0.6)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/70 bg-secondary/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-destructive/40" />
        <span className="size-2.5 rounded-full bg-primary/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-3 truncate text-xs font-medium">{title}</span>
        {breadcrumb ? (
          <span className="ml-auto hidden truncate text-[11px] text-muted-foreground sm:block">
            {breadcrumb}
          </span>
        ) : null}
      </div>
      <div className="bg-card">{children}</div>
    </div>
  );
}

export function Pill({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "muted" | "warn" | "danger" | "ok";
}) {
  const tones = {
    primary: "bg-primary/12 text-primary",
    ok: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    danger: "bg-destructive/12 text-destructive",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function FieldRow({
  label,
  value,
  hint,
  right,
}: {
  label: string;
  value: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
        {hint ? <div className="truncate text-[11px] text-muted-foreground">{hint}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** Numbered callout marker used to annotate a screenshot. */
export function Callouts({ items }: { items: { n: number; text: string }[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => (
        <li key={c.n} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/60 p-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
            {c.n}
          </span>
          <span className="text-sm text-muted-foreground">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Marker({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 1 + 2 — Campaign builder                                            */
/* ------------------------------------------------------------------ */

export function CampaignBuilderMock() {
  return (
    <AppWindow title="Campaign builder" breadcrumb="Campaigns / Q4 Outbound — SaaS Founders">
      <div className="grid gap-0 lg:grid-cols-[210px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-1 border-r border-border/70 p-3 lg:flex">
          {[
            ["Overview", true],
            ["Leads", false],
            ["Sequence", false],
            ["AI personalization", false],
            ["Sending accounts", false],
            ["Schedule", false],
            ["Options", false],
            ["Analytics", false],
          ].map(([label, active]) => (
            <span
              key={String(label)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-sm",
                active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {String(label)}
            </span>
          ))}
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3 border-b border-border/70 pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Marker n={1} />
                <span className="truncate text-base font-semibold">Q4 Outbound — SaaS Founders</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Created 12 Sep · Workspace: Acme Growth
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Pill tone="ok">
                <Play className="size-3" /> Running
              </Pill>
              <Pill tone="muted">Autosaved</Pill>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldRow
              label="Leads"
              value="1,240 leads"
              hint="List: SaaS founders — Q4 import"
              right={<Marker n={2} />}
            />
            <FieldRow
              label="Sequence"
              value="4 steps"
              hint="Intro + 3 follow-ups"
              right={<Marker n={3} />}
            />
            <FieldRow
              label="Sending accounts"
              value="3 mailboxes"
              hint="sam@ · hello@ · outreach@"
              right={<Marker n={4} />}
            />
            <FieldRow
              label="Schedule"
              value="6:00 PM → 11:00 PM"
              hint="Asia/Dubai · Mon–Sat"
              right={<Marker n={5} />}
            />
            <FieldRow
              label="Daily limit"
              value="180 / day"
              hint="142 sent today"
              right={<Marker n={6} />}
            />
            <FieldRow
              label="Campaign status"
              value="Running · sending window open"
              hint="Next follow-ups queued for tomorrow"
              right={null}
            />
          </div>

          <div className="mt-4 rounded-xl border border-border/70 bg-background p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Today&rsquo;s progress</span>
              <span className="text-muted-foreground">142 / 180 sent</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: "79%" }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <Pill tone="muted">Tracking on</Pill>
              <Pill tone="muted">Stop on reply</Pill>
              <Pill tone="muted">Suppression checked</Pill>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 3 — Sequence builder                                                */
/* ------------------------------------------------------------------ */

const sequenceSteps = [
  { n: 1, title: "Initial email", delay: "Day 0", subject: "{{first_name}}, quick question about {{company}}" },
  { n: 2, title: "Follow-up", delay: "Day 3", subject: "Re: {{company}} — one more thought" },
  { n: 3, title: "Follow-up", delay: "Day 7", subject: "Worth a 15-min look?" },
  { n: 4, title: "Final follow-up", delay: "Day 12", subject: "Closing the loop, {{first_name}}" },
];

export function SequenceMock() {
  return (
    <AppWindow title="Sequence" breadcrumb="Q4 Outbound — SaaS Founders / Sequence">
      <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 border-b border-border/70 p-4 lg:border-b-0 lg:border-r">
          {sequenceSteps.map((s) => (
            <div
              key={s.n}
              className={cn(
                "rounded-xl border px-3 py-2.5",
                s.n === 1 ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-semibold text-primary">
                  {s.n}
                </span>
                <span className="text-sm font-medium">{`Step ${s.n} — ${s.title}`}</span>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">{s.subject}</p>
              <div className="mt-2 flex items-center gap-2">
                <Pill tone="muted">
                  <Clock className="size-3" /> {s.delay}
                </Pill>
                {s.n === 1 ? <Pill>AI opener</Pill> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Step 1 — Initial email</span>
            <Pill tone="muted">Delay: send immediately</Pill>
            <span className="ml-auto text-xs text-muted-foreground">Preview as: Sarah Chen</span>
          </div>

          <div className="mt-3 rounded-xl border border-border/70 bg-background">
            <div className="border-b border-border/70 px-3.5 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</div>
              <div className="mt-0.5 text-sm font-medium">
                {"{{first_name}}, quick question about {{company}}"}
              </div>
            </div>
            <div className="px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
              <p>Hi {"{{first_name}}"},</p>
              <p className="mt-2">
                <span className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary">
                  {"{{ai_personalization}}"}
                </span>
              </p>
              <p className="mt-2">
                We help teams like {"{{company}}"} run outbound without babysitting mailboxes. Worth a
                short look next week?
              </p>
              <p className="mt-2">— Sam</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-3.5 py-2.5">
              {["{{first_name}}", "{{company}}", "{{job_title}}", "{{ai_personalization}}"].map((v) => (
                <span
                  key={v}
                  className="rounded-md border border-border/70 bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {v}
                </span>
              ))}
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary">
                <Bot className="size-3" /> AI personalization on
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — AI personalization                                              */
/* ------------------------------------------------------------------ */

export function AiPersonalizationMock() {
  return (
    <AppWindow title="Sequence" breadcrumb="Q4 Outbound / Sequence / AI personalization">
      <img
        src={aiPersonalizationScreenshot.url}
        alt="Sequence editor with AI Personalization and AI Campaign Writer tools, subject and email body with variables"
        className="block w-full"
        loading="lazy"
      />
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 5 — Sending accounts                                                */
/* ------------------------------------------------------------------ */

const mailboxes = [
  {
    email: "sam@munchreach.dev",
    warmup: "Warmup active · day 41",
    used: 62,
    cap: 80,
    status: "Sending",
    tone: "ok" as const,
  },
  {
    email: "hello@munchreachmail.com",
    warmup: "Warmup active · day 12",
    used: 24,
    cap: 25,
    status: "Capacity reached",
    tone: "warn" as const,
  },
  {
    email: "outreach@getmunchreach.io",
    warmup: "Warmup complete",
    used: 78,
    cap: 120,
    status: "Sending",
    tone: "ok" as const,
  },
  {
    email: "team@munchreachhq.com",
    warmup: "Warmup paused",
    used: 0,
    cap: 60,
    status: "Blocked — bounce rate",
    tone: "danger" as const,
  },
];

export function MailboxMock() {
  return (
    <AppWindow title="Sending accounts" breadcrumb="Q4 Outbound / Sending accounts">
      <div className="p-4 sm:p-5">
        <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] gap-3 px-3 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Mailbox</span>
          <span>Health</span>
          <span>Capacity (12h window)</span>
          <span>Status</span>
        </div>
        <div className="space-y-2">
          {mailboxes.map((m) => (
            <div
              key={m.email}
              className="grid gap-2 rounded-xl border border-border/70 bg-background px-3.5 py-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] sm:items-center sm:gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{m.email}</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{m.warmup}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {m.tone === "danger" ? "Needs attention" : "Healthy"}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {m.used} / {m.cap} sent
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      m.tone === "danger" ? "bg-destructive/60" : "bg-primary",
                    )}
                    style={{ width: `${Math.round((m.used / m.cap) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={m.tone}>
                  {m.tone === "danger" ? <Pause className="size-3" /> : <Send className="size-3" />}
                  {m.status}
                </Pill>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3.5 py-2.5 text-xs text-muted-foreground">
          <Users className="size-3.5 text-primary" />
          Available capacity right now: <span className="font-medium text-foreground">86 emails</span>
          across 2 sending accounts.
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Scheduling                                                      */
/* ------------------------------------------------------------------ */

export function ScheduleMock() {
  return (
    <AppWindow title="Schedule" breadcrumb="Q4 Outbound / Schedule">
      <img
        src={scheduleScreenshot.url}
        alt="Campaign schedule settings — sending days, sending window, pacing, campaign dates and a throughput estimate"
        className="block w-full"
        loading="lazy"
      />
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 7 — Multi-day timeline                                              */
/* ------------------------------------------------------------------ */

const timeline = [
  {
    day: "Day 1",
    badge: "Running",
    tone: "ok" as const,
    events: [
      "Campaign starts at 6:00 PM",
      "Sends until the daily capacity is reached",
      "Remaining leads stay queued",
    ],
  },
  {
    day: "Day 2",
    badge: "Resumed",
    tone: "primary" as const,
    events: [
      "Campaign resumes automatically at 6:00 PM",
      "The remaining queue continues where it stopped",
      "Eligible failed messages are retried",
    ],
  },
  {
    day: "Day 3",
    badge: "Continuing",
    tone: "primary" as const,
    events: [
      "Campaign continues in the same window",
      "Follow-up steps enter the queue",
      "More new leads are processed",
    ],
  },
];

export function DayTimeline() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {timeline.map((d) => (
        <div key={d.day} className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              {d.day}
            </span>
            <Pill tone={d.tone}>{d.badge}</Pill>
          </div>
          <ol className="mt-4 space-y-3">
            {d.events.map((e, i) => (
              <li key={e} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-2 rounded-full bg-primary" />
                  {i < d.events.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-border" />
                  ) : null}
                </div>
                <span className="pb-1 text-sm text-muted-foreground">{e}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8 — Failure routing                                                 */
/* ------------------------------------------------------------------ */

const outcomes = [
  {
    icon: RotateCcw,
    from: "Temporary failure",
    to: "Retry",
    tone: "warn" as const,
    text: "Provider timeouts, rate limits and capacity errors stay eligible and are retried on the next run.",
  },
  {
    icon: Ban,
    from: "Permanent failure",
    to: "Stop",
    tone: "danger" as const,
    text: "A rejection that will not change is marked failed instead of retried again and again.",
  },
  {
    icon: MailX,
    from: "Bounce",
    to: "Suppress",
    tone: "danger" as const,
    text: "A permanently undeliverable address is suppressed so no further step is sent to it.",
  },
  {
    icon: CheckCircle2,
    from: "Successful send",
    to: "Continue sequence",
    tone: "ok" as const,
    text: "The lead moves on to the next step at its configured delay, unless they reply first.",
  },
];

export function FailureRouting() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {outcomes.map((o) => (
        <div key={o.from} className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary">
              <o.icon className="size-4 text-primary" />
            </span>
            <span className="text-sm font-semibold">{o.from}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <Pill tone={o.tone}>{o.to}</Pill>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{o.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9 — Analytics                                                       */
/* ------------------------------------------------------------------ */

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function AnalyticsMock() {
  const chart = [34, 52, 41, 68, 74, 58, 80, 66, 91, 77, 84, 96];
  return (
    <AppWindow title="Campaign analytics" breadcrumb="Q4 Outbound / Analytics">
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary">
            Today
          </span>
          <span className="text-[11px] text-muted-foreground">Asia/Dubai · since 6:00 PM</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Emails sent" value="142" sub="of 180 daily limit" />
          <Metric label="Delivered" value="139" />
          <Metric label="Replies" value="11" sub="Reply rate 7.9%" />
          <Metric label="Bounces" value="3" sub="Bounce rate 2.1%" />
        </div>

        <div className="mt-5 flex items-center gap-2">
          <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium">
            Lifetime campaign results
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Emails sent" value="3,884" />
          <Metric label="Replies" value="291" sub="Reply rate 7.5%" />
          <Metric label="Positive replies" value="96" />
          <Metric label="Meetings booked" value="34" />
          <Metric label="Failed" value="18" sub="Excludes bounces" />
        </div>

        <div className="mt-5 rounded-xl border border-border/70 bg-background p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Sends per day — last 12 days</span>
            <span className="text-muted-foreground">Campaign sending only</span>
          </div>
          <div className="mt-3 flex h-28 items-end gap-1.5">
            {chart.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${v}%` }}
                aria-hidden
              />
            ))}
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 10 — Unified inbox                                                  */
/* ------------------------------------------------------------------ */

const threads = [
  { name: "Sarah Chen", company: "Northwind", preview: "Interesting — how does the pricing work?", badge: "Interested", tone: "ok" as const, active: true },
  { name: "Miguel Ortiz", company: "Ardor Labs", preview: "Can you send a time for Thursday?", badge: "Meeting", tone: "primary" as const },
  { name: "Priya N.", company: "Halberd", preview: "Out of office until the 14th.", badge: "OOO", tone: "muted" as const },
  { name: "Tom Baker", company: "Craftly", preview: "Not right now, thanks.", badge: "Not interested", tone: "muted" as const },
];

export function InboxMock() {
  return (
    <AppWindow title="Unified inbox" breadcrumb="Inbox / Q4 Outbound">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,240px)]">
        <div className="border-b border-border/70 p-3 lg:border-b-0 lg:border-r">
          {threads.map((t) => (
            <div
              key={t.name}
              className={cn(
                "rounded-xl px-3 py-2.5",
                t.active ? "bg-primary/5 ring-1 ring-primary/25" : "",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {t.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate text-sm font-medium">{t.name}</span>
                <Pill tone={t.tone}>{t.badge}</Pill>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{t.preview}</p>
            </div>
          ))}
        </div>

        <div className="min-w-0 border-b border-border/70 p-4 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Sarah Chen — Northwind</span>
            <Pill tone="muted">Campaign: Q4 Outbound</Pill>
            <Pill tone="muted">via sam@munchreach.dev</Pill>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-border/70 bg-background p-3">
              <div className="text-[11px] text-muted-foreground">You · Step 1 · 6:12 PM</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Hi Sarah, noticed your team recently expanded into procurement tooling…
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="text-[11px] text-muted-foreground">Sarah Chen · 9:41 AM</div>
              <p className="mt-1 text-sm">Interesting — how does the pricing work?</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border/70 bg-background px-3.5 py-3 text-xs text-muted-foreground">
            Reply · Assign · Snooze · Tag · Mark interested
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lead record</div>
          <div className="mt-2 space-y-1.5 text-xs">
            {[
              ["Company", "Northwind"],
              ["Job title", "Head of Ops"],
              ["Campaign", "Q4 Outbound"],
              ["Sending account", "sam@munchreach.dev"],
              ["Sequence step", "Step 1 of 4"],
              ["Status", "Interested"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 11 — Launch process                                                 */
/* ------------------------------------------------------------------ */

export function LaunchProcess({
  steps,
}: {
  steps: { n: string; title: string; text: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((s) => (
        <div key={s.n} className="rounded-2xl border border-border/70 bg-card p-5">
          <span className="text-2xl font-extrabold tracking-tight text-primary/40">{s.n}</span>
          <h3 className="mt-2 text-sm font-semibold">{s.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

export function AfterLaunchStrip({ items }: { items: string[] }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 rounded-2xl border border-border/70 bg-secondary/30 px-5 py-5">
      {items.map((item, i) => (
        <span key={item} className="flex items-center gap-2">
          <span className="rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-sm">{item}</span>
          {i < items.length - 1 ? <ArrowRight className="size-3.5 text-muted-foreground" /> : null}
        </span>
      ))}
    </div>
  );
}
