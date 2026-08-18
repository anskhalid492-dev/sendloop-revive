import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Gauge, Inbox, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  accountHealthLabel,
  listMySendingAccounts,
  setSendingAccountEnabled,
  type WorkspaceSendingAccount,
} from "@/lib/sending.functions";

export const Route = createFileRoute("/_authenticated/sending")({
  head: () => ({
    meta: [
      { title: "Sending Accounts — Sendloop" },
      {
        name: "description",
        content:
          "See the mailboxes Sendloop operates for your workspace: health, warmup status, daily capacity and usage.",
      },
      { property: "og:title", content: "Sending Accounts — Sendloop" },
      {
        property: "og:description",
        content: "Managed sending infrastructure assigned to your workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SendingAccountsPage,
});

const HEALTH_STYLES: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  warming: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  attention: "bg-destructive/10 text-destructive border-destructive/20",
  paused: "bg-muted text-muted-foreground border-border",
};

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SendingAccountsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listMySendingAccounts);
  const toggleFn = useServerFn(setSendingAccountEnabled);

  const accountsQuery = useQuery({
    queryKey: ["sending-accounts"],
    queryFn: () => fetchAccounts(),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) => toggleFn({ data: vars }),
    onSuccess: async (result) => {
      toast.success(result.enabled ? "Mailbox enabled" : "Mailbox paused for your campaigns");
      await queryClient.invalidateQueries({ queryKey: ["sending-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts: WorkspaceSendingAccount[] = accountsQuery.data?.accounts ?? [];
  const summary = accountsQuery.data?.summary;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sending accounts</h1>
        <p className="text-sm text-muted-foreground">
          Sendloop runs and maintains the sending infrastructure for your workspace. These are the
          mailboxes currently assigned to you — no provider setup or API keys required.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Inbox} label="Accounts" value={summary?.total ?? 0} hint="Assigned to this workspace" />
        <StatCard icon={ShieldCheck} label="Healthy" value={summary?.healthy ?? 0} />
        <StatCard icon={Activity} label="Warming" value={summary?.warming ?? 0} />
        <StatCard
          icon={TriangleAlert}
          label="Needs attention"
          value={summary?.attention ?? 0}
        />
      </div>

      <div className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Daily capacity</p>
            <p className="text-xs text-muted-foreground">
              {summary?.sentToday ?? 0} of {summary?.dailyCapacity ?? 0} emails sent today
            </p>
          </div>
          <Gauge className="size-4 text-primary" />
        </div>
        <Progress
          className="mt-3"
          value={
            summary && summary.dailyCapacity > 0
              ? Math.min(100, (summary.sentToday / summary.dailyCapacity) * 100)
              : 0
          }
        />
      </div>

      <div className="surface-card overflow-hidden">
        {accountsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading your sending accounts…</p>
        ) : accounts.length === 0 ? (
          <div className="space-y-2 p-8 text-center">
            <p className="font-medium">No sending accounts assigned yet</p>
            <p className="text-sm text-muted-foreground">
              Sendloop provisions mailboxes for your workspace during onboarding. They appear here
              as soon as they are ready — usually within one business day.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sending account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Daily capacity</TableHead>
                <TableHead className="text-right">Sent today</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead className="text-right">Use in campaigns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                const health = accountHealthLabel(account);
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <span className="font-medium">{account.from_email}</span>
                      <span className="block text-xs text-muted-foreground">
                        {account.from_name} · {account.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${HEALTH_STYLES[health]}`}>
                        {health}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{account.daily_limit}</TableCell>
                    <TableCell className="text-right tabular-nums">{account.sent_today}</TableCell>
                    <TableCell className="text-right tabular-nums">{account.health_score}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={account.customer_enabled && !account.paused}
                        disabled={account.paused || toggleMutation.isPending}
                        onCheckedChange={(enabled) =>
                          toggleMutation.mutate({ id: account.id, enabled })
                        }
                        aria-label={`Toggle ${account.from_email}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Sendloop handles your email sending infrastructure — provider routing, warmup and
        deliverability monitoring all happen behind the scenes.
      </p>
    </div>
  );
}
