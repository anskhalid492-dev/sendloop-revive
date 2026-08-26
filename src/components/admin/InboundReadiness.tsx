import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { enableReceiving, getInboundChecklist, getScheduler, setScheduler } from "@/lib/ops.functions";

const ICONS: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  pending: Clock,
  failed: AlertTriangle,
  unknown: HelpCircle,
};

const TONES: Record<string, string> = {
  ok: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-destructive",
  unknown: "text-muted-foreground",
};

/**
 * Admin checklist that verifies everything required for replies to reach the
 * inbox, plus the scheduler that keeps campaigns ticking.
 */
export function InboundReadiness() {
  const queryClient = useQueryClient();
  const check = useServerFn(getInboundChecklist);
  const enable = useServerFn(enableReceiving);
  const readScheduler = useServerFn(getScheduler);
  const saveScheduler = useServerFn(setScheduler);
  const baseUrl = typeof window === "undefined" ? null : window.location.origin;

  const checklist = useQuery({
    queryKey: ["inbound-readiness", baseUrl],
    queryFn: () => check({ data: { baseUrl } }),
  });

  const scheduler = useQuery({ queryKey: ["campaign-scheduler"], queryFn: () => readScheduler() });

  const enableMutation = useMutation({
    mutationFn: () => enable(),
    onSuccess: () => {
      toast.success("Inbound receiving enabled");
      void queryClient.invalidateQueries({ queryKey: ["inbound-readiness"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const schedulerMutation = useMutation({
    mutationFn: () => saveScheduler({ data: { baseUrl: baseUrl! } }),
    onSuccess: () => {
      toast.success("Scheduler pointed at this deployment");
      void queryClient.invalidateQueries({ queryKey: ["campaign-scheduler"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = checklist.data?.items ?? [];
  const allOk = items.length > 0 && items.every((item) => item.status === "ok");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Platform reply delivery checklist</CardTitle>
            <CardDescription>
              {checklist.data?.domain ? (
                <>
                  Checking inbound routing for the MunchReach platform domain: <strong>{checklist.data.domain}</strong>
                </>
              ) : (
                "Configure a reply-to inbox to run these checks."
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {allOk ? <Badge variant="secondary">Receiving live</Badge> : null}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Re-run checks"
              onClick={() => void checklist.refetch()}
            >
              <RefreshCcw className={checklist.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {checklist.isLoading ? (
            <p className="text-sm text-muted-foreground">Running checks…</p>
          ) : checklist.isError ? (
            <p className="text-sm text-destructive">Couldn’t run the checks. Try again.</p>
          ) : (
            items.map((item) => {
              const Icon = ICONS[item.status] ?? HelpCircle;
              return (
                <div key={item.id} className="flex gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONES[item.status]}`} />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="break-words text-xs text-muted-foreground">{item.detail}</p>
                    {"record" in item && item.record ? (
                      <div className="rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px]">
                        <div>Type: {item.record.type}</div>
                        <div>Name: {item.record.name}</div>
                        <div>Value: {item.record.value}</div>
                        {item.record.priority !== undefined ? (
                          <div>Priority: {item.record.priority}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          {checklist.data && checklist.data.receiving !== "enabled" ? (
            <Button
              size="sm"
              onClick={() => enableMutation.mutate()}
              disabled={enableMutation.isPending}
            >
              {enableMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enable inbound receiving
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign scheduler</CardTitle>
          <CardDescription>
            Ticks every 5 minutes to send due messages and schedule follow-ups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={scheduler.data?.configured ? "secondary" : "outline"}>
              {scheduler.data?.configured ? "Active" : "Not configured"}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {scheduler.data?.schedule}
            </span>
          </div>
          <p className="break-all text-xs text-muted-foreground">
            {scheduler.data?.url ?? "No runner endpoint stored yet."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => schedulerMutation.mutate()}
            disabled={schedulerMutation.isPending || !baseUrl}
          >
            {schedulerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Point scheduler at this deployment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
