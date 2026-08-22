import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminPageHeader,
  DetailGrid,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingRows,
  Pill,
  SearchInput,
  StatCard,
  fmtDate,
  fmtDay,
  num,
  type Tone,
} from "@/components/app/admin/OutreachUI";
import {
  adminGetWarmup,
  adminListWarmup,
  adminOutreachFilters,
  adminWarmupControl,
} from "@/lib/admin-outreach.functions";
import { WarmupRecipientPool } from "@/components/admin/WarmupRecipientPool";

export const Route = createFileRoute("/_authenticated/admin/warmup")({
  head: () => ({
    meta: [
      { title: "Warmup — MunchReach Admin" },
      {
        name: "description",
        content:
          "Platform warmup monitoring with daily volume targets, ramp stage, deliverability health and start, pause or stop controls per mailbox.",
      },
    ],
  }),
  component: AdminWarmupPage,
});

const STATES = ["warming", "paused", "stopped", "not_started"];

function stateTone(state: string): Tone {
  if (state === "warming") return "good";
  if (state === "paused") return "warn";
  if (state === "stopped") return "bad";
  return "muted";
}

function AdminWarmupPage() {
  const queryClient = useQueryClient();
  const listWarmup = useServerFn(adminListWarmup);
  const getWarmup = useServerFn(adminGetWarmup);
  const control = useServerFn(adminWarmupControl);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [state, setState] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    status: state === "all" ? null : state,
    search: search.trim() || null,
  };

  const warmupQuery = useQuery({
    queryKey: ["admin", "outreach", "warmup", filters],
    queryFn: () => listWarmup({ data: filters }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "outreach", "warmup-detail", openId],
    queryFn: () => getWarmup({ data: { accountId: openId! } }),
    enabled: Boolean(openId),
  });

  const mutation = useMutation({
    mutationFn: (vars: { accountId: string; action: "start" | "pause" | "resume" | "stop" }) =>
      control({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(`Warmup ${vars.action}${vars.action.endsWith("e") ? "d" : "ped"}`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "outreach"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = warmupQuery.data ?? [];
  const warming = rows.filter((r: any) => r.state === "warming").length;
  const paused = rows.filter((r: any) => r.state === "paused").length;
  const sentToday = rows.reduce((sum: number, r: any) => sum + (r.sentToday ?? 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Warmup"
        description="Warmup state for every mailbox on the platform. Volumes, health scores and auto-pauses come from the warmup engine — admin controls only start, pause or stop it."
      />

      <Tabs defaultValue="mailboxes">
        <TabsList>
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="pool">Recipient pool</TabsTrigger>
        </TabsList>
        <TabsContent value="pool" className="pt-4">
          <WarmupRecipientPool />
        </TabsContent>
        <TabsContent value="mailboxes" className="space-y-6 pt-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mailboxes in warmup" value={num(rows.length)} />
        <StatCard label="Warming" value={num(warming)} />
        <StatCard label="Paused" value={num(paused)} />
        <StatCard label="Warmup emails today" value={num(sentToday)} />
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search mailbox" />
        <FilterSelect
          value={workspace}
          onChange={setWorkspace}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: any) => ({
            value: w.id,
            label: w.name,
          }))}
        />
        <FilterSelect
          value={state}
          onChange={setState}
          allLabel="All warmup states"
          width="w-44"
          options={STATES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {warmupQuery.isLoading ? (
          <LoadingRows />
        ) : warmupQuery.isError ? (
          <EmptyState message={(warmupQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No mailboxes have warmup configured." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mailbox</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Ramp stage</TableHead>
                <TableHead className="text-right">Daily target</TableHead>
                <TableHead className="text-right">Sent today</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow
                  key={row.accountId}
                  className="cursor-pointer"
                  onClick={() => setOpenId(row.accountId)}
                >
                  <TableCell className="font-medium">{row.email}</TableCell>
                  <TableCell className="text-muted-foreground">{row.workspaceName}</TableCell>
                  <TableCell>
                    <Pill tone={stateTone(row.state)}>{row.state}</Pill>
                    {row.pauseReason ? (
                      <p className="mt-1 text-xs text-muted-foreground">{row.pauseReason}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.rampStage ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.dailyTarget)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.sentToday === null ? "No data" : num(row.sentToday)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.successfulToday === null ? "—" : num(row.successfulToday)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.failedToday === null ? "—" : num(row.failedToday)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.healthScore ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(row.lastActivityAt)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {row.state === "warming" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutation.mutate({ accountId: row.accountId, action: "pause" })
                          }
                          aria-label="Pause warmup"
                        >
                          <Pause className="size-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutation.mutate({
                              accountId: row.accountId,
                              action: row.state === "paused" ? "resume" : "start",
                            })
                          }
                          aria-label="Start warmup"
                        >
                          <Play className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={row.state === "stopped"}
                        onClick={() =>
                          mutation.mutate({ accountId: row.accountId, action: "stop" })
                        }
                        aria-label="Stop warmup"
                      >
                        <Square className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.account.email ?? "Warmup"}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading ? (
            <LoadingRows />
          ) : detailQuery.isError ? (
            <EmptyState message={(detailQuery.error as Error).message} />
          ) : detailQuery.data ? (
            <WarmupDetail data={detailQuery.data} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WarmupDetail({ data }: { data: any }) {
  const s = data.settings;
  return (
    <div className="mt-4 space-y-5 px-4 pb-8">
      <DetailGrid
        items={[
          { label: "Workspace", value: data.account.workspaceName },
          { label: "Provider", value: data.account.provider },
          { label: "Mailbox status", value: <Pill>{data.account.status}</Pill> },
          { label: "Warmup badge", value: <Pill>{data.account.warmupStatus ?? "none"}</Pill> },
        ]}
      />

      {s ? (
        <DetailGrid
          items={[
            { label: "Enabled", value: s.enabled ? "Yes" : "No" },
            { label: "Mode", value: s.mode ?? "—" },
            { label: "Start volume", value: num(s.startVolume) },
            { label: "Max volume", value: num(s.maxVolume) },
            { label: "Daily increase", value: num(s.dailyIncrease) },
            { label: "Ramp days", value: num(s.rampDays) },
            { label: "Max bounce rate", value: s.maxBounceRate ?? "—" },
            { label: "Min health score", value: s.minHealthScore ?? "—" },
            { label: "Auto pause", value: s.autoPause ? "On" : "Off" },
            { label: "Started", value: fmtDate(s.startedAt) },
          ]}
        />
      ) : (
        <EmptyState message="No warmup settings recorded for this mailbox." />
      )}

      {s?.pausedBySystem ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Paused: {s.pauseReason ?? "no reason recorded"} ({fmtDate(s.pausedAt)})
        </div>
      ) : null}

      {data.health ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Health score" value={data.health.score ?? "—"} />
          <StatCard label="Health status" value={data.health.status ?? "—"} />
          <StatCard label="Computed" value={fmtDate(data.health.computedAt)} />
        </div>
      ) : null}

      <Tabs defaultValue="volume">
        <TabsList>
          <TabsTrigger value="volume">Daily volume</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="pt-3">
          {data.dailyStats.length === 0 ? (
            <EmptyState message="No warmup volume recorded yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Bounced</TableHead>
                  <TableHead className="text-right">Replied</TableHead>
                  <TableHead className="text-right">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dailyStats.map((r: any) => (
                  <TableRow key={r.day}>
                    <TableCell>{fmtDay(r.day)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.target)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.sent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.delivered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.bounced)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.replied)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.healthScore ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="pt-3">
          {data.jobs.length === 0 ? (
            <EmptyState message="No warmup jobs queued or processed." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.jobs.map((j: any) => (
                <li key={j.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{j.subject ?? "(no subject)"}</p>
                    <Pill tone={j.status === "failed" ? "bad" : j.status === "sent" ? "good" : "muted"}>
                      {j.status}
                    </Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {j.toEmail} · scheduled {fmtDate(j.scheduledAt)}
                  </p>
                  {j.error ? <p className="mt-1 text-xs text-destructive">{j.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="events" className="pt-3">
          {data.events.length === 0 ? (
            <EmptyState message="No warmup events recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.events.map((e: any) => (
                <li key={e.id} className="rounded-lg border p-3">
                  <p className="font-medium capitalize">{String(e.type).replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(e.at)}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
