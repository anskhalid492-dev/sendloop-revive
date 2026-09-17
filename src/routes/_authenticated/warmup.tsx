import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Flame,
  HeartPulse,
  Pause,
  Play,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { WarmupSettingsDialog } from "@/components/warmup/WarmupSettingsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWarmupRealtime } from "@/hooks/useWarmupRealtime";
import { listWarmupAccounts, runWarmupNow, saveWarmupSettings } from "@/lib/warmup.functions";
import { cn } from "@/lib/utils";


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

/**
 * Placement is only known when a warmup mailbox actually reports arrival. With
 * sends out but no placement signal yet we say so instead of showing a 0 that
 * looks like a real result.
 */
function placement(value: number, counterpart: number, sent: number): string {
  if (value > 0 || counterpart > 0) return String(value);
  if (sent > 0) return "Not available";
  return "—";
}

function HealthIndicator({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-muted-foreground">Not scored</span>;
  }

  const bounded = Math.max(0, Math.min(100, score));
  const state =
    bounded >= 90
      ? { label: "Healthy", icon: ShieldCheck, tone: "text-success", surface: "border-success/20 bg-success/10" }
      : bounded >= 70
        ? { label: "Good / Watch", icon: HeartPulse, tone: "text-primary", surface: "border-primary/20 bg-primary/10" }
        : bounded >= 50
          ? { label: "Needs Attention", icon: ShieldAlert, tone: "text-warning", surface: "border-warning/25 bg-warning/10" }
          : { label: "At Risk", icon: ShieldAlert, tone: "text-destructive", surface: "border-destructive/20 bg-destructive/10" };
  const Icon = state.icon;
  const circumference = 2 * Math.PI * 16;
  const dashOffset = circumference * (1 - bounded / 100);

  return (
    <div className={cn("inline-flex min-w-[138px] items-center gap-2.5 rounded-lg border px-2.5 py-1.5 shadow-sm", state.surface)}>
      <span className={cn("relative flex size-10 shrink-0 items-center justify-center", state.tone)}>
        <svg viewBox="0 0 40 40" className="absolute inset-0 size-10 -rotate-90" aria-hidden="true">
          <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.16" />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 text-left">
        <span className={cn("block truncate text-xs font-semibold", state.tone)}>{state.label}</span>
        <span className="block text-[11px] font-medium tabular-nums text-foreground">
          {bounded}/100
        </span>
      </span>
    </div>
  );
}

function WarmupPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listWarmupAccounts);
  const saveFn = useServerFn(saveWarmupSettings);
  const runNowFn = useServerFn(runWarmupNow);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const { connected: liveConnected } = useWarmupRealtime();

  const accountsQuery = useQuery({
    queryKey: ["warmup-accounts"],
    queryFn: () => fetchAccounts(),
    // Health updates arrive over realtime; only fall back to polling if the
    // live channel could not connect.
    refetchInterval: liveConnected ? false : 30_000,
    refetchOnWindowFocus: !liveConnected,
  });
  const rows = accountsQuery.data?.accounts ?? [];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["warmup-accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  };

  const toggleMutation = useMutation({
    mutationFn: (vars: { accountId: string; enabled: boolean }) =>
      saveFn({ data: { accountId: vars.accountId, enabled: vars.enabled, resume: vars.enabled } }),
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
    const target = rows.reduce((sum, r) => sum + r.target_today, 0);
    const scored = rows.filter((r) => r.health_score !== null);
    const avg = scored.length
      ? Math.round(scored.reduce((sum, r) => sum + (r.health_score ?? 0), 0) / scored.length)
      : 0;
    const paused = rows.filter((r) => r.paused_by_system).length;
    return { active, sent, target, avg, paused };
  }, [rows]);

  const settingsAccount = rows.find((r) => r.id === settingsId) ?? null;

  return (
    <AppShell
      title="Inbox Warmup"
      description="Real mailbox-to-mailbox warmup with automatic ramping, health scoring and safety pauses."
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Warming mailboxes" value={totals.active} />
          <Stat label="Warmup sent today" value={totals.sent} />
          <Stat label="Today's target" value={totals.target} />
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
              <p className="text-muted-foreground">
                The safety guard stops sending when bounces, complaints, authentication or health
                cross your thresholds. Fix the cause, then resume warmup below.
              </p>
            </div>
          </div>
        ) : null}

        {accountsQuery.isLoading ? (
          <div className="h-56 animate-pulse rounded-xl bg-muted" />
        ) : rows.length === 0 ? (
          <div className="surface-card space-y-2 p-10 text-center">
            <h2 className="text-lg font-semibold">No mailboxes connected yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Connect your own mailbox on the Email Accounts page, then enable warmup here.
            </p>
          </div>
        ) : (
          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Mailbox</th>
                  <th className="px-3 py-2.5 font-medium">Health</th>
                  <th className="px-3 py-2.5 font-medium">Today</th>
                  <th className="px-3 py-2.5 font-medium">Ramp</th>
                  <th className="px-3 py-2.5 text-right font-medium">Inbox</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spam</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bounced</th>
                  <th className="px-3 py-2.5 text-right font-medium">Replied</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.from_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.domain} · Email Account
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-medium",
                            row.state === "on"
                              ? "border-emerald-500/40 text-emerald-600"
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
                      </div>
                      {row.block_reason || row.pause_reason ? (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                          {row.block_reason ?? row.pause_reason}
                        </p>
                      ) : null}
                      {row.state === "blocked" ? (
                        <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                          Bounce rate {row.safety_metrics.bounceRate}% of{" "}
                          {row.safety_metrics.maxBounceRate}% limit ·{" "}
                          {row.safety_metrics.bounced}/{row.safety_metrics.sent} sends in the last{" "}
                          {row.safety_metrics.windowDays} days
                          {row.safety_metrics.sampleSufficient
                            ? ""
                            : ` · below the ${row.safety_metrics.minSample}-send minimum sample`}
                          {row.safety_active
                            ? ` · re-checked ${new Date(row.next_evaluation_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </p>
                      ) : null}

                    </td>
                    <td className="px-3 py-2.5">
                      <HealthIndicator score={row.health_score} />
                    </td>
                    <td className="w-44 px-3 py-2.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {row.sent_today} / {row.target_today || "—"}
                        </span>
                        <span>{row.delivered_today} delivered</span>
                      </div>
                      <Progress
                        className="mt-1 h-1.5"
                        value={
                          row.target_today > 0
                            ? Math.min(100, (row.sent_today / row.target_today) * 100)
                            : 0
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5 capitalize">
                      {row.mode}
                      <span className="block text-xs text-muted-foreground">
                        max {row.max_volume || "—"}/day
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                      {placement(row.inbox_today, row.spam_today, row.sent_today)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        row.spam_today > 0 ? "text-amber-600" : "",
                      )}
                    >
                      {placement(row.spam_today, row.inbox_today, row.sent_today)}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums">{row.bounced_today}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.replied_today}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleMutation.isPending || !row.resumable}
                          title={
                            !row.resumable
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


        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="size-3.5" />
          Warmup runs on a scheduled worker: it sends real emails from your connected mailboxes,
          tracks delivery events and recalculates mailbox health after every run. This dashboard updates
          live as jobs send and placement is detected — no refresh needed.
        </p>
      </div>

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
