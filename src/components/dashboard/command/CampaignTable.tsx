import { Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

import { EmptyState, SkeletonRows, StatePill } from "@/components/dashboard/command/primitives";
import { pct, type CampaignRow } from "@/lib/dashboard-command-model";
import type { CampaignRunState } from "@/lib/campaign-run-state";

/** Visual tone per live run state (green running, amber limit, red blocking). */
export const CAMPAIGN_STATE_TONE: Record<
  CampaignRunState,
  "neutral" | "good" | "warn" | "bad" | "info"
> = {
  draft: "neutral",
  scheduled: "info",
  running: "good",
  daily_quota_reached: "warn",
  lifetime_limit_reached: "warn",
  waiting_for_next_run: "info",
  completed: "neutral",
  paused: "neutral",
  blocked: "bad",
  archived: "neutral",
};

const TONE = CAMPAIGN_STATE_TONE;


function nextRun(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? `Today ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

const HEADERS = [
  "Campaign",
  "Status",
  "Leads",
  "Sent",
  "Delivered",
  "Replies",
  "Positive",
  "Meetings",
  "Bounce",
  "Next run",
];

/**
 * Campaign performance. Status comes from the run-state machine, so a campaign
 * that only used up today's quota never reads as "Completed".
 */
export function CampaignTable({
  rows,
  loading,
}: {
  rows: CampaignRow[];
  loading: boolean;
}) {
  if (loading) return <SkeletonRows rows={5} height={52} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No campaigns yet"
        body="Create your first campaign and start generating conversations."
        ctaLabel="Create campaign"
        to="/campaigns"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            {HEADERS.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground ${
                  i >= 2 && i <= 8 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: row.id }}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.dailyQuota > 0
                    ? `${row.sentToday.toLocaleString()} / ${row.dailyQuota.toLocaleString()} sent today`
                    : `${row.sentToday.toLocaleString()} sent today`}
                </p>
              </td>
              <td className="px-4 py-3">
                <StatePill tone={TONE[row.runState]}>
                  {row.runState === "running" ? (
                    <span className="relative mr-1.5 flex size-1.5" aria-hidden>
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                  ) : null}
                  {row.runLabel}
                </StatePill>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{row.leads.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.sentLifetime.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{row.delivered.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.replies.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.positive.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.meetings.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {pct(row.bounced, row.sentInRange ?? row.sentLifetime).toFixed(1)}%
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                {nextRun(row.nextRunAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
