import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type WebhookDelivery = {
  id: string;
  provider: string;
  event_id: string | null;
  event_type: string | null;
  signature_ok: boolean;
  status_code: number;
  result: string | null;
  error: string | null;
  received_at: string;
};

export type WebhookHealth = {
  configured: boolean;
  endpoint: string;
  recent: WebhookDelivery[];
  lastEventAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  total24h: number;
  rejected24h: number;
  failed24h: number;
};

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Live health of the referral billing webhook: deliveries, signatures, errors. */
export function WebhookHealthPanel({
  health,
  onRefresh,
}: {
  health: WebhookHealth;
  onRefresh?: () => void;
}) {
  const healthy =
    health.configured && health.rejected24h === 0 && health.failed24h === 0 && Boolean(health.lastVerifiedAt);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {healthy ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            )}
            Billing webhook health
          </CardTitle>
          <CardDescription>
            Point your billing provider at <code className="text-xs">{health.endpoint}</code> and sign the raw body
            with the referral billing secret.
          </CardDescription>
        </div>
        {onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Signing secret" value={health.configured ? "Configured" : "Missing"} tone={health.configured ? "ok" : "bad"} />
          <Stat label="Last event received" value={ago(health.lastEventAt)} />
          <Stat label="Last verified event" value={ago(health.lastVerifiedAt)} tone={health.lastVerifiedAt ? "ok" : "warn"} />
          <Stat
            label="Last 24 hours"
            value={`${health.total24h} received`}
            hint={`${health.rejected24h} rejected · ${health.failed24h} failed`}
            tone={health.rejected24h || health.failed24h ? "warn" : "ok"}
          />
        </div>

        {!health.configured ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
            No signing secret is set, so every delivery is rejected. Add <code>REFERRAL_BILLING_SECRET</code> and use
            the same value in your billing provider.
          </p>
        ) : null}

        {health.lastError ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            Most recent problem: {health.lastError}
          </p>
        ) : null}

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No webhook deliveries recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                health.recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.received_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{row.provider}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.event_type ?? "—"}</div>
                      <div className="text-muted-foreground">{row.event_id ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      {row.signature_ok ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Rejected</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{row.result ?? "—"}</span>
                      <span className="ml-2 text-muted-foreground">HTTP {row.status_code}</span>
                    </TableCell>
                    <TableCell className="max-w-[280px] text-xs text-muted-foreground">{row.error ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
