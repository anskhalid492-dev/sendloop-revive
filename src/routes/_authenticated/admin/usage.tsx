/**
 * Admin → Usage & Metering (Phase 9).
 *
 * Aggregated platform usage for a date range plus per-workspace consumption
 * against the limits of the plan each workspace is actually on.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { adminLoadUsage } from "@/lib/admin-ops.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/usage")({
  component: UsagePage,
});

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString();
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function UsagePage() {
  const load = useServerFn(adminLoadUsage);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [range, setRange] = useState({ from: isoDaysAgo(30), to: isoDaysAgo(0) });

  const query = useQuery({
    queryKey: ["admin-usage", range.from, range.to],
    queryFn: () =>
      load({
        data: {
          from: new Date(`${range.from}T00:00:00.000Z`).toISOString(),
          to: new Date(`${range.to}T23:59:59.999Z`).toISOString(),
        },
      }),
  });

  const totals = query.data?.totals;
  const cards = useMemo(
    () =>
      totals
        ? [
            { label: "Emails sent", value: fmt(totals.emailsSent) },
            { label: "Leads added", value: fmt(totals.leads) },
            { label: "Campaign launches", value: fmt(totals.campaignRuns) },
            { label: "Warmup sends", value: fmt(totals.warmupSends) },
            { label: "Automation runs", value: fmt(totals.automationRuns) },
            { label: "Integration events", value: fmt(totals.apiRequests) },
            { label: "Credits consumed", value: fmt(totals.creditsConsumed) },
            { label: "Stored media", value: bytes(totals.storageBytes) },
          ]
        : [],
    [totals],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Usage &amp; metering</h2>
          <p className="text-sm text-muted-foreground">
            Platform-wide consumption and per-workspace usage against plan limits.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          <Button size="sm" onClick={() => setRange({ from, to })} disabled={query.isFetching}>
            {query.isFetching ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Apply
          </Button>
        </div>
      </div>

      {query.isError ? (
        <div className="surface-card p-6 text-sm text-destructive">
          {(query.error as Error).message}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(query.isLoading ? Array.from({ length: 8 }) : cards).map((card, i) => (
          <div key={i} className="surface-card p-4">
            <p className="text-xs uppercase text-muted-foreground">
              {(card as { label?: string })?.label ?? "Loading"}
            </p>
            <p className="mt-1 text-2xl font-bold">
              {(card as { value?: string })?.value ?? "—"}
            </p>
          </div>
        ))}
      </div>

      {totals?.aiRequests === null ? (
        <p className="text-xs text-muted-foreground">
          AI request metering is not tracked by this platform, so no number is reported here.
        </p>
      ) : null}

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border/40 px-5 py-3">
          <h3 className="text-sm font-semibold">Usage by workspace</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Emails sent</TableHead>
                <TableHead className="w-[220px]">Email limit usage</TableHead>
                <TableHead className="text-right">Credit balance</TableHead>
                <TableHead className="text-right">Credits used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data?.workspaces ?? []).map((w) => {
                const pct =
                  w.emailLimit && w.emailLimit > 0
                    ? Math.min(100, Math.round((w.emailsSent / w.emailLimit) * 100))
                    : null;
                return (
                  <TableRow key={w.workspaceId}>
                    <TableCell className="font-medium">{w.workspaceName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{w.planName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {w.planStatus}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(w.emailsSent)}</TableCell>
                    <TableCell>
                      {pct === null ? (
                        <span className="text-xs text-muted-foreground">No limit on plan</span>
                      ) : (
                        <div className="space-y-1">
                          <Progress
                            value={pct}
                            className={cn("h-2", pct >= 90 && "[&>div]:bg-destructive")}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {fmt(w.emailsSent)} / {fmt(w.emailLimit)} ({pct}%)
                          </p>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(w.creditBalance)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(w.creditsConsumed)}</TableCell>
                  </TableRow>
                );
              })}
              {!query.isLoading && (query.data?.workspaces ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No workspace usage in this range.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
