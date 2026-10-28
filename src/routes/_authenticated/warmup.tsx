import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Flame,
  Info,
  Pause,
  Play,
  Send,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { STAGE_LABEL } from "@/lib/warmup-ramp";
import { WARMUP_DELIVERY_EXPLANATION } from "@/lib/warmup-delivery";
import { WarmupHealthIndicator } from "@/components/mailboxes/WarmupHealthIndicator";
import { WarmupSettingsDialog } from "@/components/warmup/WarmupSettingsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWarmupRealtime } from "@/hooks/useWarmupRealtime";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlanGates } from "@/hooks/usePlanGates";
import { Link } from "@tanstack/react-router";
import { getWarmupDeliverability, listWarmupAccounts, runWarmupNow, saveWarmupSettings } from "@/lib/warmup.functions";
import { PeriodPicker, RateCell } from "@/components/warmup/WarmupDeliverability";
import type { DeliverabilityPeriod } from "@/lib/warmup-deliverability";
import { cn } from "@/lib/utils";
import { warmupActivityLabel } from "@/lib/warmup-table";
import { showWarmupSafe } from "@/lib/warmup-display";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string | undefined;
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}




export const Route = createFileRoute("/_authenticated/warmup")({
  head: () => ({
    meta: [
      { title: "Inbox Warmup — MunchReach" },
      {
        name: "description",
        content:
          "Run real mailbox-to-mailbox warmup with automatic ramping, health scoring and safety pauses.",
      },
      { property: "og:title", content: "Inbox Warmup — MunchReach" },
      {
        property: "og:description",
        content: "Real warmup sending, deliverability health scoring and automatic safety controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WarmupPage,
});

/**
 * Placement is only known when a warmup mailbox actually reports arrival. With
 * sends out but no placement signal yet we say so instead of showing a 0 that
 * looks like a real result.
 */
function WarmupPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listWarmupAccounts);
  const saveFn = useServerFn(saveWarmupSettings);
  const runNowFn = useServerFn(runWarmupNow);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [activityNow, setActivityNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    setActivityNow(Date.now());
    const timer = setInterval(() => setActivityNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { connected: liveConnected } = useWarmupRealtime();
  const { workspace } = useWorkspace();
  // UX only — saveWarmupSettings / runWarmupNow re-check the plan server-side.
  const plan = usePlanGates(workspace?.id);

  const accountsQuery = useQuery({
    queryKey: ["warmup-accounts"],
    queryFn: () => fetchAccounts(),
    // Health updates arrive over realtime; only fall back to polling if the
    // live channel could not connect.
    refetchInterval: liveConnected ? false : 30_000,
    refetchOnWindowFocus: !liveConnected,
    // One quick retry only: a failed load must show its reason instead of
    // leaving the dashboard on a blank placeholder.
    retry: 1,
  });
  const rows = accountsQuery.data?.accounts ?? [];
  const [period, setPeriod] = useState<DeliverabilityPeriod>("last7");
  const fetchDeliverability = useServerFn(getWarmupDeliverability);
  const deliverabilityQuery = useQuery({
    queryKey: ["warmup-deliverability", period],
    queryFn: () => fetchDeliverability({ data: { period } }),
    refetchInterval: 60_000,
  });
  const perMailbox = deliverabilityQuery.data?.mailboxes ?? {};


  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["warmup-accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  };

  const toggleMutation = useMutation({
    mutationFn: (vars: { accountId: string; enabled: boolean }) => {
      if (vars.enabled && !plan.warmupAllowed) {
        return Promise.reject(
          new Error(plan.warmupReason ?? "Warmup isn't available on your current plan."),
        );
      }
      return saveFn({ data: { accountId: vars.accountId, enabled: vars.enabled, resume: vars.enabled } });
    },
    onSuccess: async (result: { blocked?: boolean; message?: string }, vars) => {
      // Resume never overrides an active safety block — say so plainly instead
      // of flipping the mailbox back to blocked a moment later.
      if (result?.blocked) toast.error(result.message ?? "Resume is blocked by safety protection.");
      else toast.success(vars.enabled ? "Warmup started" : "Warmup stopped");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runNowMutation = useMutation({
    mutationFn: (accountId: string) => runNowFn({ data: { accountId } }),
    onMutate: (accountId: string) => setRunningId(accountId),
    onSettled: () => setRunningId(null),
    onSuccess: async (result: { sent: number; failed: number; reason?: string | null }) => {
      if (result.sent > 0) toast.success(`Warmup email sent (${result.sent})`);
      else if (result.failed > 0) toast.error(result.reason ?? "Warmup send failed");
      else toast.info(result.reason ?? "Nothing to send right now");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.warmup_enabled && !r.paused_by_system).length;
    const sent = rows.reduce((sum, r) => sum + r.sent_today, 0);
    const scored = rows.filter((r) => r.health_score !== null);
    const avg = scored.length
      ? Math.round(scored.reduce((sum, r) => sum + (r.health_score ?? 0), 0) / scored.length)
      : 0;
    const paused = rows.filter((r) => r.paused_by_system).length;
    const recovery = rows.filter(
      (r) => r.warmup_enabled && !r.paused_by_system && r.ramp_stage === "recovery",
    ).length;
    const healthy = rows.filter(
      (r) => r.warmup_enabled && !r.paused_by_system && (r.health_score ?? 0) >= 90,
    ).length;
    return { active, sent, avg, paused, recovery, healthy };
  }, [rows]);

  const settingsAccount = rows.find((r) => r.id === settingsId) ?? null;

  return (
    <AppShell
      title="Inbox Warmup"
    >
      <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        {plan.gates && !plan.warmupAllowed ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-sm text-muted-foreground">
              {plan.warmupReason ??
                `Warmup isn't available on the ${plan.planName ?? "current"} plan.`}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/billing">Upgrade plan</Link>
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Stat label="Active warmups" value={totals.active} />
          <Stat label="Healthy" value={totals.healthy} />
          <Stat
            label="In recovery"
            value={totals.recovery}
            tone={totals.recovery > 0 ? "text-amber-600" : undefined}
          />
          <Stat label="Warmup sent today" value={totals.sent} />
          <Stat label="Average health" value={totals.avg || "—"} />
          <Stat
            label="Auto-paused"
            value={totals.paused}
            tone={totals.paused > 0 ? "text-destructive" : undefined}
          />
        </div>

        {rows.some((r) => r.paused_by_system) ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Warmup paused automatically on {rows.filter((r) => r.paused_by_system).length}{" "}
                mailbox(es)
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        {accountsQuery.isLoading ? (
          <div className="h-56 animate-pulse rounded-xl bg-muted" />
        ) : accountsQuery.isError ? (
          <div className="surface-card space-y-3 p-10 text-center">
            <h2 className="text-lg font-semibold">Warmup data could not be loaded</h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              {(accountsQuery.error as Error)?.message ??
                "The warmup dashboard did not receive a response."}
            </p>
            <Button variant="outline" onClick={() => accountsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card space-y-2 p-10 text-center">
            <h2 className="text-lg font-semibold">No mailboxes connected yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Connect your own mailbox on the Email Accounts page, then enable warmup here.
            </p>
          </div>
        ) : (

          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Mailbox</th>
                  <th className="px-3 py-2.5 font-medium">Health</th>
                  <th className="px-3 py-2.5 font-medium">Today</th>
                  <th className="px-3 py-2.5 font-medium">Ramp</th>
                  <th className="px-3 py-2.5 text-right font-medium">Inbox rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spam rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bounce rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Last Activity</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.from_email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-medium",
                            row.state === "on"
                              ? "border-success/40 text-success"
                              : row.state === "blocked"
                                ? "border-destructive/40 text-destructive"
                                : "text-muted-foreground",
                          )}
                        >
                          {row.state === "on"
                            ? "Warming"
                            : row.state === "blocked"
                              ? !row.safety_active && row.safety_stale
                                ? "Paused — safe to resume"
                                : row.pause_kind === "bounce_safety"
                                  ? "Blocked by bounce-rate protection"
                                  : row.pause_kind === "complaint_safety"
                                    ? "Blocked by complaint-rate protection"
                                    : row.pause_kind === "provider_failure"
                                      ? "Blocked by provider/authentication failure"
                                      : row.pause_kind === "manual"
                                        ? "Paused"
                                        : "Blocked"
                              : "Off"}
                        </Badge>
                        {row.failed_today > 0 ? (
                          <span className="text-[11px] text-destructive">
                            {row.failed_today} failed today
                          </span>
                        ) : null}
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Warmup details for ${row.from_email}`}
                                className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring"
                              >
                                <Info className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              align="start"
                              collisionPadding={12}
                              className="w-72 border border-border bg-popover text-popover-foreground shadow-md"
                            >
                              <div className="space-y-1.5 text-xs leading-relaxed">
                                {(() => {
                                  const info: string[] = [];
                                  if (!row.block_reason && !row.pause_reason && row.stage_reason)
                                    info.push(row.stage_reason);
                                  const reason = row.block_reason ?? row.pause_reason;
                                  if (reason) info.push(reason);
                                  if (row.state === "blocked")
                                    info.push(
                                      `Bounce rate ${row.safety_metrics.bounceRate}% of ${row.safety_metrics.maxBounceRate}% limit · ${row.safety_metrics.bounced}/${row.safety_metrics.sent} sends in the last ${row.safety_metrics.windowDays} days${row.safety_metrics.sampleSufficient ? "" : ` · below the ${row.safety_metrics.minSample}-send minimum sample`}${row.safety_active ? ` · re-checked ${new Date(row.next_evaluation_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`,
                                    );
                                  if (info.length === 0)
                                    info.push("Warmup is running normally within current limits.");
                                  return info.map((line, i) => (
                                    <p key={i}>{line}</p>
                                  ));
                                })()}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                    </td>
                    <td className="px-3 py-2.5">
                      <WarmupHealthIndicator
                        score={row.health_score}
                        paused={!row.warmup_enabled || row.paused_by_system}
                      />
                    </td>
                    <td className="w-44 px-3 py-2.5">
                      <p className="mb-1 text-xs font-medium">Day {row.ramp_day || 1}</p>
                      <p className="mb-1 text-xs text-muted-foreground">Next day: {row.next_daily_limit}/day</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground">
                            {row.sent_today} / {row.target_today || "—"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          {WARMUP_DELIVERY_EXPLANATION}
                        </TooltipContent>
                      </Tooltip>
                      <Progress
                        className="mt-1 h-1.5"
                        value={
                          row.target_today > 0
                            ? Math.min(100, (row.sent_today / row.target_today) * 100)
                            : 0
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">
                        {STAGE_LABEL[(row.ramp_stage as keyof typeof STAGE_LABEL) ?? "ramp_up"] ??
                          "Ramping up"}
                      </span>
                      {row.progression_mode === "legacy" ? (
                        <span className="block text-xs capitalize text-muted-foreground">
                          {row.mode} · {row.max_volume || "—"}/day
                        </span>
                      ) : null}
                      {row.temp_failure_rate !== null ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {row.temp_failure_rate}% failures
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums"><RateCell rate={deliverabilityQuery.isError ? undefined : perMailbox[row.id]?.inboxRate} unit="measured" /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <div className="flex flex-col items-end gap-1">
                        <RateCell rate={deliverabilityQuery.isError ? undefined : perMailbox[row.id]?.spamRate} unit="measured" />
                        {!deliverabilityQuery.isError && showWarmupSafe(row, perMailbox[row.id]) ? (
                          <span className="text-[11px] font-medium text-success" title="Health 100/100; no detected warnings. Not confirmed inbox placement.">Safe</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <div className="flex flex-col items-end gap-1">
                        <RateCell rate={deliverabilityQuery.isError ? undefined : perMailbox[row.id]?.bounceRate} unit="sent" />
                        {!deliverabilityQuery.isError && showWarmupSafe(row, perMailbox[row.id]) ? (
                          <span className="text-[11px] font-medium text-success" title="Health 100/100; no detected warnings. Not confirmed inbox placement.">Safe</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.last_activity_at ? (
                        <time dateTime={row.last_activity_at} title={new Date(row.last_activity_at).toLocaleString()}>
                          {warmupActivityLabel(row.last_activity_at, activityNow)}
                        </time>
                      ) : "Not available"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            toggleMutation.isPending ||
                            !row.resumable ||
                            (!plan.warmupAllowed && !row.warmup_enabled)
                          }
                          title={
                            !plan.warmupAllowed
                              ? (plan.warmupReason ?? undefined)
                              : !row.resumable
                              ? `${row.block_reason ?? "Resume cannot override this safety block."} Resume becomes available as soon as the condition clears (next check ${new Date(row.next_evaluation_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).`
                              : undefined
                          }

                          onClick={() =>
                            toggleMutation.mutate({
                              accountId: row.id,
                              enabled: !row.warmup_enabled || row.paused_by_system,
                            })
                          }
                        >
                          {row.warmup_enabled && !row.paused_by_system ? (
                            <>
                              <Pause className="size-4" /> Stop
                            </>
                          ) : (
                            <>
                              <Play className="size-4" />
                              {row.paused_by_system ? "Resume" : "Start"}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Send one warmup email now"
                          disabled={runNowMutation.isPending && runningId === row.id}
                          onClick={() => runNowMutation.mutate(row.id)}
                        >
                          <Send className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSettingsId(row.id)}>
                          <Settings2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


      </div>
      </TooltipProvider>

      <WarmupSettingsDialog
        accountId={settingsId}
        accountEmail={settingsAccount?.from_email ?? ""}
        onOpenChange={(open) => {
          if (!open) setSettingsId(null);
        }}
      />
    </AppShell>
  );
}

// Warmup icon kept in the bundle for the shell nav parity.
export const WarmupIcon = Flame;
