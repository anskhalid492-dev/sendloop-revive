import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EMPTY_SETUP_PROGRESS,
  SETUP_STEPS,
  REQUIRED_SETUP_STEPS,
  countCompleted,
  nextSetupStep,
  type SetupProgress,
} from "@/lib/setup-journey";

function ProgressRing({ value, total }: { value: number; total: number }) {
  const pct = total ? value / total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} className="fill-none stroke-border" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          className="fill-none stroke-primary"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {value}/{total}
      </span>
    </div>
  );
}

export function SetupJourney({
  progress,
  loading = false,
  variant = "full",
  onDismiss,
}: {
  progress: SetupProgress | null | undefined;
  loading?: boolean;
  /** "compact" is the dashboard card, "full" is the dedicated setup page. */
  variant?: "full" | "compact";
  onDismiss?: () => void;
}) {
  const state = progress ?? EMPTY_SETUP_PROGRESS;
  const done = countCompleted(state);
  const total = REQUIRED_SETUP_STEPS.length;
  const next = nextSetupStep(state);
  const complete = done === total;

  return (
    <div className="surface-card relative overflow-hidden p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative flex flex-wrap items-center gap-5">
        <ProgressRing value={done} total={total} />
        <div className="min-w-[14rem] flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3" /> Guided setup
          </span>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">
            Your MunchReach setup — {done}/{total} complete
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Checking your workspace…"
              : complete
                ? "Everything is live. Keep working replies in the unified inbox."
                : next
                  ? `Next up: ${next.title} · about ${next.estimate}`
                  : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {next ? (
            <Button asChild size="sm">
              <Link to={next.to}>
                {next.cta} <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/inbox">Open inbox</Link>
            </Button>
          )}
          {variant === "compact" ? (
            <Button asChild size="sm" variant="ghost">
              <Link to="/setup">View all steps</Link>
            </Button>
          ) : null}
          {onDismiss ? (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      </div>

      <ol className="relative mt-7 space-y-1">
        {SETUP_STEPS.map((step, i) => {
          const isDone = state[step.key];
          const isNext = next?.key === step.key;
          const last = i === SETUP_STEPS.length - 1;
          return (
            <motion.li
              key={step.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.25 }}
              className="relative flex gap-4 pb-1"
            >
              {/* connector */}
              {!last ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[15px] top-9 h-[calc(100%-1.25rem)] w-px",
                    isDone ? "bg-primary/40" : "bg-border",
                  )}
                />
              ) : null}

              <span
                className={cn(
                  "relative z-[1] mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : isNext
                      ? "border-primary bg-background text-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {loading && !isDone ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : isDone ? (
                  <Check className="size-4" />
                ) : (
                  step.index
                )}
              </span>

              <div
                className={cn(
                  "flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 transition-colors",
                  isNext ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-accent/50",
                )}
              >
                <div className="min-w-[12rem] flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isDone ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {step.title}
                    {!step.required ? (
                      <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Ongoing
                      </span>
                    ) : null}
                  </p>
                  {variant === "full" || isNext ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                  ) : null}
                </div>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {isDone ? "Done" : step.estimate}
                </span>
                <Button asChild size="sm" variant={isNext ? "default" : "ghost"}>
                  <Link to={step.to}>
                    {isDone ? "Review" : step.cta}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
