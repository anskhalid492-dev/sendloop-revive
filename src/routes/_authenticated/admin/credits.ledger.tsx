import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Search } from "lucide-react";

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
import { CREDIT_ENTRY_TYPES, CREDIT_TYPE_LABELS, formatCredits } from "@/lib/billing/features";
import { listCreditLedger } from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/credits/ledger")({
  head: () => ({
    meta: [
      { title: "Credit Ledger · MunchReach Admin" },
      {
        name: "description",
        content: "Immutable history of every MunchReach credit allocation, usage and adjustment.",
      },
    ],
  }),
  component: AdminCreditLedgerPage,
});

function AdminCreditLedgerPage() {
  const load = useServerFn(listCreditLedger);
  const [entryType, setEntryType] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-credit-ledger", entryType, search],
    queryFn: () =>
      load({
        data: {
          ...(entryType === "all" ? {} : { entryType }),
          ...(search ? { search } : {}),
        },
      }),
  });

  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Credit ledger</h1>
          <p className="text-sm text-muted-foreground">
            Append-only record. Entries cannot be edited or deleted — corrections are new entries.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/credits">
            <ArrowLeft className="mr-2 size-4" /> Back to balances
          </Link>
        </Button>
      </header>

      <div className="surface-card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search reason or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={entryType} onValueChange={setEntryType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Entry type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entry types</SelectItem>
            {CREDIT_ENTRY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {CREDIT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading ledger…
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">No ledger entries yet.</div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {["Date", "Workspace", "Type", "Change", "Balance after", "Reason", "Actor"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{row.workspaceName}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {CREDIT_TYPE_LABELS[row.entryType as keyof typeof CREDIT_TYPE_LABELS] ??
                        row.entryType}
                    </Badge>
                  </td>
                  <td
                    className={`px-4 py-3 font-medium ${row.amount < 0 ? "text-destructive" : "text-emerald-500"}`}
                  >
                    {row.amount > 0 ? "+" : ""}
                    {formatCredits(row.amount)}
                  </td>
                  <td className="px-4 py-3">{formatCredits(row.balanceAfter)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.reason ?? row.reference ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.actorEmail ?? row.actor}
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
