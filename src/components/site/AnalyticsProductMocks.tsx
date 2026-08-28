import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Filter,
  Layers,
  Mailbox,
  Send,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="min-w-0 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-bold tracking-tight",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Control({ children, icon: Icon }: { children: ReactNode; icon?: typeof Filter }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

/** Lightweight SVG line chart used only as an interface illustration. */
function LineChartMock({
  series,
  height = 150,
}: {
  series: { label: string; color: string; points: number[] }[];
  height?: number;
}) {
  const width = 640;
  const max = Math.max(...series.flatMap((s) => s.points), 1);
  const path = (points: number[]) =>
    points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = height - (p / max) * (height - 16) - 8;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <div className="min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Example performance chart"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={width}
            y1={height * g}
            y2={height * g}
            stroke="hsl(var(--border))"
            strokeWidth="1"
          />
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const PRIMARY = "hsl(var(--primary))";
const GREEN = "hsl(160 84% 39%)";
const AMBER = "hsl(38 92% 50%)";
const RED = "hsl(var(--destructive))";

/* ------------------------------------------------------------------ */
/* 1 — Dashboard                                                       */
/* ------------------------------------------------------------------ */

export function AnalyticsDashboardMock() {
  return (
    <AppWindow title="Analytics" breadcrumb="Acme Growth / Analytics">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <Control icon={CalendarDays}>Last 30 days</Control>
        <Control icon={Send}>Campaign: All</Control>
        <Control icon={Layers}>Workspace: Acme Growth</Control>
        <span className="ml-auto text-[11px] text-muted-foreground">Example interface</span>
      </div>
      <div className="grid gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Emails sent" value="4,820" sub="Across 6 campaigns" />
        <Kpi label="Reply rate" value="6.4%" sub="308 replies" tone="good" />
        <Kpi label="Bounce rate" value="1.2%" sub="58 bounced" tone="warn" />
        <Kpi label="Positive replies" value="97" sub="31% of replies" />
        <Kpi label="Meetings booked" value="24" sub="From CRM stage changes" />
      </div>
      <div className="grid min-w-0 gap-px bg-border/40 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Performance over time</span>
            <span className="text-[11px] text-muted-foreground">Sent · Replies · Bounces</span>
          </div>
          <div className="mt-3">
            <LineChartMock
              series={[
                { label: "Sent", color: PRIMARY, points: [120, 180, 160, 220, 260, 240, 300, 280] },
                { label: "Replies", color: GREEN, points: [8, 12, 10, 16, 20, 18, 24, 22] },
                { label: "Bounces", color: RED, points: [3, 4, 2, 5, 3, 2, 4, 3] },
              ]}
            />
          </div>
        </div>
        <div className="bg-card p-4">
          <span className="text-xs font-semibold">Campaign performance</span>
          <ul className="mt-3 space-y-2.5">
            {[
              { name: "Q3 Ops Directors", rate: 72, value: "8.1% reply" },
              { name: "Founders — SaaS", rate: 54, value: "6.0% reply" },
              { name: "Reactivation", rate: 33, value: "3.7% reply" },
              { name: "Agency partners", rate: 21, value: "2.4% reply" },
            ].map((c) => (
              <li key={c.name}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.value}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${c.rate}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 2 — Campaign performance table                                      */
/* ------------------------------------------------------------------ */

const rows = [
  { name: "Q3 Ops Directors", sent: "1,480", delivered: "1,462", replies: "120", rate: "8.1%", positive: "41", meetings: "11", bounce: "1.2%" },
  { name: "Founders — SaaS", sent: "1,120", delivered: "1,101", replies: "67", rate: "6.0%", positive: "22", meetings: "6", bounce: "1.7%" },
  { name: "Reactivation", sent: "980", delivered: "969", replies: "36", rate: "3.7%", positive: "9", meetings: "3", bounce: "1.1%" },
  { name: "Agency partners", sent: "760", delivered: "742", replies: "18", rate: "2.4%", positive: "5", meetings: "2", bounce: "2.4%" },
  { name: "Ops newsletter list", sent: "480", delivered: "474", replies: "12", rate: "2.5%", positive: "3", meetings: "2", bounce: "1.3%" },
];

export function CampaignPerformanceTableMock() {
  return (
    <AppWindow title="Analytics — Campaigns" breadcrumb="Acme Growth / Analytics / Campaigns">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <Control icon={CalendarDays}>Last 30 days</Control>
        <Control icon={Filter}>Status: Active</Control>
        <Control icon={TrendingUp}>Sort: Reply rate</Control>
        <span className="ml-auto text-[11px] text-muted-foreground">Example values</span>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Campaign</th>
              <th className="px-3 py-2.5 font-medium">Sent</th>
              <th className="px-3 py-2.5 font-medium">Delivered</th>
              <th className="px-3 py-2.5 font-medium">Replies</th>
              <th className="px-3 py-2.5 font-medium">Reply rate</th>
              <th className="px-3 py-2.5 font-medium">Positive</th>
              <th className="px-3 py-2.5 font-medium">Meetings</th>
              <th className="px-4 py-2.5 font-medium">Bounce rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.sent}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.delivered}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.replies}</td>
                <td className="px-3 py-3">
                  <Pill tone="primary">{r.rate}</Pill>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{r.positive}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.meetings}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.bounce}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 3 — Funnel                                                          */
/* ------------------------------------------------------------------ */

const funnel = [
  { label: "Leads", width: 100, text: "Contacts loaded into your campaigns." },
  { label: "Emails sent", width: 88, text: "Messages the engine actually dispatched." },
  { label: "Delivered", width: 82, text: "Accepted by the receiving provider." },
  { label: "Replies", width: 44, text: "Human responses matched back to a send." },
  { label: "Positive replies", width: 26, text: "Responses classified as interested." },
  { label: "Meetings", width: 14, text: "Logged from CRM stage changes on the lead." },
];

export function FunnelMock() {
  return (
    <div className="mx-auto max-w-3xl space-y-2.5">
      {funnel.map((f, i) => (
        <div key={f.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <div
            className="flex h-12 shrink-0 items-center rounded-xl border border-primary/25 bg-primary/[0.07] px-4 text-xs font-semibold"
            style={{ width: `${f.width}%`, minWidth: "42%" }}
          >
            <span className="mr-2 text-[10px] text-primary">{String(i + 1).padStart(2, "0")}</span>
            {f.label}
          </div>
          <p className="text-xs text-muted-foreground">{f.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — Reply analytics                                                 */
/* ------------------------------------------------------------------ */

export function ReplyAnalyticsMock() {
  return (
    <AppWindow title="Analytics — Replies" breadcrumb="Acme Growth / Analytics / Replies">
      <div className="grid gap-px bg-border/40 sm:grid-cols-4">
        <Kpi label="Replies" value="308" />
        <Kpi label="Reply rate" value="6.4%" tone="good" />
        <Kpi label="Positive replies" value="97" />
        <Kpi label="Meetings booked" value="24" />
      </div>
      <div className="bg-card p-4">
        <LineChartMock
          series={[
            { label: "Replies", color: PRIMARY, points: [10, 14, 12, 18, 22, 19, 26, 24] },
            { label: "Positive replies", color: GREEN, points: [3, 5, 4, 6, 8, 6, 9, 8] },
            { label: "Meetings", color: AMBER, points: [1, 1, 2, 2, 3, 2, 4, 3] },
          ]}
        />
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 5 — Delivery health                                                 */
/* ------------------------------------------------------------------ */

export function DeliveryHealthMock() {
  const items = [
    {
      label: "Delivered",
      value: "98.5%",
      text: "The receiving provider accepted the message.",
      tone: "border-emerald-500/30 bg-emerald-500/[0.06]",
    },
    {
      label: "Bounced",
      value: "1.2%",
      text: "The provider rejected the address — bad, blocked or nonexistent.",
      tone: "border-amber-500/30 bg-amber-500/[0.06]",
    },
    {
      label: "Failed sends",
      value: "0.3%",
      text: "The send never left — an internal or provider error, not a bounce.",
      tone: "border-destructive/30 bg-destructive/[0.05]",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className={cn("rounded-2xl border p-6", i.tone)}>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{i.label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">{i.value}</div>
          <p className="mt-3 text-sm text-muted-foreground">{i.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Today vs lifetime                                               */
/* ------------------------------------------------------------------ */

export function TodayVsLifetimeMock() {
  const today = [
    ["Emails sent", "412"],
    ["Replies", "26"],
    ["Reply rate", "6.3%"],
    ["Bounces", "4"],
    ["Meetings", "2"],
  ];
  const lifetime = [
    ["Total sent", "48,930"],
    ["Total replies", "3,104"],
    ["Overall reply rate", "6.3%"],
    ["Total bounces", "561"],
    ["Total meetings", "218"],
  ];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-2xl border border-primary/35 bg-primary/[0.05] p-6">
        <div className="flex items-center gap-2">
          <Pill tone="primary">Today</Pill>
          <span className="text-[11px] text-muted-foreground">Campaign timezone · America/Los_Angeles</span>
        </div>
        <dl className="mt-4 space-y-px">
          {today.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg bg-card px-3.5 py-2.5">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Resets at midnight in the campaign's own timezone, not the server's.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-muted/30 p-6">
        <div className="flex items-center gap-2">
          <Pill tone="muted">Lifetime</Pill>
          <span className="text-[11px] text-muted-foreground">Since the campaign was created</span>
        </div>
        <dl className="mt-4 space-y-px">
          {lifetime.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg bg-card px-3.5 py-2.5">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Every recorded event, with no rolling window applied.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7 — Trend with range controls + empty state                         */
/* ------------------------------------------------------------------ */

export function TrendMock() {
  return (
    <AppWindow title="Analytics — Trends" breadcrumb="Acme Growth / Analytics / Trends">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        {["7 days", "30 days", "90 days"].map((r, i) => (
          <span
            key={r}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[11px]",
              i === 1
                ? "bg-primary/12 font-medium text-primary"
                : "border border-border/70 text-muted-foreground",
            )}
          >
            {r}
          </span>
        ))}
        <Control icon={Send}>Campaign: All</Control>
      </div>
      <div className="bg-card p-4">
        <LineChartMock
          height={170}
          series={[
            { label: "Emails sent", color: PRIMARY, points: [140, 190, 175, 230, 265, 250, 305, 290] },
            { label: "Reply rate", color: GREEN, points: [40, 55, 48, 62, 70, 66, 78, 74] },
            { label: "Bounce rate", color: RED, points: [12, 16, 9, 18, 11, 8, 14, 10] },
            { label: "Meetings", color: AMBER, points: [5, 7, 6, 9, 12, 10, 14, 12] },
          ]}
        />
      </div>
      <div className="border-t border-border/70 bg-secondary/30 px-4 py-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Empty state: when a workspace has not sent enough yet, the chart says so instead of
            drawing a line — "Not enough campaign activity to show a trend yet."
          </p>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 8 — Compare campaigns                                               */
/* ------------------------------------------------------------------ */

export function CompareCampaignsMock() {
  const metrics = [
    { label: "Sent", a: "1,480", b: "1,120", winner: "a" as const },
    { label: "Reply rate", a: "8.1%", b: "6.0%", winner: "a" as const },
    { label: "Positive replies", a: "41", b: "22", winner: "a" as const },
    { label: "Meetings", a: "11", b: "6", winner: "a" as const },
    { label: "Bounce rate", a: "1.2%", b: "1.7%", winner: "a" as const },
  ];
  return (
    <AppWindow title="Analytics — Compare" breadcrumb="Acme Growth / Analytics / Compare">
      <div className="grid gap-px bg-border/40 sm:grid-cols-2">
        <div className="bg-card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Campaign A</div>
          <div className="mt-1 text-sm font-semibold">Q3 Ops Directors</div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Campaign B</div>
          <div className="mt-1 text-sm font-semibold">Founders — SaaS</div>
        </div>
      </div>
      <ul className="divide-y divide-border/60">
        {metrics.map((m) => (
          <li key={m.label} className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-3 px-4 py-3">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <span
              className={cn(
                "rounded-lg px-2 py-1 text-center text-xs font-semibold",
                m.winner === "a" ? "bg-primary/12 text-primary" : "bg-muted",
              )}
            >
              {m.a}
            </span>
            <span className="rounded-lg bg-muted px-2 py-1 text-center text-xs font-semibold">
              {m.b}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border/70 px-4 py-3 text-[11px] text-muted-foreground">
        Placeholder values shown for layout. Real comparisons use your own campaign data.
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 9 — Insight cards                                                   */
/* ------------------------------------------------------------------ */

export function InsightCards() {
  const insights = [
    { icon: ArrowUpRight, tone: "ok" as const, text: "Reply rate is higher than your previous period." },
    { icon: ArrowDownRight, tone: "warn" as const, text: "Bounce rate increased on this campaign." },
    { icon: TrendingUp, tone: "muted" as const, text: "This campaign is generating replies but fewer positive responses." },
    { icon: ArrowUpRight, tone: "primary" as const, text: "One campaign is generating more meetings with fewer sends." },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((i) => (
        <div key={i.text} className="rounded-2xl border border-border/70 bg-card p-5">
          <Pill tone={i.tone}>
            <i.icon className="size-3" /> Signal
          </Pill>
          <p className="mt-3 text-sm">{i.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10 — Campaign vs mailbox datasets                                   */
/* ------------------------------------------------------------------ */

export function CampaignVsMailboxMock() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Send className="size-4" />
        </span>
        <h3 className="mt-3 text-base font-semibold">Campaign analytics</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How your outreach performed with prospects.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {["Sends", "Deliveries", "Replies", "Bounces", "Meetings"].map((i) => (
            <li key={i} className="rounded-lg bg-card px-3 py-2">
              {i}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-border bg-muted/30 p-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Mailbox className="size-4" />
        </span>
        <h3 className="mt-3 text-base font-semibold">Mailbox health &amp; warmup</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How your sending accounts themselves are doing.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {["Mailbox health", "Warmup activity", "Sending capacity", "Safety state"].map((i) => (
            <li key={i} className="rounded-lg bg-card px-3 py-2">
              {i}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow chain                                                          */
/* ------------------------------------------------------------------ */

export function MetricFlow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className="rounded-xl border border-border/70 bg-card px-3.5 py-2 text-xs font-medium">
            {s}
          </span>
          {i < steps.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" /> : null}
        </div>
      ))}
    </div>
  );
}
