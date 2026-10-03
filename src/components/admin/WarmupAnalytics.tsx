/**
 * Admin → Warmup → Warmup Analytics. Platform-wide warmup volume from the
 * warmup engine's daily rollup; all aggregation happens on the server.
 */
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  FilterBar,
  LoadingRows,
  Pill,
  SearchInput,
  StatCard,
  fmtDate,
  num,
  type Tone,
} from "@/components/app/admin/OutreachUI";
import {
  adminWarmupAnalyticsMailboxes,
  adminWarmupAnalyticsOverview,
  adminWarmupAnalyticsWorkspaces,
} from "@/lib/warmup-analytics.functions";
import { formatRate, isoDay, presetRange, type RangePreset } from "@/lib/warmup-analytics";

const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom range",
};

const PAGE_SIZE = 20;

function stateTone(state: string): Tone {
  if (state === "warming") return "good";
  if (state === "paused") return "warn";
  if (state === "stopped") return "bad";
  return "muted";
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {pages} · {num(total)} rows
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function WarmupAnalytics() {
  const loadOverview = useServerFn(adminWarmupAnalyticsOverview);
  const loadWorkspaces = useServerFn(adminWarmupAnalyticsWorkspaces);
  const loadMailboxes = useServerFn(adminWarmupAnalyticsMailboxes);

  const today = isoDay(new Date());
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [custom, setCustom] = useState(() => presetRange("last30", today));
  const range = preset === "custom" ? custom : presetRange(preset, today);
  const customInvalid = preset === "custom" && (!custom.from || !custom.to || custom.from > custom.to);

  const [wsPage, setWsPage] = useState(1);
  const [mbPage, setMbPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "warming" | "paused">("all");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setWsPage(1);
    setMbPage(1);
  }, [range.from, range.to]);
  useEffect(() => setMbPage(1), [debounced, status]);

  const enabled = !customInvalid;
  const overview = useQuery({
    queryKey: ["admin", "warmup-analytics", "overview", range.from, range.to],
    queryFn: () => loadOverview({ data: range }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const workspaces = useQuery({
    queryKey: ["admin", "warmup-analytics", "workspaces", range.from, range.to, wsPage],
    queryFn: () => loadWorkspaces({ data: { ...range, page: wsPage, pageSize: PAGE_SIZE } }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const mailboxes = useQuery({
    queryKey: ["admin", "warmup-analytics", "mailboxes", range.from, range.to, mbPage, debounced, status],
    queryFn: () =>
      loadMailboxes({
        data: { ...range, page: mbPage, pageSize: PAGE_SIZE, search: debounced || null, status },
      }),
    enabled,
    placeholderData: keepPreviousData,
  });

  const o = overview.data;
  const noData = o && o.cards.allTime === 0;
  const chartData = useMemo(
    () => (o?.series.points ?? []).map((p) => ({ ...p, label: shortDay(p.bucket) })),
    [o],
  );

  if (overview.isError) {
    return <EmptyState message={`Could not load warmup analytics: ${(overview.error as Error).message}`} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Warmup emails today" value={o ? num(o.cards.today) : "…"} hint="UTC day" />
        <StatCard label="Warmup emails this week" value={o ? num(o.cards.week) : "…"} hint="Since Monday (UTC)" />
        <StatCard label="Warmup emails this month" value={o ? num(o.cards.month) : "…"} />
        <StatCard
          label="Warmup emails all time"
          value={o ? num(o.cards.allTime) : "…"}
          hint={o?.cards.dataSince ? `Records available since ${shortDay(o.cards.dataSince)}` : "No records yet"}
        />
      </div>

      {noData ? (
        <EmptyState message="No warmup emails sent yet" />
      ) : (
        <>
          <FilterBar>
            <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <SelectTrigger className="h-9 w-44" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === "custom" ? (
              <>
                <Input
                  type="date"
                  className="h-9 w-40"
                  aria-label="From"
                  value={custom.from}
                  max={today}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
                <Input
                  type="date"
                  className="h-9 w-40"
                  aria-label="To"
                  value={custom.to}
                  max={today}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {range.from} → {range.to} (UTC days)
            </span>
          </FilterBar>
          {customInvalid ? <p className="text-sm text-destructive">Choose a start date on or before the end date.</p> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total sent" value={o ? num(o.range.sent) : "…"} hint="Accepted by the sending provider" />
            <StatCard label="Total delivered" value={o ? num(o.range.delivered) : "…"} hint="Confirmed arrivals only" />
            <StatCard label="Total failed" value={o ? num(o.range.failed) : "…"} hint="Failed + bounced" />
            <StatCard label="Delivery rate" value={o ? formatRate(o.range.deliveryRate) : "…"} hint="Delivered ÷ sent" />
          </div>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">
              Warmup emails sent {o?.series.grouping === "week" ? "per week" : "per day"}
            </h3>
            {!o ? (
              <LoadingRows rows={4} />
            ) : o.range.sent === 0 ? (
              <EmptyState message="No warmup emails sent in this range" />
            ) : (
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip
                      formatter={(v: number) => v.toLocaleString()}
                      labelFormatter={(l) => (o.series.grouping === "week" ? `Week of ${l}` : l)}
                    />
                    <Bar dataKey="sent" name="Warmup emails" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Workspaces</h3>
            {workspaces.isLoading ? (
              <LoadingRows />
            ) : workspaces.isError ? (
              <EmptyState message={(workspaces.error as Error).message} />
            ) : !workspaces.data?.total ? (
              <EmptyState message="No warmup emails sent in this range" />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workspace</TableHead>
                      <TableHead className="text-right">Mailboxes</TableHead>
                      <TableHead className="text-right">Warmup emails</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Delivery rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspaces.data.rows.map((w) => (
                      <TableRow key={w.workspaceId}>
                        <TableCell className="font-medium">{w.workspaceName}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(w.mailboxes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(w.sent)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(w.delivered)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(w.failed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(w.deliveryRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pager {...workspaces.data} onPage={setWsPage} />
              </>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Mailboxes</h3>
            <FilterBar>
              <SearchInput value={search} onChange={setSearch} placeholder="Search mailbox or workspace" />
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="h-9 w-36" aria-label="Warmup status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="warming">Warming</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar>
            {mailboxes.isLoading ? (
              <LoadingRows />
            ) : mailboxes.isError ? (
              <EmptyState message={(mailboxes.error as Error).message} />
            ) : !mailboxes.data?.total ? (
              <EmptyState message="No mailboxes match" />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mailbox</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Warmup status</TableHead>
                      <TableHead className="text-right">Daily target</TableHead>
                      <TableHead className="text-right">Warmup emails</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Delivery rate</TableHead>
                      <TableHead>Last warmup activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mailboxes.data.rows.map((m) => (
                      <TableRow key={m.accountId}>
                        <TableCell className="font-medium">{m.email}</TableCell>
                        <TableCell>{m.workspaceName}</TableCell>
                        <TableCell>
                          <Pill tone={stateTone(m.state)}>{m.state.replace("_", " ")}</Pill>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(m.dailyTarget)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(m.sent)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(m.delivered)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(m.failed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(m.deliveryRate)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(m.lastActivityAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pager {...mailboxes.data} onPage={setMbPage} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
