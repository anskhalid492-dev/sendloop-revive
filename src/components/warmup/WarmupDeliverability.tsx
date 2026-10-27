import {
  DELIVERABILITY_PERIODS,
  PERIOD_LABEL,
  formatRateSample,
  formatRateValue,
  type DeliverabilityPeriod,
  type Rate,
} from "@/lib/warmup-deliverability";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
        <Button
          key={p}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium",
            value === p ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {PERIOD_LABEL[p]}
        </Button>
      ))}
    </div>
  );
}

/** Compact rate + sample for a table cell. */
export function RateCell({ rate, unit }: { rate: Rate | undefined; unit: string }) {
  if (!rate) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={formatRateSample(rate, unit)}>
      <span className={rate.value === null ? "text-xs text-muted-foreground" : "font-medium"}>
        {formatRateValue(rate)}
      </span>
    </span>
  );
}
