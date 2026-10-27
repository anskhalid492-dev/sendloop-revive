import {
  DELIVERABILITY_PERIODS,
  PERIOD_LABEL,
  formatRateSample,
  formatRateValue,
  type DeliverabilityMetrics,
  type DeliverabilityPeriod,
  type Rate,
} from "@/lib/warmup-deliverability";
import { cn } from "@/lib/utils";

export function PeriodPicker({
  value,
  onChange,
}: {
  value: DeliverabilityPeriod;
  onChange: (p: DeliverabilityPeriod) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/70 p-0.5" role="group" aria-label="Measurement period">
      {DELIVERABILITY_PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium",
            value === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

function RateTile({ label, rate, unit }: { label: string; rate: Rate; unit: string }) {
  return (
    <div className="rounded-xl border border-border/50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold", rate.value === null ? "text-sm text-muted-foreground" : "text-xl")}>
        {formatRateValue(rate)}
      </p>
      <p className="text-xs text-muted-foreground">{formatRateSample(rate, unit)}</p>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

export function DeliverabilityOverview({
  metrics,
  loading,
  period,
  onPeriod,
}: {
  metrics: DeliverabilityMetrics | undefined;
  loading: boolean;
  period: DeliverabilityPeriod;
  onPeriod: (p: DeliverabilityPeriod) => void;
}) {
  return (
    <section className="surface-card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Warmup deliverability (observed)</h2>
          <p className="text-xs text-muted-foreground">
            Inbox and spam come only from warmup emails we found in the receiving mailbox's folders. Emails we could
            not observe are Unverified — never counted as inbox. Health score is separate.
          </p>
        </div>
        <PeriodPicker value={period} onChange={onPeriod} />
      </div>
      {loading || !metrics ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <RateTile label="Inbox rate" rate={metrics.inboxRate} unit="measured" />
            <RateTile label="Spam rate" rate={metrics.spamRate} unit="measured" />
            <RateTile label="Bounce rate" rate={metrics.bounceRate} unit="sent" />
            <RateTile label="Reply rate" rate={metrics.replyRate} unit="delivered" />
            <RateTile label="Unverified" rate={metrics.unverifiedRate} unit="sent" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <CountTile label="Warmup sent" value={metrics.sent} />
            <CountTile label="Measured" value={metrics.measured} />
            <CountTile label="Inbox" value={metrics.inbox} />
            <CountTile label="Spam" value={metrics.spam} />
            <CountTile label="Bounced" value={metrics.bounced} />
            <CountTile label="Unverified / pending" value={metrics.unverified} />
          </div>
          {metrics.sent > 0 && metrics.measured === 0 ? (
            <p className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              No folder placement could be confirmed in this period. Placement can only be measured when the
              receiving warmup mailbox is one we can read; other sends stay Unverified.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Compact rate + sample for a table cell. */
export function RateCell({ rate, unit }: { rate: Rate | undefined; unit: string }) {
  if (!rate) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={rate.value === null ? "text-xs text-muted-foreground" : "font-medium"}>
        {formatRateValue(rate)}
      </span>
      <span className="text-[11px] text-muted-foreground">{formatRateSample(rate, unit)}</span>
    </span>
  );
}
