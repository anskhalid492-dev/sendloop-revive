import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Flame,
  Gauge,
  KeyRound,
  Mail,
  MoreHorizontal,
  Pause,
  Play,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Meter({ level, tone = "ok" }: { level: number; tone?: "ok" | "warn" | "danger" | "muted" }) {
  const tones = {
    ok: "bg-primary",
    warn: "bg-amber-500",
    danger: "bg-destructive",
    muted: "bg-muted-foreground/30",
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${level}%` }} />
    </div>
  );
}

function FilterTabs({ items, active }: { items: string[]; active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((i) => (
        <span
          key={i}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            i === active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/70 bg-card text-muted-foreground",
          )}
        >
          {i}
        </span>
      ))}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-sm font-semibold",
          tone === "ok" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 + 3 — Email accounts dashboard                                    */
/* ------------------------------------------------------------------ */

type Row = {
  mailbox: string;
  domain: string;
  provider: string;
  status: string;
  statusTone: "ok" | "warn" | "danger" | "primary" | "muted";
  health: string;
  warmup: string;
  capacity: number;
  capacityTone: "ok" | "warn" | "danger" | "muted";
  capacityLabel: string;
};

const rows: Row[] = [
  {
    mailbox: "sam@",
    domain: "munchreach.dev",
    provider: "Google Workspace",
    status: "Active",
    statusTone: "ok",
    health: "Healthy",
    warmup: "Active · day 41",
    capacity: 58,
    capacityTone: "ok",
    capacityLabel: "Capacity available",
  },
  {
    mailbox: "hello@",
    domain: "munchreachmail.com",
    provider: "Custom SMTP",
    status: "Warming",
    statusTone: "primary",
    health: "Good",
    warmup: "Active · day 12",
    capacity: 96,
    capacityTone: "warn",
    capacityLabel: "Capacity reached",
  },
  {
    mailbox: "outreach@",
    domain: "getmunchreach.io",
    provider: "Amazon SES",
    status: "Active",
    statusTone: "ok",
    health: "Healthy",
    warmup: "Complete",
    capacity: 34,
    capacityTone: "ok",
    capacityLabel: "Capacity available",
  },
  {
    mailbox: "team@",
    domain: "munchreachhq.com",
    provider: "Microsoft 365",
    status: "Paused",
    statusTone: "muted",
    health: "Needs attention",
    warmup: "Paused",
    capacity: 0,
    capacityTone: "muted",
    capacityLabel: "Paused by you",
  },
  {
    mailbox: "sales@",
    domain: "munchreachhq.com",
    provider: "Custom SMTP",
    status: "Blocked",
    statusTone: "danger",
    health: "Bounce rate",
    warmup: "Held",
    capacity: 0,
    capacityTone: "danger",
    capacityLabel: "Safety block active",
  },
];

export function AccountsDashboardMock() {
  return (
    <AppWindow title="Email accounts" breadcrumb="Acme Growth / Email accounts">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <FilterTabs items={["All", "Active", "Warming", "Paused", "Blocked"]} active="All" />
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Mail className="size-3.5" /> Connect account
        </span>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Mailbox</th>
              <th className="px-4 py-2.5 font-medium">Domain</th>
              <th className="px-4 py-2.5 font-medium">Provider</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Health</th>
              <th className="px-4 py-2.5 font-medium">Warmup</th>
              <th className="px-4 py-2.5 font-medium">Capacity (12h)</th>
              <th className="px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mailbox + r.domain} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {r.mailbox}
                  <span className="text-muted-foreground">{r.domain}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.domain}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.provider}</td>
                <td className="px-4 py-3">
                  <Pill tone={r.statusTone}>{r.status}</Pill>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.health}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.warmup}</td>
                <td className="px-4 py-3">
                  <div className="w-40">
                    <Meter level={r.capacity} tone={r.capacityTone} />
                    <p className="mt-1 text-[11px] text-muted-foreground">{r.capacityLabel}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Send className="size-3.5" />
                    <Pause className="size-3.5" />
                    <MoreHorizontal className="size-3.5" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — Connection flow                                                 */
/* ------------------------------------------------------------------ */

const connectSteps = [
  { title: "Choose provider", text: "Pick the sending account type you want to connect." },
  { title: "Enter account details", text: "Provide the credentials the provider requires." },
  { title: "Verify connection", text: "MunchReach checks that the account can authenticate." },
  { title: "Check sending status", text: "Confirm the account is allowed to send." },
  { title: "Ready", text: "The mailbox appears in your workspace and can be used." },
];

export function ConnectFlowMock() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <AppWindow title="Connect a sending account" breadcrumb="Email accounts / Connect">
        <div className="space-y-4 p-5">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Provider</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {["Google Workspace", "Microsoft 365", "Custom SMTP", "Amazon SES"].map((p, i) => (
                <div
                  key={p}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm",
                    i === 0 ? "border-primary/40 bg-primary/5 font-medium" : "border-border/70",
                  )}
                >
                  <span>{p}</span>
                  {i === 0 ? <CheckCircle2 className="size-4 text-primary" /> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Account details</p>
            {["Email address", "Sender name", "Authentication"].map((f) => (
              <div key={f} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{f}</span>
                <KeyRound className="size-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <span className="font-medium">Verify connection</span>
            <Pill tone="ok">Connected</Pill>
          </div>
        </div>
      </AppWindow>

      <ol className="space-y-3">
        {connectSteps.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <p className="text-sm font-semibold">{s.title}</p>
            </div>
            <p className="mt-1.5 pl-10 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5 — Mailbox health                                                  */
/* ------------------------------------------------------------------ */

const healthStates = [
  { label: "Healthy", tone: "ok" as const, text: "No active safety condition and capacity is available." },
  { label: "Warming", tone: "primary" as const, text: "Warmup is running, so sending volume is still ramping." },
  { label: "Paused", tone: "muted" as const, text: "You paused the mailbox, so it is out of campaign sending." },
  { label: "Blocked", tone: "danger" as const, text: "A safety condition is active and sending is restricted." },
  { label: "Needs attention", tone: "warn" as const, text: "Something needs review, such as setup or a rising bounce rate." },
];

export function HealthMock() {
  return (
    <div className="space-y-6">
      <AppWindow title="Mailbox health — sam@munchreach.dev" breadcrumb="Email accounts / Health">
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Health" value="Healthy" tone="ok" />
          <Field label="Bounce rate" value="Within safe range" tone="ok" />
          <Field label="Sending status" value="Sending" tone="ok" />
          <Field label="Warmup status" value="Active" />
          <Field label="Safety status" value="No active block" tone="ok" />
          <Field label="Available capacity" value="Capacity remaining in window" />
          <Field label="Recent activity" value="Sends and replies recorded" />
          <Field label="Last check" value="Re-evaluated on each send" />
        </div>
      </AppWindow>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {healthStates.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/70 bg-card p-5">
            <Pill tone={s.tone}>{s.label}</Pill>
            <p className="mt-3 text-sm text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Warmup connection                                               */
/* ------------------------------------------------------------------ */

export function WarmupStatusMock() {
  return (
    <AppWindow title="Warmup — hello@munchreachmail.com" breadcrumb="Email accounts / Warmup">
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Warmup" value="Active" tone="ok" />
        <Field label="Stage" value="Conservative" />
        <Field label="Health" value="Good" tone="ok" />
        <Field label="Status" value="Sending" tone="ok" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Warmup state is shown on the same mailbox record you send from.
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Flame className="size-3.5" /> Manage Warmup
        </span>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 7 — Sending capacity                                                */
/* ------------------------------------------------------------------ */

export function CapacityMock() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <AppWindow title="Sending capacity" breadcrumb="Email accounts / Capacity">
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Gauge className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">example@yourdomain.com</p>
              <p className="text-xs text-muted-foreground">Current window · 12-hour rolling window</p>
            </div>
          </div>
          <Meter level={62} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sent this window" value="Counted per accepted send" />
            <Field label="Remaining" value="Your limit minus this window" />
            <Field label="Next available" value="As older sends age out" />
          </div>
        </div>
      </AppWindow>
      <div className="space-y-3">
        {[
          "Capacity is measured on a rolling 12-hour window, not a fixed midnight reset.",
          "Only accepted sends count against a mailbox's capacity.",
          "Mailbox capacity is separate from a campaign's own daily quota.",
          "When one mailbox reaches capacity, other available mailboxes keep sending.",
        ].map((t) => (
          <div key={t} className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8 — Multiple mailboxes grouped by domain                            */
/* ------------------------------------------------------------------ */

const domains = [
  {
    domain: "munchreach.dev",
    boxes: [
      { name: "sam@", state: "Active", tone: "ok" as const },
      { name: "grow@", state: "Warming", tone: "primary" as const },
      { name: "hello@", state: "Active", tone: "ok" as const },
    ],
  },
  {
    domain: "getmunchreach.io",
    boxes: [
      { name: "outreach@", state: "Active", tone: "ok" as const },
      { name: "sales@", state: "Paused", tone: "muted" as const },
      { name: "team@", state: "Warming", tone: "primary" as const },
    ],
  },
];

export function DomainGroupsMock() {
  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      {domains.map((d) => (
        <div key={d.domain} className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{d.domain}</p>
            <Pill tone="muted">{d.boxes.length} mailboxes</Pill>
          </div>
          <div className="mt-4 space-y-2">
            {d.boxes.map((b) => (
              <div
                key={b.name}
                className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5 text-sm"
              >
                <span className="truncate">
                  {b.name}
                  <span className="text-muted-foreground">{d.domain}</span>
                </span>
                <Pill tone={b.tone}>{b.state}</Pill>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9 — Safety                                                          */
/* ------------------------------------------------------------------ */

const safetyChips = [
  { icon: ShieldCheck, label: "Bounce protection" },
  { icon: AlertTriangle, label: "Complaint protection" },
  { icon: Activity, label: "Health checks" },
  { icon: Gauge, label: "Temporary capacity limits" },
  { icon: Pause, label: "Manual pause" },
  { icon: Ban, label: "Automatic safety pause" },
];

const safetyKinds = [
  {
    title: "Safety Block",
    tone: "danger" as const,
    text: "The mailbox is restricted because a safety condition is currently active. Resuming cannot bypass it while it is still active.",
  },
  {
    title: "Capacity Limit",
    tone: "warn" as const,
    text: "The mailbox temporarily cannot send because its available sending capacity for the current window has been reached.",
  },
  {
    title: "Manual Pause",
    tone: "muted" as const,
    text: "You intentionally paused the mailbox. It stays out of sending until you resume it.",
  },
];

export function SafetyMock() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2.5">
        {safetyChips.map((c) => (
          <span
            key={c.label}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-2 text-sm"
          >
            <c.icon className="size-3.5 text-primary" />
            {c.label}
          </span>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {safetyKinds.map((k) => (
          <div key={k.title} className="rounded-2xl border border-border/70 bg-card p-6">
            <Pill tone={k.tone}>{k.title}</Pill>
            <p className="mt-3 text-sm text-muted-foreground">{k.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10 — Recovery flow                                                  */
/* ------------------------------------------------------------------ */

const recovery = [
  "Problem detected",
  "Mailbox paused",
  "Safety checked",
  "Condition clears",
  "Mailbox becomes resumable",
  "Sending continues",
];

export function RecoveryFlow() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 rounded-2xl border border-border/70 bg-secondary/30 px-5 py-6">
        {recovery.map((r, i) => (
          <span key={r} className="flex items-center gap-2">
            <span className="rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-sm">{r}</span>
            {i < recovery.length - 1 ? <ArrowRight className="size-3.5 text-muted-foreground" /> : null}
          </span>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6">
          <h3 className="text-base font-semibold">Still blocked</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            While a safety condition is genuinely active, the mailbox stays restricted and Resume will not force it back
            into sending.
          </p>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-6">
          <h3 className="text-base font-semibold">Resumable again</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            When the condition no longer applies — capacity frees up in the window, or the underlying issue is
            resolved — the mailbox becomes resumable instead of staying stuck.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 11 — Domain readiness                                               */
/* ------------------------------------------------------------------ */

const readiness = [
  {
    domain: "munchreach.dev",
    dns: ["Ready", "Ready", "Ready", "Ready"],
    sending: "Ready",
    receiving: "Ready",
  },
  {
    domain: "munchreachmail.com",
    dns: ["Ready", "Ready", "Ready", "Pending"],
    sending: "Pending",
    receiving: "Ready",
  },
  {
    domain: "munchreachhq.com",
    dns: ["Ready", "Needs attention", "Ready", "Not configured"],
    sending: "Needs attention",
    receiving: "Not configured",
  },
];

function StatusText({ value }: { value: string }) {
  const tone =
    value === "Ready"
      ? "ok"
      : value === "Pending"
        ? "primary"
        : value === "Needs attention"
          ? "warn"
          : "muted";
  return <Pill tone={tone as "ok" | "primary" | "warn" | "muted"}>{value}</Pill>;
}

export function DomainReadinessMock() {
  return (
    <AppWindow title="Domain readiness" breadcrumb="Email accounts / Domains">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 text-[11px] tracking-wide text-muted-foreground uppercase">
              {["Domain", "DNS", "SPF", "DKIM", "DMARC", "Sending", "Receiving"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readiness.map((d) => (
              <tr key={d.domain} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{d.domain}</td>
                {d.dns.map((v, i) => (
                  <td key={i} className="px-4 py-3">
                    <StatusText value={v} />
                  </td>
                ))}
                <td className="px-4 py-3">
                  <StatusText value={d.sending} />
                </td>
                <td className="px-4 py-3">
                  <StatusText value={d.receiving} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 12 — Mailbox actions                                                */
/* ------------------------------------------------------------------ */

const actions = [
  { icon: Send, label: "Send Test", text: "Send a test message to confirm the account can actually deliver." },
  { icon: Pause, label: "Pause", text: "Take the mailbox out of sending without deleting it." },
  { icon: Play, label: "Resume", text: "Put the mailbox back into sending when nothing blocks it." },
  { icon: Settings, label: "Settings", text: "Update the account's sending configuration." },
  { icon: Flame, label: "Warmup", text: "Open the warmup controls for this mailbox." },
  { icon: Activity, label: "View Activity", text: "Review the recent sending activity recorded for the account." },
];

export function ActionsPanelMock() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
      <AppWindow title="sam@munchreach.dev" breadcrumb="Email accounts / Account detail">
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">sam@munchreach.dev</p>
              <p className="text-xs text-muted-foreground">Google Workspace · munchreach.dev</p>
            </div>
            <Pill tone="ok">Active</Pill>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map((a) => (
              <div
                key={a.label}
                className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-sm font-medium"
              >
                <a.icon className="size-3.5 text-primary" />
                {a.label}
              </div>
            ))}
          </div>
        </div>
      </AppWindow>
      <div className="space-y-2.5">
        {actions.map((a) => (
          <div key={a.label} className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <a.icon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{a.label}</p>
              <p className="text-sm text-muted-foreground">{a.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReadinessNote() {
  return (
    <div className="mt-6 flex gap-3 rounded-2xl border border-border/70 bg-card p-5">
      <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" />
      <p className="text-sm text-muted-foreground">
        Adding an email account and being ready to send are two different things. A mailbox can be connected while its
        domain records or sending status still need attention — the readiness view is where you confirm both.
      </p>
    </div>
  );
}
