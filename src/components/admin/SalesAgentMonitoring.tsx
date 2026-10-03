/** Admin → AI Sales Agent. All aggregation runs on the server. */
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar, LoadingRows, SearchInput, StatCard, num } from "@/components/app/admin/OutreachUI";
import { adminSalesAgentMonitoring } from "@/lib/sales-agent.functions";
import { monitoringView } from "@/lib/sales-agent-monitoring-view";
import { formatRate, isoDay, presetRange } from "@/lib/warmup-analytics";

type Preset = "today" | "last7" | "last30" | "this_month" | "custom";
const PRESETS: Record<Preset, string> = { today: "Today", last7: "Last 7 days", last30: "Last 30 days", this_month: "This month", custom: "Custom range" };
const PAGE_SIZE = 20;
const ms = (v: number | null) => (v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);

export function SalesAgentMonitoring() {
  const load = useServerFn(adminSalesAgentMonitoring);
  const today = isoDay(new Date());
  const [preset, setPreset] = useState<Preset>("last30");
  const [custom, setCustom] = useState(() => presetRange("last30", today));
  const range = preset === "custom" ? custom : presetRange(preset, today);
  const invalid = preset === "custom" && (!custom.from || !custom.to || custom.from > custom.to);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [range.from, range.to, debounced]);

  const q = useQuery({
    queryKey: ["admin", "sales-agent-monitoring", range.from, range.to, debounced, page],
    queryFn: () => load({ data: { ...range, search: debounced || null, page, pageSize: PAGE_SIZE } }),
    enabled: !invalid,
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const t = d?.totals;
  // Loading placeholders only while a request is in flight; errors and invalid ranges show "—".
  const view = monitoringView({ invalid, isError: q.isError, hasData: Boolean(d), errorMessage: (q.error as Error | null)?.message });
  const pending = view === "loading";
  const v = (x: string | undefined) => (t ? (x ?? "—") : pending ? "…" : "—");

  return (
    <div className="space-y-6">
      <FilterBar>
        <Select value={preset} onValueChange={(x) => setPreset(x as Preset)}>
          <SelectTrigger className="h-9 w-44" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRESETS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === "custom" ? (
          <>
            <Input type="date" className="h-9 w-40" aria-label="From" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <Input type="date" className="h-9 w-40" aria-label="To" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {range.from} → {range.to} (UTC days)
        </span>
      </FilterBar>
      {invalid ? <p className="text-sm text-destructive">Choose a start date on or before the end date.</p> : null}
      {q.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span>{view === "denied" ? "You don't have access to AI Sales Agent analytics." : "Unable to load AI Sales Agent analytics."}</span>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : null}
      {d?.truncated ? <p className="text-xs text-muted-foreground">Showing the first 20,000 AI steps in this range — choose a shorter range for complete totals.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="AI Requests" value={v(t && num(t.requests))} hint={t ? `${num(t.decisions)} decisions · ${num(t.replies)} replies` : ""} />
        <StatCard label="Successful" value={v(t && num(t.success))} />
        <StatCard label="Failed" value={v(t && num(t.failed))} hint="Provider unavailable or error" />
        <StatCard label="Timed Out" value={v(t && num(t.timedOut))} />
        <StatCard label="Success Rate" value={v(t && formatRate(t.successRate))} />
        <StatCard label="Average Response Time" value={v(t && ms(t.avgLatencyMs))} />
        <StatCard label="Total AI Usage" value={v(t && `${num(t.totalTokens)} tokens`)} hint={t ? `${num(t.inputTokens)} in · ${num(t.outputTokens)} out` : ""} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">AI Decision outcomes</h3>
          {!d ? (
            pending ? <LoadingRows /> : <p className="text-sm text-muted-foreground">—</p>
          ) : d.outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI decision data yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.outcomes.map((o) => (
                <li key={o.outcome} className="flex justify-between">
                  <span>{o.outcome}</span>
                  <span className="tabular-nums">{num(o.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Failures and fallbacks</h3>
          {!d ? (
            pending ? <LoadingRows /> : <p className="text-sm text-muted-foreground">—</p>
          ) : d.failures.every((f) => f.count === 0) ? (
            <p className="text-sm text-muted-foreground">No failures yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.failures.map((f) => (
                <li key={f.kind} className="flex justify-between">
                  <span>{f.label}</span>
                  <span className="tabular-nums">{num(f.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Workspaces</h3>
          <SearchInput value={search} onChange={setSearch} placeholder="Search workspaces" />
        </div>
        {!d ? (
          pending ? <LoadingRows /> : <p className="text-sm text-muted-foreground">—</p>
        ) : d.workspaces.total === 0 ? (
          <p className="text-sm text-muted-foreground">{debounced ? "No workspaces match your search." : "No AI Sales Agent usage yet."}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">AI Requests</TableHead>
                  <TableHead className="text-right">Successful</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Timed Out</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                  <TableHead className="text-right">Avg Response</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.workspaces.rows.map((w) => (
                  <TableRow key={w.workspaceId}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(w.requests)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(w.success)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(w.failed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(w.timedOut)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRate(w.successRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ms(w.avgLatencyMs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(w.tokens)} tokens</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {d.workspaces.pages > 1 ? (
              <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
                <span>
                  Page {d.workspaces.page} of {d.workspaces.pages} · {num(d.workspaces.total)} workspaces
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= d.workspaces.pages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
