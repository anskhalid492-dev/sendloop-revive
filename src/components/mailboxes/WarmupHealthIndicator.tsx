import { Activity, PauseCircle, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Compact inline warmup-health indicator for table rows. Displays the existing
 * health score only — it never computes or changes the score itself.
 */
export function WarmupHealthIndicator({
  score,
  paused = false,
}: {
  score: number | null;
  paused?: boolean;
}) {
  if (score === null && !paused) {
    return <span className="text-xs text-muted-foreground">Not scored</span>;
  }

  const bounded = score === null ? null : Math.max(0, Math.min(100, score));
  const state = paused
    ? { label: "Paused", icon: PauseCircle, text: "text-muted-foreground", bar: "bg-muted-foreground/40" }
    : bounded! >= 90
      ? { label: "Healthy", icon: ShieldCheck, text: "text-success", bar: "bg-success" }
      : { label: "Attention", icon: Activity, text: "text-warning", bar: "bg-warning" };
  const Icon = state.icon;

  return (
    <div
      className="inline-flex w-[104px] flex-col gap-1"
      role="status"
      aria-label={`Warmup health: ${state.label}${bounded === null ? "" : `, ${bounded} of 100`}`}
    >
      <span className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5 shrink-0", state.text)} aria-hidden="true" />
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {bounded === null ? "—" : `${bounded}/100`}
        </span>
      </span>
      <span className={cn("text-[11px] font-medium leading-none", state.text)}>{state.label}</span>
      <span className="h-1 w-[72px] overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full transition-[width]", state.bar)}
          style={{ width: `${bounded ?? 0}%` }}
        />
      </span>
    </div>
  );
}
