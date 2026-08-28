import { motion } from "framer-motion";

import { Trend } from "@/components/dashboard/command/primitives";
import { delta, pct, type PeriodTotals } from "@/lib/dashboard-command-model";
import { cn } from "@/lib/utils";

type Card = {
  key: string;
  label: string;
  value: string;
  raw: number;
  change: number | null;
  inverted?: boolean;
  emphasis?: boolean;
  hint?: string;
};

/**
 * Today's outbound overview. Every number is scoped to the current sending day
 * and compared with the same window yesterday — lifetime totals never appear.
 */
export function KpiBoard({
  today,
  yesterday,
  loading,
}: {
  today: PeriodTotals | null;
  yesterday: PeriodTotals | null;
  loading: boolean;
}) {
  const t = today ?? { sent: 0, delivered: 0, replies: 0, positive: 0, meetings: 0, bounced: 0, uniqueRecipients: 0 };
  const y = yesterday ?? null;

  const cards: Card[] = [
    {
      key: "sent",
      label: "Emails sent",
      value: t.sent.toLocaleString(),
      raw: t.sent,
      change: delta(t.sent, y?.sent),
      emphasis: true,
    },
    {
      key: "delivered",
      label: "Delivered",
      value: t.delivered.toLocaleString(),
      raw: t.delivered,
      change: delta(t.delivered, y?.delivered),
    },
    {
      key: "deliveryRate",
      label: "Delivery rate",
      value: `${pct(t.delivered, t.sent).toFixed(1)}%`,
      raw: pct(t.delivered, t.sent),
      change: y ? delta(pct(t.delivered, t.sent), pct(y.delivered, y.sent)) : null,
    },
    {
      key: "replies",
      label: "Replies",
      value: t.replies.toLocaleString(),
      raw: t.replies,
      change: delta(t.replies, y?.replies),
      emphasis: true,
      hint: "Unique prospects",
    },
    {
      key: "replyRate",
      label: "Reply rate",
      value: `${pct(t.replies, t.sent).toFixed(1)}%`,
      raw: pct(t.replies, t.sent),
      change: y ? delta(pct(t.replies, t.sent), pct(y.replies, y.sent)) : null,
    },
    {
      key: "positive",
      label: "Positive replies",
      value: t.positive.toLocaleString(),
      raw: t.positive,
      change: delta(t.positive, y?.positive),
    },
    {
      key: "meetings",
      label: "Meetings booked",
      value: t.meetings.toLocaleString(),
      raw: t.meetings,
      change: delta(t.meetings, y?.meetings),
      emphasis: true,
    },
    {
      key: "bounced",
      label: "Bounces",
      value: t.bounced.toLocaleString(),
      raw: t.bounced,
      change: delta(t.bounced, y?.bounced),
      inverted: true,
    },
    {
      key: "bounceRate",
      label: "Bounce rate",
      value: `${pct(t.bounced, t.sent).toFixed(1)}%`,
      raw: pct(t.bounced, t.sent),
      change: y ? delta(pct(t.bounced, t.sent), pct(y.bounced, y.sent)) : null,
      inverted: true,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.key} className="h-[112px] animate-pulse bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm md:grid-cols-3 xl:grid-cols-5">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.025, duration: 0.25 }}
          className="flex min-h-[112px] flex-col justify-between bg-card px-5 py-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {card.label}
            </span>
          </div>
          <div
            className={cn(
              "mt-3 font-semibold tabular-nums tracking-tight",
              card.emphasis ? "text-[28px] leading-none" : "text-2xl leading-none",
            )}
          >
            {card.value}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Trend value={card.change} inverted={card.inverted} suffix="vs yesterday" />
            {card.hint ? (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {card.hint}
              </span>
            ) : null}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
