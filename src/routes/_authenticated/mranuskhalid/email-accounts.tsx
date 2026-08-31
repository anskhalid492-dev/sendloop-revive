import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Power, PowerOff, Wifi } from "lucide-react";

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
  adminGetEmailAccount,
  adminListEmailAccounts,
  adminOutreachFilters,
  adminSetEmailAccountEnabled,
  adminTestEmailAccount,
} from "@/lib/admin-outreach.functions";

export const Route = createFileRoute("/_authenticated/admin/email-accounts")({
  head: () => ({
    meta: [
      { title: "Email Accounts — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every connected customer mailbox with connection health, authentication records, warmup progress and sending controls.",
      },
    ],
  }),
  component: AdminEmailAccountsPage,
});

const CONNECTION_STATES = ["connected", "connecting", "error", "disabled", "disconnected"];
const PROVIDERS = ["smtp", "ses", "sendgrid", "mailgun", "postmark", "resend", "zeptomail", "brevo", "emailit"];
const WARMUP_STATES = ["warming", "paused", "not_started"];

function connTone(state: string): Tone {
  if (state === "connected") return "good";
  if (state === "error") return "bad";
  if (state === "disabled") return "muted";
  return "warn";
}

function AdminEmailAccountsPage() {
  const queryClient = useQueryClient();
  const listAccounts = useServerFn(adminListEmailAccounts);
  const getAccount = useServerFn(adminGetEmailAccount);
  const setEnabled = useServerFn(adminSetEmailAccountEnabled);
  const testConnection = useServerFn(adminTestEmailAccount);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [warmup, setWarmup] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    provider: provider === "all" ? null : provider,
    status: status === "all" ? null : status,
    warmup: warmup === "all" ? null : warmup,
    search: search.trim() || null,
  };

  const accountsQuery = useQuery({
    queryKey: ["admin", "outreach", "accounts", filters],
    queryFn: () => listAccounts({ data: filters }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "outreach", "account", openId],
    queryFn: () => getAccount({ data: { accountId: openId! } }),
    enabled: Boolean(openId),
  });

  const enableMutation = useMutation({
    mutationFn: (vars: { accountId: string; enabled: boolean }) => setEnabled({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.enabled ? "Mailbox enabled" : "Mailbox disabled");
      void queryClient.invalidateQueries({ queryKey: ["admin", "outreach"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (accountId: string) => testConnection({ data: { accountId } }),
    onSuccess: (result: any) => {
      if (result.ok) toast.success(result.message || "Connection verified");
      else toast.error(result.message || "Connection test failed");
      void queryClient.invalidateQueries({ queryKey: ["admin", "outreach"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = accountsQuery.data ?? [];
  const connected = rows.filter((r: any) => r.connectionState === "connected").length;
  const failing = rows.filter((r: any) => r.connectionState === "error").length;
  const warming = rows.filter((r: any) => r.warmupStatus === "warming").length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Email Accounts"
        description="Every mailbox connected by a customer. Credentials are never displayed — connection tests run server-side and only report pass or fail."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mailboxes" value={num(rows.length)} />
        <StatCard label="Connected" value={num(connected)} />
        <StatCard label="Failing" value={num(failing)} />
        <StatCard label="Warming up" value={num(warming)} />
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search email address" />
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
          value={provider}
          onChange={setProvider}
          allLabel="All providers"
          width="w-40"
          options={PROVIDERS.map((p) => ({ value: p, label: p }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel="All connection states"
          width="w-52"
          options={CONNECTION_STATES.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          value={warmup}
          onChange={setWarmup}
          allLabel="All warmup states"
          width="w-44"
          options={WARMUP_STATES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {accountsQuery.isLoading ? (
          <LoadingRows />
        ) : accountsQuery.isError ? (
          <EmptyState message={(accountsQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No mailboxes match these filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mailbox</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Sending</TableHead>
                <TableHead>Warmup</TableHead>
                <TableHead className="text-right">Daily limit</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
                  <TableCell>
                    <div className="font-medium">{row.email}</div>
                    <div className="text-xs text-muted-foreground">{row.domain ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.workspaceName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.provider}</TableCell>
                  <TableCell>
                    <Pill tone={connTone(row.connectionState)}>{row.connectionState}</Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={row.sendingStatus === "sending" ? "good" : "warn"}>
                      {row.sendingStatus}
                    </Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={row.warmupStatus === "warming" ? "info" : "muted"}>
                      {row.warmupStatus ?? "none"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.dailyLimit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.emailsSent)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(row.lastActivityAt)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testMutation.isPending}
                        onClick={() => testMutation.mutate(row.id)}
                        aria-label="Test connection"
                      >
                        <Wifi className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          enableMutation.mutate({
                            accountId: row.id,
                            enabled: row.sendingStatus !== "sending",
                          })
                        }
                        aria-label={row.sendingStatus === "sending" ? "Disable" : "Enable"}
                      >
                        {row.sendingStatus === "sending" ? (
                          <PowerOff className="size-3.5" />
                        ) : (
                          <Power className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.account.email ?? "Mailbox"}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading ? (
            <LoadingRows />
          ) : detailQuery.isError ? (
            <EmptyState message={(detailQuery.error as Error).message} />
          ) : detailQuery.data ? (
            <AccountDetail data={detailQuery.data} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AccountDetail({ data }: { data: any }) {
  const a = data.account;
  return (
    <div className="mt-4 space-y-5 px-4 pb-8">
      <DetailGrid
        items={[
          { label: "Workspace", value: a.workspaceName },
          { label: "Provider", value: `${a.provider} (${a.connectionMethod ?? "—"})` },
          { label: "Connection", value: <Pill tone={connTone(a.connectionState)}>{a.connectionState}</Pill> },
          { label: "Sending", value: <Pill>{a.sendingStatus}</Pill> },
          { label: "Daily limit", value: num(a.dailyLimit) },
          { label: "Sent today", value: num(a.sentToday) },
          { label: "Health score", value: a.healthScore ?? "No data" },
          { label: "Last tested", value: fmtDate(a.lastTestedAt) },
          { label: "Last sent", value: fmtDate(a.lastSentAt) },
          { label: "Last reply", value: fmtDate(a.lastReplyAt) },
        ]}
      />

      {a.lastError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {a.lastError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="SPF" value={a.auth.spf ?? "unknown"} />
        <StatCard label="DKIM" value={a.auth.dkim ?? "unknown"} />
        <StatCard label="DMARC" value={a.auth.dmarc ?? "unknown"} />
        <StatCard label="MX" value={a.auth.mx ?? "unknown"} />
      </div>

      <Tabs defaultValue="warmup">
        <TabsList>
          <TabsTrigger value="warmup">Warmup</TabsTrigger>
          <TabsTrigger value="checks">Connection tests</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="domain">Domain</TabsTrigger>
        </TabsList>

        <TabsContent value="warmup" className="space-y-3 pt-3">
          {data.warmup ? (
            <DetailGrid
              items={[
                { label: "Enabled", value: data.warmup.enabled ? "Yes" : "No" },
                { label: "Mode", value: data.warmup.mode ?? "—" },
                { label: "Start volume", value: num(data.warmup.startVolume) },
                { label: "Max volume", value: num(data.warmup.maxVolume) },
                { label: "Ramp days", value: num(data.warmup.rampDays) },
                { label: "Started", value: fmtDate(data.warmup.startedAt) },
              ]}
            />
          ) : (
            <EmptyState message="Warmup has not been configured for this mailbox." />
          )}
          {data.warmupStats.length === 0 ? null : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Bounced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.warmupStats.map((s: any) => (
                  <TableRow key={s.day}>
                    <TableCell>{fmtDay(s.day)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(s.target)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(s.sent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(s.delivered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(s.bounced)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="checks" className="pt-3">
          {data.checks.length === 0 ? (
            <EmptyState message="No connection tests recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.checks.map((c: any) => (
                <li key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium capitalize">{c.kind}</p>
                    <Pill tone={c.ok ? "good" : "bad"}>{c.ok ? "passed" : "failed"}</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(c.at)}
                    {c.durationMs ? ` · ${c.durationMs}ms` : ""}
                  </p>
                  {c.message ? <p className="mt-1 text-xs">{c.message}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          {data.activity.length === 0 ? (
            <EmptyState message="No sending activity recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.activity.map((m: any) => (
                <li key={m.id} className="rounded-lg border p-3">
                  <p className="font-medium">{m.subject ?? "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.email} · {fmtDate(m.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="errors" className="pt-3">
          {data.errors.length === 0 ? (
            <EmptyState message="No delivery errors recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.errors.map((e: any) => (
                <li key={e.id} className="rounded-lg border border-destructive/30 p-3">
                  <p className="font-medium text-destructive">{e.error}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.email} · {fmtDate(e.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="domain" className="pt-3">
          {data.domain ? (
            <DetailGrid
              items={[
                { label: "Domain", value: data.domain.domain },
                { label: "Status", value: <Pill tone={data.domain.status === "verified" ? "good" : "warn"}>{data.domain.status}</Pill> },
                { label: "SPF", value: data.domain.spf ?? "—" },
                { label: "DKIM", value: data.domain.dkim ?? "—" },
                { label: "DMARC", value: data.domain.dmarc ?? "—" },
                { label: "Verified", value: fmtDate(data.domain.verifiedAt) },
              ]}
            />
          ) : (
            <EmptyState message="This mailbox is not linked to a managed sending domain." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
