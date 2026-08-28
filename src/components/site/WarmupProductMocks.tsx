import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  KeyRound,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

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

/* ------------------------------------------------------------------ */
/* 3 — Warmup dashboard                                                */
/* ------------------------------------------------------------------ */

type WarmRow = {
  mailbox: string;
  health: string;
  healthTone: "ok" | "warn" | "danger" | "muted" | "primary";
  status: string;
  statusTone: "ok" | "warn" | "danger" | "muted" | "primary";
  volume: string;
  limit: string;
  stage: string;
  safety: string;
  safetyTone: "ok" | "warn" | "danger" | "muted" | "primary";
  fill: number;
  fillTone: "ok" | "warn" | "danger" | "muted";
  action: string;
};

const warmRows: WarmRow[] = [
  {
    mailbox: "sam@munchreach.dev",
    health: "Healthy",
    healthTone: "ok",
    status: "Warming",
    statusTone: "primary",
    volume: "38 sent",
    limit: "60 / 12h",
    stage: "Stage 4 of 6",
    safety: "No issues",
    safetyTone: "ok",
    fill: 63,
    fillTone: "ok",
    action: "Pause",
  },
  {
    mailbox: "priya@getmunchreach.io",
    health: "Good",
    healthTone: "ok",
    status: "Warming",
    statusTone: "primary",
    volume: "12 sent",
    limit: "20 / 12h",
    stage: "Stage 1 of 6",
    safety: "No issues",
    safetyTone: "ok",
    fill: 60,
    fillTone: "ok",
    action: "Pause",
  },
  {
    mailbox: "team@munchreachhq.com",
    health: "Healthy",
    healthTone: "ok",
    status: "Capacity reached",
    statusTone: "warn",
    volume: "90 sent",
    limit: "90 / 12h",
    stage: "Stage 6 of 6",
    safety: "Temporary capacity pause",
    safetyTone: "warn",
    fill: 100,
    fillTone: "warn",
    action: "Waits for window",
  },
  {
    mailbox: "sales@munchreachhq.com",
    health: "Needs attention",
    healthTone: "danger",
    status: "Blocked",
    statusTone: "danger",
    volume: "0 sent",
    limit: "Held",
    stage: "Stage 3 of 6",
    safety: "Bounce-rate protection",
    safetyTone: "danger",
    fill: 0,
    fillTone: "danger",
    action: "Resume blocked",
  },
  {
    mailbox: "hello@munchreachmail.com",
    health: "Good",
    healthTone: "primary",
    status: "Paused by you",
    statusTone: "muted",
    volume: "0 sent",
    limit: "40 / 12h",
    stage: "Stage 2 of 6",
    safety: "Manual pause",
    safetyTone: "muted",
    fill: 0,
    fillTone: "muted",
    action: "Resume",
  },
];

export function WarmupDashboardMock() {
  return (
    <AppWindow title="Warmup" breadcrumb="Acme Growth / Warmup">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {["All", "Warming", "Capacity reached", "Blocked", "Paused"].map((f, i) => (
            <span
              key={f}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                i === 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-card text-muted-foreground",
              )}
            >
              {f}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Flame className="size-3.5" /> Start warmup
        </span>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Mailbox</th>
              <th className="px-4 py-2.5 font-medium">Health</th>
              <th className="px-4 py-2.5 font-medium">Warmup status</th>
              <th className="px-4 py-2.5 font-medium">Volume</th>
              <th className="px-4 py-2.5 font-medium">Daily limit</th>
              <th className="px-4 py-2.5 font-medium">Ramp stage</th>
              <th className="px-4 py-2.5 font-medium">Safety</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {warmRows.map((r) => (
              <tr key={r.mailbox} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{r.mailbox}</td>
                <td className="px-4 py-3">
                  <Pill tone={r.healthTone}>{r.health}</Pill>
                </td>
                <td className="px-4 py-3">
                  <Pill tone={r.statusTone}>{r.status}</Pill>
                </td>
                <td className="px-4 py-3">
                  <div className="w-28">
                    <Meter level={r.fill} tone={r.fillTone} />
                    <p className="mt-1 text-[11px] text-muted-foreground">{r.volume}</p>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.limit}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.stage}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.safety}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {r.action === "Resume" ? <Play className="size-3" /> : <Pause className="size-3" />}
                    {r.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

export function WarmupScreenNotes({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="space-y-4">
      {items.map((i) => (
        <div key={i.title} className="rounded-xl border border-border/70 bg-card/60 p-4">
          <h4 className="text-sm font-semibold">{i.title}</h4>
          <p className="mt-1.5 text-sm text-muted-foreground">{i.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Pause vs block                                                  */
/* ------------------------------------------------------------------ */

export function PauseVsBlock() {
  const cards = [
    {
      icon: Clock,
      title: "Temporary capacity pause",
      tone: "warn" as const,
      points: [
        "The mailbox hit its limit for the current 12-hour window.",
        "Nothing is wrong with the account or its reputation.",
        "Other available mailboxes keep sending in the meantime.",
        "Capacity returns on its own as the window rolls forward.",
      ],
    },
    {
      icon: Ban,
      title: "Safety block",
      tone: "danger" as const,
      points: [
        "A safety condition is active — bounce rate, complaints or authentication.",
        "Sending is held for that mailbox while the condition applies.",
        "Resume cannot bypass an active block, and the reason is shown.",
        "Once the condition no longer applies, the mailbox becomes resumable.",
      ],
    },
  ];
  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      {cards.map((c) => (
        <div
          key={c.title}
          className={cn(
            "rounded-2xl border p-6",
            c.tone === "warn"
              ? "border-amber-500/30 bg-amber-500/[0.06]"
              : "border-destructive/25 bg-destructive/[0.05]",
          )}
        >
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-xl",
              c.tone === "warn"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <c.icon className="size-5" />
          </span>
          <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
          <ul className="mt-3 space-y-2">
            {c.points.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Safety signals panel                                            */
/* ------------------------------------------------------------------ */

export function SafetySignalsMock() {
  const rows: { icon: typeof Gauge; label: string; value: string; tone: "ok" | "warn" | "danger" | "muted" }[] = [
    { icon: Activity, label: "Bounce-rate protection", value: "Monitoring — within threshold", tone: "ok" },
    { icon: AlertTriangle, label: "Complaint protection", value: "Monitoring — no complaints logged", tone: "ok" },
    { icon: Gauge, label: "Health signal", value: "Healthy", tone: "ok" },
    { icon: KeyRound, label: "Authentication check", value: "Passing", tone: "ok" },
    { icon: Clock, label: "12-hour capacity", value: "38 of 60 used in this window", tone: "warn" },
    { icon: ShieldCheck, label: "Resume check", value: "Re-verified before sending restarts", tone: "muted" },
  ];
  return (
    <AppWindow title="Mailbox safety" breadcrumb="Warmup / sam@munchreach.dev">
      <div className="space-y-2 p-4">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
          >
            <r.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
            <Pill tone={r.tone}>{r.value}</Pill>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 7 — Mailbox management                                              */
/* ------------------------------------------------------------------ */

export function MailboxManagementMock() {
  const cols = ["Mailbox", "Health", "Daily capacity", "Warmup stage", "Safety status", "Action"];
  const rows: [string, string, string, string, string, string][] = [
    ["sam@munchreach.dev", "Healthy", "38 / 60", "Stage 4 of 6", "No issues", "Pause"],
    ["priya@getmunchreach.io", "Good", "12 / 20", "Stage 1 of 6", "No issues", "Pause"],
    ["team@munchreachhq.com", "Healthy", "90 / 90", "Stage 6 of 6", "Capacity reached", "Waits"],
    ["sales@munchreachhq.com", "Needs attention", "Held", "Stage 3 of 6", "Bounce protection", "Review"],
  ];
  return (
    <AppWindow title="Sending accounts" breadcrumb="Warmup / Mailboxes">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/70 text-[11px] tracking-wide text-muted-foreground uppercase">
              {cols.map((c) => (
                <th key={c} className="px-4 py-2.5 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-border/50 last:border-0">
                {r.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-4 py-3 whitespace-nowrap",
                      i === 0 ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — Ramp steps                                                      */
/* ------------------------------------------------------------------ */

export function RampSteps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-2xl border border-border/70 bg-card p-6">
          <span className="text-sm font-semibold text-primary">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function DetailPanel({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.title} className="rounded-2xl border border-border/70 bg-card p-6">
          <h3 className="text-sm font-semibold">{i.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{i.text}</p>
        </div>
      ))}
    </div>
  );
}

export function RampNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 rounded-xl border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
