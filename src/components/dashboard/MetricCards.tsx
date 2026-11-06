import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  MailCheck,
  MessageSquare,
  Minus,
  Rocket,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Metric = {
  label: string;
  value: number;
  previous: number | null;
  icon: LucideIcon;
  hint: string;
};

/** Counts up to `value` with an eased ramp, respecting reduced-motion. */
function useCountUp(value: number, duration = 900) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return display;
}

function Trend({ value, previous }: { value: number; previous: number | null }) {
  if (previous === null) return null;
  if (previous === 0 && value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> No change
      </span>
    );
  }
  const delta = previous === 0 ? 100 : Math.round(((value - previous) / previous) * 100);
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta)}% vs previous period
    </span>
  );
}

function MetricCard({ metric, index }: { metric: Metric; index: number }) {
  const display = useCountUp(metric.value);
  const Icon = metric.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -3 }}
      className="surface-card p-5"
    >
      <div className="flex items-start justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </span>
        <Trend value={metric.value} previous={metric.previous} />
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums">{display.toLocaleString()}</div>
      <div className="text-sm text-muted-foreground">{metric.label}</div>
      <div className="mt-1 text-xs text-muted-foreground/80">{metric.hint}</div>
    </motion.div>
  );
}

export function MetricCards({
  loading,
  current,
  previous,
  replyRate,
}: {
  loading: boolean;
  current: {
    sent: number;
    replies: number;
    positive: number;
    meetings: number;
    activeCampaigns: number;
  } | null;
  previous: { sent: number; replies: number; positive: number; meetings: number } | null;
  replyRate: number;
}) {
  if (loading || !current) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="surface-card space-y-3 p-5">
            <div className="size-9 animate-pulse rounded-lg bg-muted" />
            <div className="h-7 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  const metrics: Metric[] = [
    {
      label: "Emails sent",
      value: current.sent,
      previous: previous?.sent ?? null,
      icon: Send,
      hint: "Accepted by your connected mailboxes",
    },
    {
      label: "Replies",
      value: current.replies,
      previous: previous?.replies ?? null,
      icon: MessageSquare,
      hint: `${replyRate}% reply rate`,
    },
    {
      label: "Positive replies",
      value: current.positive,
      previous: previous?.positive ?? null,
      icon: MailCheck,
      hint: "Classified as interested",
    },
    {
      label: "Meetings",
      value: current.meetings,
      previous: previous?.meetings ?? null,
      icon: CalendarCheck,
      hint: "Prospects moved to opportunity",
    },
    {
      label: "Active campaigns",
      value: current.activeCampaigns,
      previous: null,
      icon: Rocket,
      hint: "Currently sending",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric, index) => (
        <MetricCard key={metric.label} metric={metric} index={index} />
      ))}
    </div>
  );
}
