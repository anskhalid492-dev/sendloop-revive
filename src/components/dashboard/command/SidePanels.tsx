import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Info,
  Lightbulb,
  MailWarning,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, StatePill } from "@/components/dashboard/command/primitives";
import type { ActionItem, Insight } from "@/lib/dashboard-command-model";
import type { ActivityRow, RecentReplyRow } from "@/lib/dashboard-command.server";
import { cn } from "@/lib/utils";

function relative(at: string) {
  const diff = Date.now() - new Date(at).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Everything that needs a human decision right now. */
export function ActionCenter({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing needs your attention"
        body="Mailboxes, domains and campaigns are all running within their limits."
      />
    );
  }

  const icon = {
    critical: AlertTriangle,
    warning: MailWarning,
    info: Info,
  } as const;
  const tone = { critical: "bad", warning: "warn", info: "info" } as const;

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const Icon = icon[item.severity];
        return (
          <li key={item.id} className="flex items-start gap-3 px-5 py-4">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                item.severity === "critical"
                  ? "bg-destructive/12 text-destructive"
                  : item.severity === "warning"
                    ? "bg-amber-500/14 text-amber-600 dark:text-amber-400"
                    : "bg-primary/12 text-primary",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <StatePill tone={tone[item.severity]}>{item.severity}</StatePill>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-xs">
              <Link to={item.to}>{item.actionLabel}</Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Automatic observations derived from the workspace's own numbers. */
export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="Not enough data for insights"
        body="Insights appear once your campaigns have enough sends to compare meaningfully."
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {insights.map((insight) => (
        <li key={insight.id} className="flex items-start gap-3 px-5 py-3.5">
          <Sparkles
            className={cn(
              "mt-0.5 size-4 shrink-0",
              insight.tone === "positive"
                ? "text-emerald-600 dark:text-emerald-400"
                : insight.tone === "negative"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          />
          <p className="text-sm leading-relaxed text-foreground/90">{insight.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Latest inbound replies with sentiment, linked into the unified inbox. */
export function RepliesPanel({ replies }: { replies: RecentReplyRow[] }) {
  if (replies.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No replies yet"
        body="Replies from your prospects land here and in the unified inbox."
        ctaLabel="Open inbox"
        to="/inbox"
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {replies.map((reply) => (
        <li key={reply.id} className="px-5 py-4 transition-colors hover:bg-muted/30">
          <Link to="/inbox" className="block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {reply.prospect}
                {reply.company ? (
                  <span className="font-normal text-muted-foreground"> · {reply.company}</span>
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                <StatePill
                  tone={
                    reply.sentiment === "positive"
                      ? "good"
                      : reply.sentiment === "negative"
                        ? "bad"
                        : "neutral"
                  }
                >
                  {reply.sentiment}
                </StatePill>
                <span className="text-[11px] text-muted-foreground">{relative(reply.at)}</span>
              </div>
            </div>
            {reply.subject ? (
              <p className="mt-1 truncate text-xs font-medium text-foreground/80">
                {reply.subject}
              </p>
            ) : null}
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{reply.preview}</p>
            {reply.campaign ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">via {reply.campaign}</p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Chronological workspace activity feed. */
export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No recent activity"
        body="Campaign launches, replies and mailbox changes show up here as they happen."
      />
    );
  }
  return (
    <ol className="relative space-y-0 px-5 py-2">
      {rows.map((row, index) => (
        <li key={row.id} className="relative flex gap-3 py-3">
          <div className="flex flex-col items-center">
            <span className="mt-1.5 size-2 rounded-full bg-primary" />
            {index < rows.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{row.title}</p>
              <span className="text-[11px] text-muted-foreground">{relative(row.at)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
