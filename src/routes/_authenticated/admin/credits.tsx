import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCredits } from "@/lib/billing/features";
import { adjustWorkspaceCredits, searchAdminCredits } from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/credits")({
  head: () => ({
    meta: [
      { title: "Credit Management · Sendloop Admin" },
      { name: "description", content: "Grant, deduct and audit Sendloop workspace credits." },
    ],
  }),
  component: AdminCreditsPage,
});

type Target = {
  workspaceId: string;
  workspaceName: string;
  balance: number;
};

function AdminCreditsPage() {
  const queryClient = useQueryClient();
  const search = useServerFn(searchAdminCredits);
  const adjust = useServerFn(adjustWorkspaceCredits);

  const [term, setTerm] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-credits", term],
    queryFn: () => search({ data: { ...(term ? { search: term } : {}) } }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      adjust({
        data: {
          workspaceId: target!.workspaceId,
          mode,
          amount: Number(amount || 0),
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Credit balance updated");
      setTarget(null);
      setAmount("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-credits"] });
      queryClient.invalidateQueries({ queryKey: ["admin-credit-ledger"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Credit management</h1>
          <p className="text-sm text-muted-foreground">
            Balances are updated atomically and every change writes an immutable ledger entry.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/credits/ledger">Open credit ledger</Link>
        </Button>
      </header>

      <div className="surface-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search workspaces by name or slug…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading balances…
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">No workspaces found.</div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {["Workspace", "Plan", "Balance", "Allocated", "Consumed", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.workspaceId} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.workspaceName}</div>
                    <div className="text-xs text-muted-foreground">{row.ownerEmail ?? row.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{row.planName}</div>
                    <div className="text-muted-foreground">
                      {formatCredits(row.planCredits)} / mo · {row.subscriptionStatus}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{formatCredits(row.balance)}</td>
                  <td className="px-4 py-3">{formatCredits(row.allocatedTotal)}</td>
                  <td className="px-4 py-3">{formatCredits(row.consumedTotal)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setTarget({
                          workspaceId: row.workspaceId,
                          workspaceName: row.workspaceName,
                          balance: row.balance,
                        })
                      }
                    >
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust credits</DialogTitle>
            <DialogDescription>
              {target?.workspaceName} · current balance {formatCredits(target?.balance ?? 0)}.
              Adjustments are logged with your admin account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add credits</SelectItem>
                  <SelectItem value="remove">Remove credits</SelectItem>
                  <SelectItem value="set">Set balance to</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amount</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reason (required)</Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Support goodwill credit for delivery incident #123"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending || reason.trim().length < 3}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Apply adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
