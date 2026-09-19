import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Pause, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSenderRoutingStatus, type SenderRoutingRow } from "@/lib/sender-status.functions";
import { bulkSetSendingAccountsPaused } from "@/lib/sending.functions";
import {
  mailboxActivityLabel,
  mailboxReadinessBadges,
  mailboxWarmupLabel,
  type MailboxReadinessBadge,
} from "@/lib/sender-status-view";

const BADGE_STYLE: Record<MailboxReadinessBadge["tone"], string> = {
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

function ReadinessPill({ badge, detail }: { badge: MailboxReadinessBadge; detail: string }) {
  const Icon = badge.tone === "success" ? CheckCircle2 : ShieldAlert;
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        BADGE_STYLE[badge.tone],
      )}
    >
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
}

/** Read-only connection status per mailbox — never credentials or vendor identity. */
export function SenderStatusList({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getSenderRoutingStatus);
  const setPaused = useServerFn(bulkSetSendingAccountsPaused);
  const query = useQuery({
    queryKey: ["sender-routing-status", workspaceId],
    queryFn: () => fetchStatus({ data: { workspaceId } }),
    staleTime: 60_000,
  });
  const pauseMutation = useMutation({
    mutationFn: (input: { id: string; paused: boolean }) =>
      setPaused({ data: { ids: [input.id], paused: input.paused } }),
    onSuccess: async (_result, input) => {
      toast.success(input.paused ? "Mailbox paused" : "Mailbox resumed");
      await queryClient.invalidateQueries({ queryKey: ["sender-routing-status", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking sender status…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        {(query.error as Error).message || "Could not load sender status"}
      </p>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="space-y-3 p-6 text-center">
        <p className="text-sm font-medium">No mailboxes connected yet</p>
        <p className="text-sm text-muted-foreground">
          Connect your own mailbox to start sending.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/mailboxes/add">Add a mailbox</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => (
        <div
          key={row.accountId}
          className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.fromEmail}</p>
            <p className="text-xs text-muted-foreground">
              {row.domain} · MunchReach managed sending · {mailboxActivityLabel(row)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Limits: {row.dailyLimit}/day · {row.hourlyLimit}/hour
              </span>
              <span>Warmup: {mailboxWarmupLabel(row.warmupStatus)}</span>
              <span>Health: {row.healthScore}/100</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {mailboxReadinessBadges(row).map((badge) => (
              <ReadinessPill key={badge.label} badge={badge} detail={row.providerDetail} />
            ))}
            <Button asChild size="sm" variant="outline">
              <Link to="/mailboxes" search={{ mailbox: row.accountId }}>
                View details
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pauseMutation.isPending}
              onClick={() => pauseMutation.mutate({ id: row.accountId, paused: !row.paused })}
            >
              {row.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {row.paused ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
