import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/billing/model";
import { listAdminPayments } from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({
    meta: [
      { title: "Billing & Payments · Sendloop Admin" },
      { name: "description", content: "Every Sendloop payment, refund and invoice in one log." },
    ],
  }),
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  const load = useServerFn(listAdminPayments);
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", status, provider, search, from, to],
    queryFn: () =>
      load({
        data: {
          ...(status === "all" ? {} : { status }),
          ...(provider === "all" ? {} : { provider }),
          ...(search ? { search } : {}),
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: new Date(to).toISOString() } : {}),
        },
      }),
  });

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Billing &amp; payments</h1>
          <p className="text-sm text-muted-foreground">
            Transactions recorded from provider webhooks. Nothing here is simulated.
          </p>
        </div>
        {data?.environment ? (
          <Badge variant={data.environment === "live" ? "default" : "secondary"}>
            {data.environment} mode
          </Badge>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="Revenue" value={formatMoney(totals?.revenueCents ?? 0)} />
        <Stat label="Successful" value={String(totals?.successful ?? 0)} />
        <Stat label="Failed" value={String(totals?.failed ?? 0)} />
        <Stat label="Refunds" value={`${totals?.refunds ?? 0} · ${formatMoney(totals?.refundedCents ?? 0)}`} />
        <Stat label="Active subs" value={String(totals?.activeSubscriptions ?? 0)} />
      </div>

      <div className="surface-card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search workspace, email, transaction ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "succeeded", "paid", "pending", "failed", "refunded"].map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-[160px]">
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
        <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading payments…
        </div>
      ) : (data?.rows ?? []).length === 0 ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">
          No transactions match these filters.
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {["Date", "Customer", "Amount", "Status", "Provider", "Invoice"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row: any) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.workspaceName}</div>
                    <div className="text-xs text-muted-foreground">{row.customerEmail ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={row.refunded ? "text-destructive" : ""}>
                      {row.refunded ? "-" : ""}
                      {formatMoney(row.amountCents)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.status === "failed" ? "destructive" : "outline"}>
                      {row.refunded ? "refunded" : row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{row.provider ?? "—"}</div>
                    <div className="text-muted-foreground">{row.externalTransactionId ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.invoiceUrl ? (
                      <a
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        href={row.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.invoiceNumber ?? "Invoice"} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      (row.invoiceNumber ?? "—")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
