import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assignSendingAccount,
  listAllSendingAccounts,
  listAllWorkspaces,
} from "@/lib/admin.functions";
import { providerLabel } from "@/lib/providers/registry";

export const Route = createFileRoute("/_authenticated/admin/workspaces")({
  head: () => ({
    meta: [
      { title: "Workspace Assignment — Sendloop Admin" },
      {
        name: "description",
        content: "Assign pooled mailboxes to customer workspaces and review allocation.",
      },
    ],
  }),
  component: AdminWorkspacesPage,
});

function AdminWorkspacesPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listAllSendingAccounts);
  const fetchWorkspaces = useServerFn(listAllWorkspaces);
  const assign = useServerFn(assignSendingAccount);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["admin", "pool"],
    queryFn: () => fetchAccounts(),
  });
  const { data: workspaces = [] } = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => fetchWorkspaces(),
  });

  const assignMutation = useMutation({
    mutationFn: (vars: { id: string; workspaceId: string | null }) => assign({ data: vars }),
    onSuccess: () => {
      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Workspace assignment</h2>
        <p className="text-sm text-muted-foreground">
          Allocate pooled mailboxes to customers. Customers only ever see the mailboxes assigned to
          their workspace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {workspaces.map((w) => {
          const count = accounts.filter((a) => a.workspace_id === w.id).length;
          return (
            <div key={w.id} className="surface-card p-4">
              <p className="truncate font-medium">{w.name}</p>
              <p className="text-xs text-muted-foreground">/{w.slug}</p>
              <p className="mt-3 text-2xl font-semibold">{count}</p>
              <p className="text-xs text-muted-foreground">mailboxes assigned</p>
            </div>
          );
        })}
      </div>

      <div className="surface-card overflow-x-auto">
        {isLoading ? (
          <div className="h-40 animate-pulse bg-muted" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mailbox</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workspace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground">{a.from_email}</div>
                  </TableCell>
                  <TableCell>{providerLabel(a.provider)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {a.paused ? "paused" : `${a.health_score} · ${a.warmup_status}`}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={a.workspace_id ?? "unassigned"}
                      onValueChange={(v) =>
                        assignMutation.mutate({
                          id: a.id,
                          workspaceId: v === "unassigned" ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned (pool)</SelectItem>
                        {workspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
