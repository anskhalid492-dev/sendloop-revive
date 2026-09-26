/** Staff AppSumo code console. Every server call re-checks the admin role. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  exportAppSumoCodes,
  generateAppSumoCodes,
  getAppSumoAdmin,
  revokeAppSumoCode,
} from "@/lib/appsumo.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/appsumo")({
  head: () => ({
    meta: [
      { title: "AppSumo Codes — MunchReach Admin" },
      { name: "description", content: "Generate, export and revoke AppSumo Lifetime codes." },
    ],
  }),
  component: AppSumoAdminPage,
});

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

function AppSumoAdminPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "available" | "redeemed" | "revoked">("all");
  const [batch, setBatch] = useState<"all" | "production" | "test">("all");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(10);
  const [genBatch, setGenBatch] = useState<"production" | "test">("test");
  const qc = useQueryClient();
  const load = useServerFn(getAppSumoAdmin);
  const gen = useServerFn(generateAppSumoCodes);
  const revoke = useServerFn(revokeAppSumoCode);
  const exp = useServerFn(exportAppSumoCodes);

  const q = useQuery({
    queryKey: ["admin-appsumo", search, status, batch, page],
    queryFn: () => load({ data: { search, status, batch, page } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-appsumo"] });

  const genM = useMutation({
    mutationFn: () => gen({ data: { count, batch: genBatch } }),
    onSuccess: (r) => { toast.success(`Generated ${r.made} ${genBatch} codes`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeM = useMutation({
    mutationFn: (codeId: string) => revoke({ data: { codeId } }),
    onSuccess: () => { toast.success("Code revoked"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const expM = useMutation({
    mutationFn: (scope: "available" | "all") => exp({ data: { scope } }),
    onSuccess: (r, scope) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `appsumo-codes-${scope}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Exported ${r.rows} production codes`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = q.data?.stats;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AppSumo Codes</h1>
        <p className="text-sm text-muted-foreground">
          Each code grants Lifetime access once. Exports contain production codes only, one per row, no header.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(["total", "available", "redeemed", "revoked"] as const).map((k) => (
          <div key={k} className="surface-card p-4">
            <div className="text-xs capitalize text-muted-foreground">{k === "total" ? "Total codes" : k}</div>
            <div className="text-2xl font-semibold">{stats ? stats[k] : "—"}</div>
          </div>
        ))}
      </div>

      <div className="surface-card flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">How many</div>
          <Input type="number" min={1} max={5000} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-28" />
        </div>
        <Select value={genBatch} onValueChange={(v) => setGenBatch(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test codes</SelectItem>
            <SelectItem value="production">Production codes</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={genM.isPending} onClick={() => {
          if (confirm(`Generate ${count} ${genBatch} codes?`)) genM.mutate();
        }}>
          {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generate codes
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" disabled={expM.isPending} onClick={() => expM.mutate("available")}>Export available codes</Button>
          <Button variant="outline" disabled={expM.isPending} onClick={() => expM.mutate("all")}>Export all codes</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search code or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="redeemed">Redeemed</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={batch} onValueChange={(v) => { setBatch(v as any); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All batches</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Redeemed email</TableHead>
              <TableHead>Redeemed date</TableHead>
              <TableHead>Created date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>
            ) : (q.data?.rows ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">
                  {r.code} {r.batch === "test" ? <Badge variant="outline" className="ml-1">test</Badge> : null}
                </TableCell>
                <TableCell><Badge variant={r.status === "available" ? "secondary" : "outline"}>{r.status}</Badge></TableCell>
                <TableCell>{r.redeemed_email ?? "—"}</TableCell>
                <TableCell>{fmt(r.redeemed_at)}</TableCell>
                <TableCell>{fmt(r.created_at)}</TableCell>
                <TableCell className="text-right">
                  {r.status !== "revoked" ? (
                    <Button size="sm" variant="ghost" disabled={revokeM.isPending} onClick={() => {
                      const msg = r.status === "redeemed"
                        ? `Revoke ${r.code}? This ends Lifetime access for ${r.redeemed_email ?? "the redeeming workspace"}. History is kept.`
                        : `Revoke unused code ${r.code}?`;
                      if (confirm(msg)) revokeM.mutate(r.id);
                    }}>
                      {r.status === "redeemed" ? "Revoke access" : "Revoke"}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page + 1} · {q.data?.filtered ?? 0} codes</span>
        <Button size="sm" variant="outline" disabled={!q.data || (page + 1) * q.data.pageSize >= q.data.filtered} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
