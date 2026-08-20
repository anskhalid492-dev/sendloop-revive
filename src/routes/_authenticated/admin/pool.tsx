import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  deleteSendingAccount,
  listAllSendingAccounts,
  listAllWorkspaces,
  listProviders,
  saveSendingAccount,
  sendAdminTestEmail,
  setSendingAccountPaused,
} from "@/lib/admin.functions";
import { providerLabel, type ProviderId } from "@/lib/providers/registry";

export const Route = createFileRoute("/_authenticated/admin/pool")({
  head: () => ({
    meta: [
      { title: "Sending Pool — MunchReach Admin" },
      {
        name: "description",
        content: "Manage the shared mailbox pool: capacity, warmup state and health.",
      },
    ],
  }),
  component: AdminPoolPage,
});

function AdminPoolPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listAllSendingAccounts);
  const fetchProviders = useServerFn(listProviders);
  const fetchWorkspaces = useServerFn(listAllWorkspaces);
  const save = useServerFn(saveSendingAccount);
  const pause = useServerFn(setSendingAccountPaused);
  const remove = useServerFn(deleteSendingAccount);
  const testSend = useServerFn(sendAdminTestEmail);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["admin", "pool"],
    queryFn: () => fetchAccounts(),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["admin", "providers"],
    queryFn: () => fetchProviders(),
  });
  const { data: workspaces = [] } = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => fetchWorkspaces(),
  });

  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [label, setLabel] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [hourlyLimit, setHourlyLimit] = useState(10);
  const [warmupTarget, setWarmupTarget] = useState(20);
  const [workspaceId, setWorkspaceId] = useState("unassigned");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) throw new Error("Pick a provider first");
      return save({
        data: {
          providerId,
          provider: provider.provider as ProviderId,
          label: label.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          dailyLimit,
          hourlyLimit,
          warmupDailyTarget: warmupTarget,
          warmupStatus: "warming",
          workspaceId: workspaceId === "unassigned" ? null : workspaceId,
          paused: false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Mailbox added to the pool");
      setOpen(false);
      setLabel("");
      setFromEmail("");
      setFromName("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (vars: { id: string; paused: boolean }) => pause({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Mailbox removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (vars: { id: string; to: string }) => testSend({ data: vars }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](r.message ?? "Test send attempted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Sending pool</h2>
          <p className="text-sm text-muted-foreground">
            Every mailbox MunchReach operates, across all providers and workspaces.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setOpen(true)} disabled={providers.length === 0}>
          <Plus className="size-4" />
          Add mailbox
        </Button>
      </div>

      <div className="surface-card overflow-x-auto">
        {isLoading ? (
          <div className="h-40 animate-pulse bg-muted" />
        ) : accounts.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            The pool is empty. Add a provider first, then attach mailboxes.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mailbox</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Usage today</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    {a.sent_today}/{a.daily_limit}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {workspaces.find((w) => w.id === a.workspace_id)?.name ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const to = window.prompt("Send a test email to:");
                          if (to) testMutation.mutate({ id: a.id, to });
                        }}
                      >
                        <Send className="size-4" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pauseMutation.mutate({ id: a.id, paused: !a.paused })}
                      >
                        <Play className="size-4" />
                        {a.paused ? "Resume" : "Pause"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${a.label}`}
                        onClick={() => deleteMutation.mutate(a.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add mailbox to pool</DialogTitle>
            <DialogDescription>
              Mailboxes inherit credentials from their provider — nothing extra to store here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-name">From name</Label>
                <Input
                  id="from-name"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-email">From email</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-limit">Daily limit</Label>
                <Input
                  id="daily-limit"
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly-limit">Hourly limit</Label>
                <Input
                  id="hourly-limit"
                  type="number"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warmup-target">Warmup target</Label>
                <Input
                  id="warmup-target"
                  type="number"
                  value={warmupTarget}
                  onChange={(e) => setWarmupTarget(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Workspace</Label>
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger>
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
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Add mailbox"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
