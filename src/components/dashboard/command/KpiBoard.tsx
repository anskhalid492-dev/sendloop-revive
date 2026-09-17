import { motion } from "framer-motion";
import {
  CalendarCheck,
  Info,
  Mail,
  MailX,
  MessageSquareReply,
  type LucideIcon,
} from "lucide-react";

import { Trend } from "@/components/dashboard/command/primitives";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { delta, pct, type PeriodTotals } from "@/lib/dashboard-command-model";
import { cn } from "@/lib/utils";

type Card = {
  key: string;
  label: string;
  value: string;
  change: number | null;
  inverted?: boolean;
  emphasis?: boolean;
  hint?: string;
  description: string;
  icon: LucideIcon;
  iconTone: string;
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
      description: "Total emails successfully sent from your connected sending accounts today.",
      icon: Mail,
      iconTone: "bg-tint-sky text-tint-sky-foreground",
    },
    {
      key: "replyRate",
      label: "Reply Rate",
      value: `${pct(t.replies, t.sent).toFixed(1)}%`,
      change: y ? delta(pct(t.replies, t.sent), pct(y.replies, y.sent)) : null,
      hint: "Unique prospects",
      description: "Percentage of unique prospects who replied to emails sent today.",
      icon: MessageSquareReply,
      iconTone: "bg-tint-violet text-tint-violet-foreground",
    },
    {
      key: "bounceRate",
      label: "Bounce Rate",
      value: `${pct(t.bounced, t.sent).toFixed(1)}%`,
      change: y ? delta(pct(t.bounced, t.sent), pct(y.bounced, y.sent)) : null,
      inverted: true,
      hint: "Of sent",
      description: "Percentage of sent emails that could not be delivered because they bounced.",
      icon: MailX,
      iconTone: "bg-tint-rose text-tint-rose-foreground",
    },
    {
      key: "meetings",
      label: "Meetings Booked",
      value: t.meetings.toLocaleString(),
      change: delta(t.meetings, y?.meetings),
      emphasis: true,
      hint: "Today",
      description: "Number of meetings attributed to your outreach today.",
      icon: CalendarCheck,
      iconTone: "bg-tint-mint text-tint-mint-foreground",
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
    <TooltipProvider delayDuration={180}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm md:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className="relative flex min-h-[112px] flex-col justify-between bg-card px-5 py-4 transition-colors after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-primary/30 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <span className="truncate">{card.label}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`About ${card.label}`}
                        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Info className="size-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-64 normal-case leading-relaxed tracking-normal">
                      {card.description}
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", card.iconTone)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div
                className={cn(
                  "mt-2 font-semibold tabular-nums tracking-tight",
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
          );
        })}
      </div>
    </TooltipProvider>
  );
}