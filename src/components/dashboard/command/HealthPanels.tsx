import { Link } from "@tanstack/react-router";
import { Server, Trophy } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { EmptyState, StatePill } from "@/components/dashboard/command/primitives";
import {
  pct,
  type CampaignRow,
  type FunnelStep,
  type MailboxRow,
  type SendingHealth,
} from "@/lib/dashboard-command-model";
import { cn } from "@/lib/utils";

const MAILBOX_TONE = {
  active: "good",
  warming: "info",
  paused: "warn",
  blocked: "bad",
  capacity: "neutral",
} as const;

/** Aggregate sending health: mailbox mix, domain readiness and live capacity. */
export function SendingHealthPanel({ health }: { health: SendingHealth }) {
  const stats = [
    { label: "Healthy", value: health.healthy, tone: "good" as const },
    { label: "Warming", value: health.warming, tone: "info" as const },
    { label: "Paused", value: health.paused, tone: "warn" as const },
    { label: "Blocked", value: health.blocked, tone: "bad" as const },
  ];
  const used = health.capacity > 0 ? pct(health.usedInWindow, health.capacity) : 0;

  return (
    <div className="grid gap-px bg-border sm:grid-cols-3">
      <div className="bg-card px-5 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Health score
        </p>
        <p className="mt-2 text-4xl font-semibold tabular-nums leading-none">{health.score}</p>
        <Progress value={health.score} className="mt-4 h-1.5" />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {health.total} mailbox{health.total === 1 ? "" : "es"} connected
        </p>
      </div>

      <div className="bg-card px-5 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Mailbox status
        </p>
        <ul className="mt-3 space-y-2">
          {stats.map((s) => (
            <li key={s.label} className="flex items-center justify-between text-sm">
              <StatePill tone={s.tone}>{s.label}</StatePill>
              <span className="tabular-nums font-medium">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-card px-5 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Rolling 12h capacity
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums leading-none">
          {health.available.toLocaleString()}
          <span className="ml-1 text-sm font-normal text-muted-foreground">left</span>
        </p>
        <Progress value={used} className="mt-4 h-1.5" />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {health.usedInWindow.toLocaleString()} of {health.capacity.toLocaleString()} used ·{" "}
          {health.domainsReady}/{health.domainsTotal} mailboxes verified
        </p>
      </div>
    </div>
  );
}

/** Per-mailbox performance and remaining capacity in the rolling window. */
export function MailboxTable({ rows }: { rows: MailboxRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Server}
        title="No mailboxes connected"
        body="Connect a sending mailbox to start warming up and sending campaigns."
        ctaLabel="Add mailbox"
        to="/sending"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            {["Mailbox", "Status", "Sent", "Confirmed delivered", "Bounces", "Replies", "12h capacity"].map(
              (h, i) => (
                <th
                  key={h}
                  className={cn(
                    "px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground",
                    i >= 2 && "text-right",
                  )}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link to="/sending" className="font-medium hover:underline">
                  {row.label}
                </Link>
                <p className="text-[11px] text-muted-foreground">{row.email}</p>
              </td>
              <td className="px-4 py-3">
                <StatePill tone={MAILBOX_TONE[row.state]}>{row.stateLabel}</StatePill>
                {row.reason ? (
                  <p className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">
                    {row.reason}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{row.sent.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.delivered.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.bounced.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.replies.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">
                <span className="tabular-nums font-medium">{row.available}</span>
                <span className="text-muted-foreground"> / {row.dailyLimit}</span>
                <Progress
                  value={row.dailyLimit > 0 ? pct(row.usedInWindow, row.dailyLimit) : 0}
                  className="mt-1.5 h-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Best campaigns by reply performance. */
export function TopCampaigns({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No ranked campaigns yet"
        body="Campaigns are ranked by reply rate once they have enough sends."
      />
    );
  }
  const max = Math.max(...rows.map((r) => pct(r.replies, r.sentLifetime)), 1);
  return (
    <ul className="divide-y divide-border">
      {rows.map((row, index) => {
        const rate = pct(row.replies, row.sentLifetime);
        return (
          <li key={row.id} className="px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums">
                  {index + 1}
                </span>
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: row.id }}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {row.name}
                </Link>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {rate.toFixed(1)}%
              </span>
            </div>
            <Progress value={(rate / max) * 100} className="mt-2 h-1" />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {row.replies.toLocaleString()} replies · {row.sentLifetime.toLocaleString()} sent ·{" "}
              {row.meetings.toLocaleString()} meetings
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Lead → meeting conversion funnel for the selected window. */
export function FunnelPanel({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.value ?? 0;
  if (top === 0) {
    return (
      <EmptyState
        title="Funnel is empty"
        body="Import leads and launch a campaign to see how they convert into meetings."
        ctaLabel="Import leads"
        to="/leads"
      />
    );
  }
  return (
    <ul className="space-y-3 px-5 py-5">
      {steps.map((step, index) => {
        const share = pct(step.value, top);
        const prev = steps[index - 1];
        return (
          <li key={step.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="tabular-nums">
                {step.value.toLocaleString()}
                {prev ? (
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {pct(step.value, prev.value).toFixed(1)}% of {prev.label.toLowerCase()}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(share, step.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
