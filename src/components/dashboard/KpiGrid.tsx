import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type KpiTotals = {
  sent: number;
  delivered: number;
  replies: number;
  positive: number;
  meetings: number;
  bounced: number;
  unsubscribed: number;
};

type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  suffix?: string;
  tone?: "default" | "warn";
  decimals?: number;
};

function rate(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function Delta({
  value,
  previous,
  inverted,
}: {
  value: number;
  previous: number | null;
  inverted?: boolean;
}) {
  if (previous === null) return null;
  if (previous === 0 && value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="size-3" /> no change
      </span>
    );
  }
  const delta =
    previous === 0 ? 100 : Math.round(((value - previous) / Math.abs(previous)) * 100);
  const up = delta >= 0;
  const good = inverted ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
        good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      <Icon className="size-3" />
      {Math.abs(delta)}%
    </span>
  );
}

export function KpiGrid({
  current,
  previous,
  loading,
}: {
  current: KpiTotals | null;
  previous: KpiTotals | null;
  loading: boolean;
}) {
  const c = current;
  const p = previous;

  const kpis: Kpi[] = [
    {
      key: "sent",
      label: "Emails sent",
      value: c?.sent ?? 0,
      previous: p?.sent ?? null,
    },
    {
      key: "delivered",
      label: "Confirmed delivered",
      value: c?.delivered ?? 0,
      previous: p?.delivered ?? null,
    },
    {
      key: "deliveryRate",
      label: "Confirmed delivery rate",
      value: rate(c?.delivered ?? 0, c?.sent ?? 0),
      previous: p ? rate(p.delivered, p.sent) : null,
      suffix: "%",
      decimals: 1,
    },
    {
      key: "replyRate",
      label: "Reply rate",
      value: rate(c?.replies ?? 0, c?.sent ?? 0),
      previous: p ? rate(p.replies, p.sent) : null,
      suffix: "%",
      decimals: 1,
    },
    {
      key: "positive",
      label: "Positive replies",
      value: c?.positive ?? 0,
      previous: p?.positive ?? null,
    },
    {
      key: "meetings",
      label: "Meetings booked",
      value: c?.meetings ?? 0,
      previous: p?.meetings ?? null,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.key} className="min-h-[104px] animate-pulse bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((k, i) => (
        <motion.div
          key={k.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.25 }}
          className="bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {k.label}
            </span>
            <Delta value={k.value} previous={k.previous} inverted={k.tone === "warn"} />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {k.decimals ? k.value.toFixed(1) : k.value.toLocaleString()}
            {k.suffix ? <span className="text-base font-medium">{k.suffix}</span> : null}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
