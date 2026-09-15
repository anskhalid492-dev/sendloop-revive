import { formatCount, formatPct, rate } from "@/lib/analytics-model";
import { cn } from "@/lib/utils";

export type FunnelStepKey = "sent" | "delivered" | "opens" | "replies";

export type FunnelInput = {
  sent: number;
  delivered: number;
  opens: number;
  replies: number;
  /** Audience size at the top of the funnel, when known. */
  leads?: number | null;
  /** Replies classified as positive. */
  positiveReplies?: number | null;
  /** Meetings booked in the same range. */
  meetings?: number | null;
};

const STEP_STYLES = [
  "bg-primary/80",
  "bg-primary/70",
  "bg-sky-500/80",
  "bg-violet-500/80",
  "bg-emerald-500/80",
  "bg-emerald-600/80",
  "bg-amber-500/80",
] as const;

const DRILLDOWN_KEYS = new Set<FunnelStepKey>(["sent", "delivered", "opens", "replies"]);

/**
 * Leads → Sent → Delivered → Opened → Replied → Positive → Meeting, using the
 * same deduplicated engagement counts as the KPI cards. Each bar is sized
 * against the top of the funnel and annotated with its step-to-step conversion.
 */
export function ConversionFunnel({
  data,
  className,
  title = "Conversion funnel",
  onStepClick,
}: {
  data: FunnelInput;
  className?: string;
  title?: string;
  onStepClick?: ((step: FunnelStepKey) => void) | undefined;
}) {
  const steps: Array<{ key: string; label: string; value: number; prev: number | null }> = [];
  if (typeof data.leads === "number") {
    steps.push({ key: "leads", label: "Leads", value: data.leads, prev: null });
  }
  steps.push({
    key: "sent",
    label: "Sent",
    value: data.sent,
    prev: typeof data.leads === "number" ? data.leads : null,
  });
  steps.push({ key: "delivered", label: "Delivered", value: data.delivered, prev: data.sent });
  steps.push({ key: "opens", label: "Opened", value: data.opens, prev: data.delivered });
  steps.push({ key: "replies", label: "Replied", value: data.replies, prev: data.delivered });
  if (typeof data.positiveReplies === "number") {
    steps.push({
      key: "positive",
      label: "Positive",
      value: data.positiveReplies,
      prev: data.replies,
    });
  }
  if (typeof data.meetings === "number") {
    steps.push({
      key: "meeting",
      label: "Meeting booked",
      value: data.meetings,
      prev: typeof data.positiveReplies === "number" ? data.positiveReplies : data.replies,
    });
  }
  const top = Math.max(data.leads ?? data.sent, data.sent, 1);
  const empty = data.sent === 0 && data.delivered === 0;

  return (
    <section className={cn("surface-card p-5", className)}>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">
        Step-by-step conversion from real delivery, open and reply events.
        {onStepClick ? " Click a step to see the underlying events." : ""}
      </p>

      {empty ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No sends in this range yet — the funnel fills in as messages go out.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {steps.map((step, index) => {
            const drilldown =
              onStepClick && DRILLDOWN_KEYS.has(step.key as FunnelStepKey)
                ? () => onStepClick(step.key as FunnelStepKey)
                : undefined;
            return (
            <div
              key={step.label}
              role={drilldown ? "button" : undefined}
              tabIndex={drilldown ? 0 : undefined}
              onClick={drilldown}
              onKeyDown={
                drilldown
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") drilldown();
                    }
                  : undefined
              }
              className={cn(
                drilldown &&
                  "-mx-2 cursor-pointer rounded-lg px-2 py-1 transition-colors hover:bg-muted/60",
              )}
            >
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{step.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCount(step.value)}
                  <span className="ml-2 text-xs">
                    {step.prev === null
                      ? "100%"
                      : `${formatPct(rate(step.value, step.prev))} conversion`}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    STEP_STYLES[Math.min(index, STEP_STYLES.length - 1)],
                  )}
                  style={{ width: `${Math.min(100, (step.value / top) * 100)}%` }}
                />
              </div>
            </div>
            );
          })}
          <p className="pt-1 text-xs text-muted-foreground">
            Overall sent → replied: {formatPct(rate(data.replies, data.sent))}
          </p>
        </div>
      )}
    </section>
  );
}
