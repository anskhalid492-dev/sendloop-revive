import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Gauge,
  Mail,
  PauseCircle,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger" | "muted" | "primary";

function Meter({ level, tone = "primary" }: { level: number; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    ok: "bg-success",
    warn: "bg-warning",
    danger: "bg-destructive",
    muted: "bg-muted-foreground/35",
    primary: "bg-primary",
  };
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${level}%` }} />
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{children}</span>;
}

function IllustrativeLabel() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
      <Activity className="size-3" /> Illustrative product view
    </span>
  );
}

export function HeroWarmupMock() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute -inset-5 rounded-[2rem] bg-primary/5 blur-2xl" aria-hidden="true" />
      <div className="browser-frame relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-secondary/45 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Flame className="size-4" /></span>
            <div><p className="text-xs font-semibold">Mailbox warmup</p><p className="text-[10px] text-muted-foreground">Sending health</p></div>
          </div>
          <Pill tone="primary">Warming</Pill>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><Label>Mailbox</Label><p className="mt-1 truncate text-sm font-semibold">hello@yourcompany.com</p></div>
            <div className="text-right"><Label>Health</Label><p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-success"><ShieldCheck className="size-4" /> Good</p></div>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-end justify-between gap-3"><div><Label>Warmup progress</Label><p className="mt-1 text-xl font-bold">Ramp up</p></div><p className="text-xs text-muted-foreground">14 / 24 today</p></div>
            <div className="mt-3"><Meter level={58} /></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><Label>Current volume</Label><p className="mt-1 text-sm font-semibold">24 / day</p></div>
              <div><Label>Target volume</Label><p className="mt-1 text-sm font-semibold">40 / day</p></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "Sent", value: "14" }, { label: "Replies", value: "2" }, { label: "Bounces", value: "0" }].map((item) => (
              <div key={item.label} className="rounded-lg bg-secondary/55 px-3 py-2.5"><Label>{item.label}</Label><p className="mt-1 text-base font-semibold tabular-nums">{item.value}</p></div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5 text-primary" /><span>Recent activity recorded a few minutes ago</span></div>
        </div>
      </div>
    </div>
  );
}

const dashboardRows = [
  { mailbox: "hello@yourcompany.com", health: "Good", healthTone: "ok" as const, state: "Warming", stateTone: "primary" as const, today: "14 / 24", progress: 58, stage: "Ramp up", reason: "Volume held steady", activity: "A few minutes ago" },
  { mailbox: "sales@northstar.io", health: "Good", healthTone: "ok" as const, state: "Active", stateTone: "ok" as const, today: "32 / 36", progress: 89, stage: "Stable", reason: "Health signals stable", activity: "12 minutes ago" },
  { mailbox: "team@sampleco.com", health: "Fair", healthTone: "warn" as const, state: "Paused", stateTone: "muted" as const, today: "6 / 18", progress: 33, stage: "Hold", reason: "Needs attention", activity: "1 hour ago" },
];

export function WarmupDashboardMock() {
  return (
    <AppWindow title="Inbox Warmup" breadcrumb="Workspace / Warmup">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex gap-2"><Pill tone="primary">All mailboxes</Pill><Pill tone="muted">Warming</Pill><Pill tone="muted">Paused</Pill></div>
        <IllustrativeLabel />
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead><tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">{["Mailbox", "Health", "Warmup", "Today's volume", "Ramp state", "Current reason", "Last activity"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead>
          <tbody>{dashboardRows.map((row) => <tr key={row.mailbox} className="border-b border-border/60 last:border-0">
            <td className="px-4 py-4 font-semibold">{row.mailbox}</td><td className="px-4 py-4"><Pill tone={row.healthTone}>{row.health}</Pill></td><td className="px-4 py-4"><Pill tone={row.stateTone}>{row.state}</Pill></td>
            <td className="w-36 px-4 py-4"><div className="mb-1.5 flex justify-between"><span>{row.today}</span><span className="text-muted-foreground">daily</span></div><Meter level={row.progress} tone={row.healthTone} /></td>
            <td className="px-4 py-4 font-medium">{row.stage}</td><td className="px-4 py-4 text-muted-foreground">{row.reason}</td><td className="px-4 py-4 whitespace-nowrap text-muted-foreground">{row.activity}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 md:hidden">{dashboardRows.map((row) => <div key={row.mailbox} className="rounded-lg border border-border p-3">
        <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-xs font-semibold">{row.mailbox}</p><Pill tone={row.stateTone}>{row.state}</Pill></div>
        <div className="mt-3 flex items-center justify-between text-xs"><span>{row.stage}</span><span className="text-muted-foreground">{row.today}</span></div><div className="mt-2"><Meter level={row.progress} tone={row.healthTone} /></div><p className="mt-2 text-[11px] text-muted-foreground">{row.reason} · {row.activity}</p>
      </div>)}</div>
    </AppWindow>
  );
}

export function ProductCallouts() {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
    [ShieldCheck, "Mailbox health", "A quick view of each account's current health."],
    [TrendingUp, "Controlled volume", "Today's activity shown against its planned target."],
    [Activity, "Ramp state", "Ramp Up, Stable, Hold, Recovery, or Pause."],
    [AlertTriangle, "Clear reasons", "See why volume changed or why action is needed."],
  ].map(([Icon, title, text]) => { const C = Icon as LucideIcon; return <div key={String(title)} className="flex gap-3 border-l-2 border-primary/30 pl-3"><C className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">{title as string}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text as string}</p></div></div>; })}</div>;
}

export function WarmupSettingsMock() {
  const presets = [
    { name: "Conservative", text: "Slower ramp for newer or more sensitive mailboxes." },
    { name: "Balanced", text: "A sensible default for most mailboxes." },
    { name: "Aggressive", text: "Faster ramp for established mailboxes with clean history." },
  ];
  return <AppWindow title="Warmup settings" breadcrumb="hello@yourcompany.com">
    <div className="space-y-5 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-3">{presets.map((preset, index) => <div key={preset.name} className={cn("rounded-lg border p-4", index === 1 ? "border-primary bg-primary/5" : "border-border bg-background")}><div className="flex items-center justify-between"><p className="text-sm font-semibold">{preset.name}</p>{index === 1 ? <CheckCircle2 className="size-4 text-primary" /> : null}</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{preset.text}</p></div>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ["Starting warmup volume", "4 / day"], ["Target daily volume", "40 / day"], ["Ramp speed", "Controlled increase"], ["Warmup schedule", "Weekdays · 8:00–18:00"], ["Bounce protection", "Monitoring"], ["Minimum health", "Safety threshold set"],
      ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-secondary/35 p-3"><Label>{label}</Label><p className="mt-1.5 text-sm font-semibold">{value}</p></div>)}</div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><div><p className="text-sm font-semibold">Auto-pause on poor health</p><p className="text-xs text-muted-foreground">Stops warmup when configured protection rules are triggered.</p></div><span className="relative h-5 w-9 shrink-0 rounded-full bg-primary"><span className="absolute right-0.5 top-0.5 size-4 rounded-full bg-primary-foreground" /></span></div>
      <p className="text-xs text-muted-foreground">Preset examples are illustrative. Actual volume stays bounded by mailbox health, account limits, and available sending capacity.</p>
    </div>
  </AppWindow>;
}

export function SeparateTracksMock() {
  const columns = [
    { icon: Flame, title: "Warmup", tone: "bg-primary/8 text-primary", items: ["Gradual mailbox activity", "Mailbox health", "Warmup volume", "Warmup progress", "Reputation monitoring"] },
    { icon: Mail, title: "Campaign sending", tone: "bg-tint-violet text-tint-violet-foreground", items: ["Prospect emails", "Campaign limits", "Sending schedule", "Follow-ups", "Campaign analytics"] },
  ];
  return <div className="grid gap-4 md:grid-cols-2">{columns.map((column) => <div key={column.title} className="rounded-lg border border-border bg-card p-5 sm:p-6"><div className="flex items-center gap-3"><span className={cn("grid size-9 place-items-center rounded-lg", column.tone)}><column.icon className="size-4" /></span><h3 className="text-lg font-bold">{column.title}</h3></div><ul className="mt-5 space-y-3">{column.items.map((item) => <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground"><CheckCircle2 className="size-4 shrink-0 text-primary" />{item}</li>)}</ul></div>)}</div>;
}

export function WarmupActivityMock() {
  const bars = [28, 36, 43, 49, 58, 58, 52, 47, 51, 56, 62, 68, 72, 76];
  return <AppWindow title="Warmup activity" breadcrumb="Last 14 days / All mailboxes">
    <div className="border-b border-border p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Label>Daily warmup history</Label><p className="mt-1 text-sm font-semibold">Planned and actual mailbox activity</p></div><IllustrativeLabel /></div>
      <div className="mt-6 flex h-32 items-end gap-1.5 sm:gap-2">{bars.map((bar, index) => <div key={`${bar}-${index}`} className="flex h-full flex-1 items-end"><div className={cn("w-full rounded-t-sm", index === 6 || index === 7 ? "bg-warning/60" : "bg-primary/70")} style={{ height: `${bar}%` }} /></div>)}</div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>14 days ago</span><span>Today</span></div>
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">{[
      { icon: TrendingUp, title: "Ramp up", text: "Volume increased after stable activity." },
      { icon: PauseCircle, title: "Hold", text: "Volume held while a signal was uncertain." },
      { icon: RotateCcw, title: "Recovery", text: "Controlled warmup continued at lower volume." },
    ].map((item) => <div key={item.title} className="flex gap-3 rounded-lg bg-secondary/45 p-3"><item.icon className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.text}</p></div></div>)}</div>
    <div className="border-t border-border bg-primary/5 px-4 py-3 text-xs text-muted-foreground sm:px-5">Warmup activity stays in Warmup. It does not appear as prospect conversation or campaign performance.</div>
  </AppWindow>;
}

export function MailboxManagementMock() {
  const rows = [
    ["hello@yourcompany.com", "yourcompany.com", "Active", "Warming", "Good", "40/day", "20/hour", "Spring outreach", "Minutes ago"],
    ["sales@northstar.io", "northstar.io", "Active", "Enabled", "Good", "50/day", "20/hour", "Not assigned", "12 min ago"],
    ["team@sampleco.com", "sampleco.com", "Paused", "Paused", "Fair", "30/day", "15/hour", "Q4 accounts", "1 hour ago"],
  ];
  return <AppWindow title="Email Accounts" breadcrumb="Workspace / Sending accounts">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><p className="text-xs text-muted-foreground">All connected sending accounts</p><IllustrativeLabel /></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-xs"><thead><tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">{["Mailbox", "Domain", "Status", "Warmup", "Health", "Daily limit", "Hourly limit", "Campaign assignment", "Recent activity"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row[0]} className="border-b border-border/60 last:border-0">{row.map((cell, index) => <td key={`${row[0]}-${index}`} className={cn("px-4 py-4 whitespace-nowrap", index === 0 ? "font-semibold" : "text-muted-foreground")}>{index === 2 || index === 3 || index === 4 ? <Pill tone={cell === "Paused" || cell === "Fair" ? "warn" : index === 3 ? "primary" : "ok"}>{cell}</Pill> : cell}</td>)}</tr>)}</tbody></table></div>
  </AppWindow>;
}

export function HealthTimeline() {
  return <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">{[
    { icon: ShieldCheck, label: "Healthy", text: "Signals stable", tone: "text-success bg-success/10" },
    { icon: AlertTriangle, label: "Warning", text: "Monitor or hold", tone: "text-warning bg-warning/10" },
    { icon: PauseCircle, label: "Action needed", text: "Pause or recover", tone: "text-destructive bg-destructive/10" },
  ].map((item, index) => <div key={item.label} className="contents"><div className="rounded-lg border border-border bg-card p-4 text-center"><span className={cn("mx-auto grid size-9 place-items-center rounded-lg", item.tone)}><item.icon className="size-4" /></span><p className="mt-3 text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.text}</p></div>{index < 2 ? <div className="hidden h-px w-8 bg-border sm:block" /> : null}</div>)}</div>;
}

export function MiniControl({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className="flex gap-3 rounded-lg border border-border bg-card p-5"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>;
}

export const warmupVisualIcons = { Gauge, CalendarDays, Settings2, Play };