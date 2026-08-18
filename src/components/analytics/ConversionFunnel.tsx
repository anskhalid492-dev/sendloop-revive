import { formatCount, formatPct, rate } from "@/lib/analytics-model";
import { cn } from "@/lib/utils";

export type FunnelInput = {
  sent: number;
  delivered: number;
  opens: number;
  replies: number;
};

const STEP_STYLES = [
  "bg-primary/80",
  "bg-sky-500/80",
  "bg-violet-500/80",
  "bg-emerald-500/80",
] as const;

/**
 * Sent → Delivered → Opened → Replied, using the same deduplicated engagement
 * counts as the KPI cards. Each bar is sized against the top of the funnel and
 * annotated with its step-to-step conversion.
 */
export function ConversionFunnel({
  data,
  className,
  title = "Conversion funnel",
}: {
  data: FunnelInput;
  className?: string;
  title?: string;
}) {
  const steps = [
    { label: "Sent", value: data.sent, prev: null as number | null },
    { label: "Delivered", value: data.delivered, prev: data.sent },
    { label: "Opened", value: data.opens, prev: data.delivered },
    { label: "Replied", value: data.replies, prev: data.opens },
  ];
  const top = Math.max(data.sent, 1);
  const empty = data.sent === 0 && data.delivered === 0;

  return (
    <section className={cn("surface-card p-5", className)}>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">
        Step-by-step conversion from real delivery, open and reply events.
      </p>

      {empty ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No sends in this range yet — the funnel fills in as messages go out.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <div key={step.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{step.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCount(step.value)}
                  <span className="ml-2 text-xs">
                    {step.prev === null
                      ? "100%"
                      : `${formatPct(rate(step.value, step.prev))} of ${steps[index - 1]!.label.toLowerCase()}`}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", STEP_STYLES[index])}
                  style={{ width: `${Math.min(100, (step.value / top) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Overall sent → replied: {formatPct(rate(data.replies, data.sent))}
          </p>
        </div>
      )}
    </section>
  );
}
