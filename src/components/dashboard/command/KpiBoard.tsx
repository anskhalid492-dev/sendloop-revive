import { motion } from "framer-motion";

import { Trend } from "@/components/dashboard/command/primitives";
import { delta, pct, type PeriodTotals } from "@/lib/dashboard-command-model";
import { cn } from "@/lib/utils";

type Card = {
  key: string;
  label: string;
  value: string;
  change: number | null;
  inverted?: boolean;
  hint?: string;
};

/**
 * Today's outbound overview. Exactly four KPIs — Emails Sent, Reply Rate,
 * Bounce Rate and Meetings Booked — scoped to the current sending day and
 * compared with the same window yesterday. Lifetime totals never appear.
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
      label: "Emails Sent",
      value: t.sent.toLocaleString(),
      change: delta(t.sent, y?.sent),
      emphasis: true,
      hint: "Today",
    },
    {
      key: "replyRate",
      label: "Reply Rate",
      value: `${pct(t.replies, t.sent).toFixed(1)}%`,
      change: y ? delta(pct(t.replies, t.sent), pct(y.replies, y.sent)) : null,
      hint: "Unique prospects",
    },
    {
      key: "bounceRate",
      label: "Bounce Rate",
      value: `${pct(t.bounced, t.sent).toFixed(1)}%`,
      change: y ? delta(pct(t.bounced, t.sent), pct(y.bounced, y.sent)) : null,
      inverted: true,
      hint: "Of sent",
    },
    {
      key: "meetings",
      label: "Meetings Booked",
      value: t.meetings.toLocaleString(),
      change: delta(t.meetings, y?.meetings),
      emphasis: true,
      hint: "Today",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="h-[112px] animate-pulse bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm md:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
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
              "emphasis" in card && card.emphasis ? "text-[28px] leading-none" : "text-2xl leading-none",
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