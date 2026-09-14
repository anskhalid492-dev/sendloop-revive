/**
 * Provider health diagnostics.
 *
 * Explains WHY a provider is healthy, degraded or unhealthy using the rolling
 * window of real API operations — never a bare status badge.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProviderDiagnostics, testProviderHealth } from "@/lib/admin.functions";
import { getMailerooInfrastructure } from "@/lib/maileroo-admin.functions";

const HEALTH_STYLES: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  degraded: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  down: "bg-destructive/10 text-destructive border-destructive/20",
  unknown: "bg-muted text-muted-foreground border-border",
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Unhealthy",
  unknown: "Not measured",
};

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-words">{value}</div>
    </div>
  );
}

export function ProviderDiagnosticsDialog({
  providerId,
  providerName,
  providerSlug,
  open,
  onOpenChange,
}: {
  providerId: string | null;
  providerName: string;
  providerSlug?: string | undefined;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchDiagnostics = useServerFn(getProviderDiagnostics);
  const runTest = useServerFn(testProviderHealth);

  const query = useQuery({
    queryKey: ["admin", "provider-diagnostics", providerId],
    queryFn: () => fetchDiagnostics({ data: { id: providerId! } }),
    enabled: Boolean(providerId) && open,
  });

  const testMutation = useMutation({
    mutationFn: () => runTest({ data: { id: providerId! } }),
    onSuccess: (result) => {
      toast[result.probe.health === "healthy" ? "success" : "error"](result.probe.reason);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const d = query.data;

  const fetchMaileroo = useServerFn(getMailerooInfrastructure);
  const mailerooQuery = useQuery({
    queryKey: ["admin", "maileroo-infrastructure"],
    queryFn: () => fetchMaileroo(),
    enabled: open && providerSlug === "maileroo",
  });
  const m = mailerooQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{providerName} — health diagnostics</DialogTitle>
          <DialogDescription>
            Calculated from real provider API operations in the last{" "}
            {d?.windowHours ?? 24} hours. A verified connection only proves the credentials work.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading || !d ? (
          <p className="text-sm text-muted-foreground">Loading diagnostics…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={HEALTH_STYLES[d.health]}>
                {HEALTH_LABEL[d.health] ?? d.health}
              </Badge>
              <span className="text-sm">{d.reason}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Error rate" value={`${(d.errorRate * 100).toFixed(1)}%`} />
              <Stat label="Successful operations" value={d.successful} />
              <Stat label="Failed operations" value={d.failed} />
              <Stat label="Last HTTP status" value={d.lastHttpStatus ?? "—"} />
              <Stat label="Last success" value={when(d.lastSuccessAt)} />
              <Stat label="Last failure" value={when(d.lastFailureAt)} />
            </div>

            {d.lastError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="text-xs font-medium text-destructive">
                  Last error{d.lastErrorCode ? ` · ${d.lastErrorCode}` : ""}
                </div>
                <p className="mt-1 font-mono text-xs break-words">{d.lastError}</p>
              </div>
            ) : null}

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Recent operations
              </div>
              {d.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No operations recorded in this window yet.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {d.recent.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                    >
                      <Badge
                        variant="outline"
                        className={event.ok ? HEALTH_STYLES["healthy"] : HEALTH_STYLES["down"]}
                      >
                        {event.ok ? "ok" : (event.http_status ?? "fail")}
                      </Badge>
                      <span className="font-medium">{event.operation}</span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {event.error_code ?? event.message ?? ""}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(event.occurred_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <Activity className="size-4" />
                Refresh
              </Button>
              <Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                <RefreshCcw
                  className={testMutation.isPending ? "size-4 animate-spin" : "size-4"}
                />
                Test provider
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
