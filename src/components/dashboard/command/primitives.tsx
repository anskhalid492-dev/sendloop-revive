import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A full-width dashboard section with a consistent header rhythm. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bare,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bare?: boolean;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {bare ? (
        children
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {children}
        </div>
      )}
    </section>
  );
}

export function PanelLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
      <Link to={to}>
        {label} <ArrowUpRight className="size-3.5" />
      </Link>
    </Button>
  );
}

export function EmptyState({
  title,
  body,
  ctaLabel,
  to,
  icon: Icon,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  to?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      ) : null}
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
      {ctaLabel && to ? (
        <Button asChild size="sm" className="mt-1">
          <Link to={to}>{ctaLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Period-over-period indicator. Renders nothing without a baseline. */
export function Trend({
  value,
  inverted,
  suffix = "vs prev.",
}: {
  value: number | null;
  inverted?: boolean | undefined;
  suffix?: string | undefined;
}) {
  if (value === null) {
    return <span className="text-[11px] text-muted-foreground">no baseline</span>;
  }
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="size-3" /> flat
      </span>
    );
  }
  const up = value > 0;
  const good = inverted ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium tabular-nums",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
      )}
    >
      <Icon className="size-3" />
      {up ? "+" : "−"}
      {Math.abs(value)}% <span className="font-normal text-muted-foreground">{suffix}</span>
    </span>
  );
}

export function StatePill({
  tone,
  children,
}: {
  tone: "neutral" | "good" | "warn" | "bad" | "info";
  children: ReactNode;
}) {
  const styles: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    warn: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
    bad: "bg-destructive/12 text-destructive",
    info: "bg-primary/12 text-primary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SkeletonRows({ rows = 4, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-px bg-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse bg-card" style={{ height }} />
      ))}
    </div>
  );
}
