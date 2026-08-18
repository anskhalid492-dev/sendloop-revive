import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCcw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWebhookStatus } from "@/lib/ops.functions";

const LABEL: Record<string, string> = {
  valid: "Valid",
  invalid: "Invalid",
  missing: "Unsigned",
  failed: "Failed",
  unknown: "No deliveries yet",
};

/** Live signature-verification status for the inbound-email webhook. */
export function WebhookStatus() {
  const read = useServerFn(getWebhookStatus);
  const query = useQuery({ queryKey: ["webhook-status"], queryFn: () => read() });
  const data = query.data;
  const status = data?.status ?? "unknown";

  const Icon =
    status === "valid" ? CheckCircle2 : status === "unknown" ? HelpCircle : AlertTriangle;
  const tone =
    status === "valid"
      ? "text-emerald-600"
      : status === "unknown"
        ? "text-muted-foreground"
        : "text-destructive";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Webhook signature
          </CardTitle>
          <CardDescription>
            Strict verification is enforced — unsigned or mismatched deliveries are rejected.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              status === "valid"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                : status === "unknown"
                  ? ""
                  : "border-destructive/20 bg-destructive/10 text-destructive"
            }
          >
            {LABEL[status] ?? status}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Refresh webhook status"
            onClick={() => void query.refetch()}
          >
            <RefreshCcw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
          <p className="text-muted-foreground">{data?.reason}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <dt className="font-medium text-foreground">Scheme</dt>
            <dd>{data?.method ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Last valid</dt>
            <dd>{data?.lastValidAt ? new Date(data.lastValidAt).toLocaleString() : "Never"}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Accepted</dt>
            <dd>{data?.validCount ?? 0}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Rejected</dt>
            <dd>{data?.invalidCount ?? 0}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Provider signing secret</dt>
            <dd>{data?.signingSecretConfigured ? "Configured" : "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Shared secret</dt>
            <dd>{data?.sharedSecretConfigured ? "Configured" : "Not set"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
