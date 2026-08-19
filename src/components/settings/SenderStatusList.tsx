import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldAlert, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSenderRoutingStatus, type SenderRoutingRow } from "@/lib/sender-status.functions";

function DnsPill({ row }: { row: SenderRoutingRow }) {
  const map = {
    verified: { label: "DNS verified", style: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    pending: { label: "DNS pending", style: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    failed: { label: "DNS failed", style: "border-destructive/30 bg-destructive/10 text-destructive" },
    missing: { label: "Domain not added", style: "border-border bg-muted text-muted-foreground" },
  } as const;
  const item = map[row.dnsStatus];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", item.style)}>
      {item.label}
    </span>
  );
}

function ProviderPill({ row }: { row: SenderRoutingRow }) {
  const map = {
    verified: {
      label: "Sending verified",
      style: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      Icon: CheckCircle2,
    },
    not_verified: {
      label: "Not verified for sending",
      style: "border-destructive/30 bg-destructive/10 text-destructive",
      Icon: ShieldAlert,
    },
    unknown: {
      label: "Verification unknown",
      style: "border-border bg-muted text-muted-foreground",
      Icon: ShieldQuestion,
    },
    error: {
      label: "Check failed",
      style: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      Icon: ShieldAlert,
    },
  } as const;
  const item = map[row.providerStatus];
  return (
    <span
      title={row.providerDetail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        item.style,
      )}
    >
      <item.Icon className="h-3 w-3" />
      {item.label}
    </span>
  );
}

/** Read-only routing status per mailbox — provider name only, never credentials. */
export function SenderStatusList({ workspaceId }: { workspaceId: string }) {
  const fetchStatus = useServerFn(getSenderRoutingStatus);
  const query = useQuery({
    queryKey: ["sender-routing-status", workspaceId],
    queryFn: () => fetchStatus({ data: { workspaceId } }),
    staleTime: 60_000,
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
          Add a domain and connect a mailbox to start sending.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/sending">Go to Email Accounts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => (
        <div key={row.accountId} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.fromEmail}</p>
            <p className="text-xs text-muted-foreground">
              {row.domain} · routed via {row.provider ?? "no managed provider"} ·{" "}
              {row.paused ? "paused" : row.active ? "active" : "inactive"}
            </p>
          </div>
          <DnsPill row={row} />
          <ProviderPill row={row} />
        </div>
      ))}
    </div>
  );
}
