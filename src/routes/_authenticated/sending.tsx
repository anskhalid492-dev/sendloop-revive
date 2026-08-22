import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Globe,
  LineChart,
  PlugZap,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { AuthBadgeRow } from "@/components/sending/AuthBadges";
import { AccountDetailSheet } from "@/components/sending/AccountDetailSheet";
import { AddDomainDialog } from "@/components/sending/AddDomainDialog";
import { ConnectMailboxDialog } from "@/components/sending/ConnectMailboxDialog";
import { DnsSetupDialog } from "@/components/sending/DnsSetupDialog";
import { DomainsPanel } from "@/components/sending/DomainsPanel";
import { DomainAlerts } from "@/components/sending/DomainAlerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  bulkSetSendingAccountsPaused,
  listEmailAccounts,
} from "@/lib/sending.functions";
import { listSendingDomains } from "@/lib/domains.functions";
import {
  bulkTestMailboxes,
  removeMailbox,
  setMailboxWarmup,
  testMailboxConnection,
} from "@/lib/mailboxes.functions";
import { bulkSetWarmup } from "@/lib/warmup.functions";
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_STYLE,
  DEFAULT_PAGE_SIZE,
  HEALTH_STYLE,
  defaultFilters,
  formatDateTime,
  healthBand,
  rate,
  warmupProgress,
  type EmailAccountFilters,
  type EmailAccountRow,
} from "@/lib/sending-model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sending")({
  head: () => ({
    meta: [
      { title: "Email Accounts — MunchReach" },
      {
        name: "description",
        content:
          "Manage your MunchReach-managed sending accounts, warmup progress, deliverability and email health.",
      },
      { property: "og:title", content: "Email Accounts — MunchReach" },
      {
        property: "og:description",
        content: "Managed sending accounts, warmup and email health for your workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmailAccountsPage,
});

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          tone === "danger" && value > 0 && "text-destructive",
          tone === "warning" && value > 0 && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EmailAccountsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listEmailAccounts);
  const bulkPauseFn = useServerFn(bulkSetSendingAccountsPaused);
  const removeFn = useServerFn(removeMailbox);
  const testFn = useServerFn(testMailboxConnection);
  const warmupFn = useServerFn(setMailboxWarmup);
  const fetchDomains = useServerFn(listSendingDomains);
  const bulkTestFn = useServerFn(bulkTestMailboxes);
  const bulkWarmupFn = useServerFn(bulkSetWarmup);

  const [filters, setFilters] = useState<EmailAccountFilters>(defaultFilters);
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [dnsDomainId, setDnsDomainId] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectDomainId, setConnectDomainId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "failed">(
    "connecting",
  );
  const [realtimeAttempt, setRealtimeAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) =>
        prev.search === searchInput ? prev : { ...prev, search: searchInput, page: 1 },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const accountsQuery = useQuery({
    queryKey: ["email-accounts", filters],
    queryFn: () => fetchAccounts({ data: filters }),
  });

  const domainsQuery = useQuery({
    queryKey: ["sending-domains"],
    queryFn: () => fetchDomains(),
  });
  const domains = domainsQuery.data?.domains ?? [];

  // Live updates: refresh when MunchReach assigns, pauses or updates an account.
  // A failed/closed subscription is surfaced in the UI with an in-place retry
  // (no page reload) instead of silently going stale.
  useEffect(() => {
    const channel = supabase
      .channel(`sending-accounts-live-${realtimeAttempt}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sending_accounts" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
          void queryClient.invalidateQueries({ queryKey: ["email-account-detail"] });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
          setRealtimeStatus("failed");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, realtimeAttempt]);

  const retryRealtime = () => {
    setRealtimeStatus("connecting");
    setRealtimeAttempt((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  };

  const accounts: EmailAccountRow[] = accountsQuery.data?.accounts ?? [];
  const summary = accountsQuery.data?.summary;
  const total = accountsQuery.data?.total ?? 0;
  const facets = accountsQuery.data?.facets;

  const pageStart = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const pageEnd = Math.min(total, filters.page * filters.pageSize);
  const allSelected = accounts.length > 0 && accounts.every((a) => selected.includes(a.id));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  };

  const bulkMutation = useMutation({
    mutationFn: (vars: { ids: string[]; paused: boolean }) => bulkPauseFn({ data: vars }),
    onSuccess: async (_result, vars) => {
      toast.success(vars.paused ? "Accounts paused" : "Accounts resumed");
      setSelected([]);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (ids: string[]) => removeFn({ data: { ids } }),
    onSuccess: async () => {
      toast.success("Mailboxes disconnected.");
      setSelected([]);
      setConfirmRemove(false);
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: async (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const warmupMutation = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) => warmupFn({ data: vars }),
    onSuccess: async (result) => {
      toast.success(result.enabled ? "Warmup started" : "Warmup stopped");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkTestMutation = useMutation({
    mutationFn: (ids: string[]) => bulkTestFn({ data: { ids } }),
    onSuccess: async (result) => {
      const failures = result.results.filter((r) => !r.ok);
      if (failures.length === 0) toast.success(`All ${result.passed} connections passed`);
      else
        toast.error(
          `${result.failed} of ${result.results.length} failed — ${failures[0]?.email}: ${failures[0]?.message}`,
        );
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkWarmupMutation = useMutation({
    mutationFn: (vars: { ids: string[]; enabled: boolean }) => bulkWarmupFn({ data: vars }),
    onSuccess: async (_result, vars) => {
      toast.success(vars.enabled ? "Warmup started for selected mailboxes" : "Warmup stopped");
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["warmup-accounts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeFilterCount = useMemo(
    () =>
      [filters.status, filters.warmup, filters.health, filters.domain, filters.campaignId].filter(
        (value) => value !== "all",
      ).length,
    [filters],
  );

  const isEmptyWorkspace =
    !accountsQuery.isLoading && total === 0 && filters.search === "" && activeFilterCount === 0;

  return (
    <AppShell
      title="Email Accounts"
      description="Connect your own domains and mailboxes, then manage warmup and email health."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAddDomainOpen(true)}>
            <Globe className="size-4" /> Add domain
          </Button>
          <Button
            onClick={() => {
              setConnectDomainId(null);
              setConnectOpen(true);
            }}
          >
            <Plus className="size-4" /> Connect email account
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {realtimeStatus === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <span className="text-destructive">
              Live updates disconnected — account status, warmup and usage may be out of date.
            </span>
            <Button size="sm" variant="outline" onClick={retryRealtime}>
              Retry live updates
            </Button>
          </div>
        )}

        <DomainAlerts />

        <DomainsPanel
          domains={domains}
          isLoading={domainsQuery.isLoading}
          onAddDomain={() => setAddDomainOpen(true)}
          onOpenDns={(id) => setDnsDomainId(id)}
          onConnectMailbox={(id) => {
            setConnectDomainId(id);
            setConnectOpen(true);
          }}
        />

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <SummaryCard label="Total Accounts" value={summary?.totalAccounts ?? 0} />
          <SummaryCard label="Total Domains" value={summary?.totalDomains ?? 0} />
          <SummaryCard label="Warming" value={summary?.warming ?? 0} tone="warning" />
          <SummaryCard label="Errors" value={summary?.errors ?? 0} tone="danger" />
          <SummaryCard label="Alerts" value={summary?.alerts ?? 0} tone="warning" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-56 flex-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Daily sending capacity</span>
              <span className="tabular-nums">
                {summary?.sentToday ?? 0} / {summary?.dailyCapacity ?? 0} today
              </span>
            </div>
            <Progress
              className="mt-1.5 h-1.5"
              value={
                summary && summary.dailyCapacity > 0
                  ? Math.min(100, (summary.sentToday / summary.dailyCapacity) * 100)
                  : 0
              }
            />
          </div>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link to="/analytics">
              See Detailed Analytics <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {isEmptyWorkspace ? (
          <div className="surface-card space-y-3 p-10 text-center">
            <h2 className="text-lg font-semibold">No mailboxes connected yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Add your domain, publish the DNS records, verify, then connect your own email account.
              You keep ownership of every mailbox.
            </p>
            <Button
              onClick={() => {
                setConnectDomainId(null);
                setConnectOpen(true);
              }}
            >
              <Plus className="size-4" /> Connect email account
            </Button>
          </div>
        ) : (
          <div className="surface-card overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-3">
              <label className="flex items-center gap-2 pl-1 text-sm font-medium">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? accounts.map((a) => a.id) : [])
                  }
                  aria-label="Select all accounts on this page"
                />
                Select All
              </label>
              <span className="text-sm font-semibold">Your Accounts ({total})</span>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search by account address, first name or campaign name"
                    className="h-9 w-72 pl-8"
                  />
                </div>

                <Select
                  value={filters.warmup}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      warmup: value as EmailAccountFilters["warmup"],
                      page: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Warmup Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Warmup: All</SelectItem>
                    <SelectItem value="warming">Warming</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="attention">Needs attention</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: value as EmailAccountFilters["status"],
                      page: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Account Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status: All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="warming">Warming</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.health}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      health: value as EmailAccountFilters["health"],
                      page: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 w-32">
                    <SelectValue placeholder="Health" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Health: All</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.domain}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, domain: value, page: 1 }))
                  }
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Domain: All</SelectItem>
                    {(facets?.domains ?? []).map((domain) => (
                      <SelectItem key={domain} value={domain}>
                        {domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.campaignId}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, campaignId: value, page: 1 }))
                  }
                >
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue placeholder="Campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Campaign: All</SelectItem>
                    {(facets?.campaigns ?? []).map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={`${filters.sort}:${filters.dir}`}
                  onValueChange={(value) => {
                    const [sort, dir] = value.split(":");
                    setFilters((prev) => ({
                      ...prev,
                      sort: sort as EmailAccountFilters["sort"],
                      dir: dir as EmailAccountFilters["dir"],
                      page: 1,
                    }));
                  }}
                >
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at:asc">Sort: Created (oldest)</SelectItem>
                    <SelectItem value="created_at:desc">Sort: Created (newest)</SelectItem>
                    <SelectItem value="health:desc">Health (high → low)</SelectItem>
                    <SelectItem value="health:asc">Health (low → high)</SelectItem>
                    <SelectItem value="sent_today:desc">Emails sent today</SelectItem>
                    <SelectItem value="daily_limit:desc">Daily limit</SelectItem>
                    <SelectItem value="warmup:asc">Warmup progress</SelectItem>
                    <SelectItem value="last_activity:desc">Last activity</SelectItem>
                    <SelectItem value="email:asc">Email A → Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bulk actions */}
            {selected.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-primary/5 px-3 py-2 text-sm">
                <span className="font-medium">{selected.length} selected</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkMutation.isPending}
                  onClick={() => bulkMutation.mutate({ ids: selected, paused: true })}
                >
                  <Pause className="size-4" /> Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkMutation.isPending}
                  onClick={() => bulkMutation.mutate({ ids: selected, paused: false })}
                >
                  <Play className="size-4" /> Resume
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkTestMutation.isPending}
                  onClick={() => bulkTestMutation.mutate(selected)}
                >
                  <PlugZap className="size-4" />
                  {bulkTestMutation.isPending ? "Testing…" : "Test connections"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkWarmupMutation.isPending}
                  onClick={() => bulkWarmupMutation.mutate({ ids: selected, enabled: true })}
                >
                  <Flame className="size-4" /> Start warmup
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkWarmupMutation.isPending}
                  onClick={() => bulkWarmupMutation.mutate({ ids: selected, enabled: false })}
                >
                  <Flame className="size-4" /> Stop warmup
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="size-4" /> Disconnect
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  Clear
                </Button>
              </div>
            ) : null}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-3 py-2.5" />
                    <th className="px-3 py-2.5 font-medium">Account</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sent today</th>
                    <th className="px-3 py-2.5 font-medium">Warmup</th>
                    <th className="px-3 py-2.5 text-right font-medium">Warmup sent</th>
                    <th className="px-3 py-2.5 text-right font-medium">Health</th>
                    <th className="px-3 py-2.5 text-right font-medium">Reply rate</th>
                    <th className="px-3 py-2.5 text-right font-medium">Campaigns</th>
                    <th className="px-3 py-2.5 font-medium">Authentication</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index} className="border-b border-border/50">
                        <td colSpan={11} className="px-3 py-3">
                          <div className="h-5 animate-pulse rounded bg-muted" />
                        </td>
                      </tr>
                    ))
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">
                        No accounts match your filters.
                      </td>
                    </tr>
                  ) : (
                    accounts.map((account) => {
                      const warmup = warmupProgress(account);
                      const paused =
                        account.accountStatus === "paused" ||
                        account.accountStatus === "inactive";
                      return (
                        <tr
                          key={account.id}
                          className="border-b border-border/50 transition-colors hover:bg-muted/40"
                        >
                          <td className="px-3 py-2.5 align-middle">
                            <Checkbox
                              checked={selected.includes(account.id)}
                              onCheckedChange={(checked) =>
                                setSelected((prev) =>
                                  checked
                                    ? [...prev, account.id]
                                    : prev.filter((id) => id !== account.id),
                                )
                              }
                              aria-label={`Select ${account.from_email}`}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => setDetailId(account.id)}
                              className="text-left"
                            >
                              <span className="font-medium hover:text-primary">
                                {account.from_email}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {account.from_name || account.label} · {account.domain}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-medium",
                                ACCOUNT_STATUS_STYLE[account.accountStatus],
                              )}
                            >
                              {ACCOUNT_STATUS_LABEL[account.accountStatus]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {account.sent_today} / {account.daily_limit}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => setDetailId(account.id)}
                              className="text-left"
                            >
                              <span className="text-xs font-medium">{warmup.label}</span>
                              <span className="block text-xs text-muted-foreground tabular-nums">
                                {warmup.days
                                  ? `${warmup.days} / ${warmup.targetDays} days`
                                  : `${account.warmup_daily_target}/day target`}
                              </span>
                            </button>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-right font-semibold tabular-nums",
                              HEALTH_STYLE[healthBand(account.health_score)],
                            )}
                          >
                            {account.health_score}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {account.stats ? rate(account.stats.replies, account.stats.sent) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {account.campaignCount}
                          </td>
                          <td className="px-3 py-2.5">
                            <AuthBadgeRow
                              spf={account.spf_status}
                              dkim={account.dkim_status}
                              dmarc={account.dmarc_status}
                              mx={account.mx_status}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost">
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailId(account.id)}>
                                  View account
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    bulkMutation.mutate({ ids: [account.id], paused: !paused })
                                  }
                                >
                                  {paused ? (
                                    <>
                                      <Play className="size-4" /> Resume
                                    </>
                                  ) : (
                                    <>
                                      <Pause className="size-4" /> Pause
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => testMutation.mutate(account.id)}
                                >
                                  <PlugZap className="size-4" /> Test connection
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    warmupMutation.mutate({
                                      id: account.id,
                                      enabled: account.warmup_status !== "warming",
                                    })
                                  }
                                >
                                  <Flame className="size-4" />
                                  {account.warmup_status === "warming"
                                    ? "Stop warmup"
                                    : "Start warmup"}
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/warmup">
                                    <Flame className="size-4" /> View warmup
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelected([account.id]);
                                    setConfirmRemove(true);
                                  }}
                                >
                                  <Trash2 className="size-4" /> Disconnect mailbox
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/analytics">
                                    <LineChart className="size-4" /> View analytics
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to="/campaigns">
                                    <Send className="size-4" /> View campaigns
                                  </Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="sr-only">
                              Last activity {formatDateTime(account.last_sent_at)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 p-3 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {pageStart}–{pageEnd} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  value={String(filters.pageSize)}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, pageSize: Number(value), page: 1 }))
                  }
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 per page</SelectItem>
                    <SelectItem value={String(DEFAULT_PAGE_SIZE)}>50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageEnd >= total}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          You own your domains and mailboxes. MunchReach manages the sending infrastructure, warmup and deliverability
          monitoring for you.
        </p>
      </div>

      <AccountDetailSheet
        accountId={detailId}
        fallback={accounts.find((a) => a.id === detailId)}
        onOpenChange={(open) => setDetailId(open ? detailId : null)}
      />

      <AddDomainDialog
        open={addDomainOpen}
        onOpenChange={setAddDomainOpen}
        onAdded={(id) => setDnsDomainId(id)}
      />

      <DnsSetupDialog
        domainId={dnsDomainId}
        onOpenChange={(open) => setDnsDomainId(open ? dnsDomainId : null)}
      />

      <ConnectMailboxDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        domains={domains}
        defaultDomainId={connectDomainId}
      />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {selected.length} mailbox(es)?</AlertDialogTitle>
            <AlertDialogDescription>
              MunchReach stops sending from these mailboxes and removes their connection. Your mailbox itself is untouched and campaign history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMutation.mutate(selected)}
              disabled={removeMutation.isPending}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
