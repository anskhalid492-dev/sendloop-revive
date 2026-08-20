import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/billing/model";
import {
  adminSubscriptionAction,
  getAdminSubscription,
  listAdminSubscriptions,
} from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions · MunchReach Admin" },
      { name: "description", content: "Monitor and manage every MunchReach customer subscription." },
    ],
  }),
  component: AdminSubscriptionsPage,
});

type Row = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  customerEmail: string | null;
  planName: string;
  status: string;
  interval: string | null;
  amountCents: number;
  provider: string | null;
  environment: string | null;
  externalSubscriptionId: string | null;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-500",
  trialing: "bg-sky-500/15 text-sky-500",
  past_due: "bg-amber-500/15 text-amber-500",
  payment_failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
};

function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAdminSubscriptions);
  const detail = useServerFn(getAdminSubscription);
  const act = useServerFn(adminSubscriptionAction);

  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions", status, provider, search],
    queryFn: () =>
      list({
        data: {
          ...(status === "all" ? {} : { status }),
          ...(provider === "all" ? {} : { provider }),
          ...(search ? { search } : {}),
        },
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin-subscription", openId],
    queryFn: () => detail({ data: { subscriptionId: openId! } }),
    enabled: Boolean(openId),
  });

  const action = useMutation({
    mutationFn: (input: { workspaceId: string; action: "cancel" | "cancel_now" | "resume" }) =>
      act({ data: input }),
    onSuccess: () => {
      toast.success("Request sent to the payment provider");
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-subscription"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Every subscription record synced from the payment providers. Lifecycle actions are executed
          at the provider and reconciled through webhooks.
        </p>
      </header>

      <div className="surface-card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search workspace, email, provider ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "trialing", "active", "past_due", "payment_failed", "paused", "cancelled", "expired"].map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : s.replace("_", " ")}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            {["all", "stripe", "paddle", "lemonsqueezy"].map((p) => (
              <SelectItem key={p} value={p}>
                {p === "all" ? "All providers" : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading subscriptions…
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">
          No subscriptions match these filters.
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {["Customer", "Plan", "Status", "Amount", "Provider", "Renews", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.workspaceName}</div>
                    <div className="text-xs text-muted-foreground">{row.customerEmail ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.planName}</div>
                    <div className="text-xs text-muted-foreground">{row.interval ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${STATUS_TONE[row.status] ?? "bg-muted"}`}
                    >
                      {row.status}
                    </span>
                    {row.cancelAtPeriodEnd ? (
                      <div className="mt-1 text-xs text-muted-foreground">Cancels at period end</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{formatMoney(row.amountCents)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{row.provider ?? "—"}</Badge>
                    <div className="text-xs text-muted-foreground">{row.environment}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.currentPeriodEnd
                      ? new Date(row.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenId(row.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Subscription detail</SheetTitle>
            <SheetDescription>
              Provider-synced record, payment history and billing audit trail.
            </SheetDescription>
          </SheetHeader>

          {detailQuery.isLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : detailQuery.data ? (
            <div className="mt-6 space-y-6 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Workspace", detailQuery.data.subscription.workspaceName],
                  ["Plan", detailQuery.data.subscription.planName],
                  ["Status", detailQuery.data.subscription.status],
                  ["Amount", formatMoney(detailQuery.data.subscription.amountCents)],
                  ["Provider", detailQuery.data.subscription.provider ?? "—"],
                  ["Environment", detailQuery.data.subscription.environment ?? "—"],
                  ["Provider ID", detailQuery.data.subscription.externalSubscriptionId ?? "—"],
                  [
                    "Renews",
                    detailQuery.data.subscription.currentPeriodEnd
                      ? new Date(detailQuery.data.subscription.currentPeriodEnd).toLocaleString()
                      : "—",
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border/50 p-3">
                    <div className="text-xs uppercase text-muted-foreground">{label}</div>
                    <div className="mt-1 break-all">{String(value)}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      workspaceId: detailQuery.data!.subscription.workspaceId,
                      action: "cancel",
                    })
                  }
                >
                  Cancel at period end
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      workspaceId: detailQuery.data!.subscription.workspaceId,
                      action: "cancel_now",
                    })
                  }
                >
                  Cancel immediately
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      workspaceId: detailQuery.data!.subscription.workspaceId,
                      action: "resume",
                    })
                  }
                >
                  Resume
                </Button>
              </div>

              <Section title="Payments">
                {(detailQuery.data.transactions ?? []).length === 0 ? (
                  <Empty>No payments recorded.</Empty>
                ) : (
                  (detailQuery.data.transactions as any[]).map((t) => (
                    <Row3
                      key={t.id}
                      left={`${formatMoney(t.amount_cents ?? 0)} · ${t.status}`}
                      right={t.occurred_at ? new Date(t.occurred_at).toLocaleDateString() : "—"}
                    />
                  ))
                )}
              </Section>

              <Section title="Invoices">
                {(detailQuery.data.invoices ?? []).length === 0 ? (
                  <Empty>No invoices yet.</Empty>
                ) : (
                  (detailQuery.data.invoices as any[]).map((i) => (
                    <Row3
                      key={i.id}
                      left={`${i.number ?? i.id} · ${formatMoney(i.amount_cents ?? i.total_cents ?? 0)}`}
                      right={i.issued_at ? new Date(i.issued_at).toLocaleDateString() : "—"}
                    />
                  ))
                )}
              </Section>

              <Section title="Billing history">
                {(detailQuery.data.history ?? []).length === 0 ? (
                  <Empty>No billing events recorded.</Empty>
                ) : (
                  (detailQuery.data.history as any[]).map((h) => (
                    <Row3
                      key={h.id}
                      left={h.action ?? h.event ?? "event"}
                      right={h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                    />
                  ))
                )}
              </Section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row3({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-xs">
      <span>{left}</span>
      <span className="text-muted-foreground">{right}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
