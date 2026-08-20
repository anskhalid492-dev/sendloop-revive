/**
 * Admin → Production Checklist (Phase 9).
 *
 * Results come from `runProductionChecks`, which executes real queries, RPCs,
 * HTTP calls, DNS lookups and (in deep mode) real write round-trips. The score
 * is computed from those results only — a configured-but-unverified item never
 * counts as a pass.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { adminRunProductionChecks } from "@/lib/admin-ops.functions";
import type { CheckStatus, ProductionCheck } from "@/lib/production-checks.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/production")({
  component: ProductionChecklistPage,
});

const STATUS_META: Record<CheckStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  pass: { label: "PASS", icon: CheckCircle2, className: "text-emerald-600" },
  warning: { label: "WARNING", icon: AlertTriangle, className: "text-amber-600" },
  fail: { label: "FAIL", icon: XCircle, className: "text-destructive" },
  not_configured: { label: "NOT CONFIGURED", icon: CircleDashed, className: "text-muted-foreground" },
  manual: { label: "MANUAL CHECK", icon: CircleHelp, className: "text-sky-600" },
};

function ProductionChecklistPage() {
  const run = useServerFn(adminRunProductionChecks);
  const [result, setResult] = useState<Awaited<ReturnType<typeof adminRunProductionChecks>> | null>(null);
  const [mode, setMode] = useState<"quick" | "deep">("quick");

  const mutation = useMutation({
    mutationFn: (deep: boolean) => run({ data: { deep } }),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Checks complete — ${data.summary.score}% ready`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const categories = useMemo(() => {
    const map = new Map<string, ProductionCheck[]>();
    for (const check of (result?.checks ?? []) as ProductionCheck[]) {
      const list = map.get(check.category) ?? [];
      list.push(check);
      map.set(check.category, list);
    }
    return [...map.entries()];
  }, [result]);

  const summary = result?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Production checklist</h2>
          <p className="text-sm text-muted-foreground">
            Live verification of the running platform. Nothing is marked pass on configuration
            alone — each item executes a real check.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              setMode("quick");
              mutation.mutate(false);
            }}
          >
            {mutation.isPending && mode === "quick" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-4" />
            )}
            Run checks
          </Button>
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              setMode("deep");
              mutation.mutate(true);
            }}
          >
            {mutation.isPending && mode === "deep" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-4" />
            )}
            Run deep tests
          </Button>
        </div>
      </div>

      <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
        Deep tests create and immediately delete a throwaway account and a test storage object, and
        call the sending and billing provider APIs. They are recorded in the admin audit log.
      </p>

      {!result ? (
        <div className="surface-card p-10 text-center text-sm text-muted-foreground">
          {mutation.isPending ? "Running live checks…" : "Run the checks to see current readiness."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="surface-card p-5">
              <p className="text-xs uppercase text-muted-foreground">Critical blockers</p>
              <p className="mt-1 text-3xl font-bold text-destructive">{summary!.blockers.length}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase text-muted-foreground">Warnings</p>
              <p className="mt-1 text-3xl font-bold text-amber-600">{summary!.warnings}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase text-muted-foreground">Production readiness</p>
              <p className="mt-1 text-3xl font-bold">{summary!.score}%</p>
              <Progress value={summary!.score} className="mt-2 h-2" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {summary!.pass} pass · {summary!.failed} fail · {summary!.notConfigured} not
                configured · {summary!.manual} manual (excluded from the score)
              </p>
            </div>
          </div>

          {summary!.blockers.length > 0 ? (
            <div className="surface-card border-destructive/40 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="size-4" /> Critical blockers
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {summary!.blockers.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-muted-foreground">— {b.detail}</span>
                    {b.action ? <span className="text-xs text-primary">{b.action}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="surface-card p-5 text-sm text-emerald-600">
              No critical blockers detected in this run.
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Last run {new Date(result.ranAt).toLocaleString()} · {result.deep ? "deep" : "quick"}{" "}
            mode
          </p>

          <div className="space-y-4">
            {categories.map(([category, items]) => (
              <div key={category} className="surface-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
                  <h3 className="text-sm font-semibold">{category}</h3>
                  <div className="flex gap-1.5">
                    {(["fail", "warning", "not_configured", "pass"] as CheckStatus[]).map((s) => {
                      const n = items.filter((i) => i.status === s).length;
                      if (!n) return null;
                      return (
                        <Badge key={s} variant="outline" className={cn("text-[10px]", STATUS_META[s].className)}>
                          {n} {STATUS_META[s].label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <ul className="divide-y divide-border/40">
                  {items.map((item) => {
                    const meta = STATUS_META[item.status];
                    const Icon = meta.icon;
                    return (
                      <li key={item.id} className="flex gap-3 px-5 py-3 text-sm">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{item.label}</span>
                            {item.critical ? (
                              <Badge variant="outline" className="text-[10px]">
                                critical
                              </Badge>
                            ) : null}
                            {item.live ? null : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                not executed
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">
                            {item.detail}
                          </p>
                          {item.action ? (
                            <p className="mt-1 text-xs text-primary">→ {item.action}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                          <p className={cn("font-semibold", meta.className)}>{meta.label}</p>
                          <p>{new Date(item.checkedAt).toLocaleTimeString()}</p>
                          {item.durationMs !== null ? <p>{item.durationMs}ms</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
