import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformProviders } from "@/components/admin/PlatformProviders";
import { ReplyToSettings } from "@/components/admin/ReplyToSettings";
import { InboundWebhookSettings } from "@/components/admin/InboundWebhookSettings";
import { InboundReadiness } from "@/components/admin/InboundReadiness";
import { WebhookStatus } from "@/components/admin/WebhookStatus";
import { MxChecker } from "@/components/admin/MxChecker";
import { EmailEventLog } from "@/components/admin/EmailEventLog";
import { InboundTest } from "@/components/admin/InboundTest";
import { InboundOpsSettings } from "@/components/admin/InboundOpsSettings";
import { deleteProvider, listProviders, saveProvider, testProvider } from "@/lib/admin.functions";
import { PROVIDER_DEFINITIONS, providerLabel, type ProviderId } from "@/lib/providers/registry";

export const Route = createFileRoute("/_authenticated/admin/providers")({
  head: () => ({
    meta: [
      { title: "Email Providers — MunchReach Admin" },
      {
        name: "description",
        content: "Configure the email providers MunchReach uses to deliver customer campaigns.",
      },
    ],
  }),
  component: AdminProvidersPage,
});

const STATUS_STYLES: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  untested: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  disabled: "bg-muted text-muted-foreground border-border",
};

function AdminProvidersPage() {
  const queryClient = useQueryClient();
  const fetchProviders = useServerFn(listProviders);
  const save = useServerFn(saveProvider);
  const test = useServerFn(testProvider);
  const remove = useServerFn(deleteProvider);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["admin", "providers"],
    queryFn: () => fetchProviders(),
  });

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("resend");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(10);
  const [dailyCapacity, setDailyCapacity] = useState(50000);
  const [hourlyCapacity, setHourlyCapacity] = useState(5000);
  const [costPer1k, setCostPer1k] = useState(10);
  const [isEnabled, setIsEnabled] = useState(true);
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const definition = PROVIDER_DEFINITIONS.find((p) => p.id === provider)!;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          provider,
          name: name.trim() || definition.label,
          isEnabled,
          priority,
          dailyCapacity,
          hourlyCapacity,
          costPer1kCents: costPer1k,
          credentials: Object.keys(credentials).length ? credentials : undefined,
        },
      }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message ?? "Provider saved");
      setOpen(false);
      setCredentials({});
      setName("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message ?? "Connection tested");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Provider removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Tabs defaultValue="pool" className="space-y-6">
      <TabsList>
        <TabsTrigger value="pool">Sending pool</TabsTrigger>
        <TabsTrigger value="overview">All providers</TabsTrigger>
        <TabsTrigger value="email">Email &amp; sending setup</TabsTrigger>
      </TabsList>

      <TabsContent value="pool">
        <ProviderPool />
      </TabsContent>

      <TabsContent value="overview">
        <PlatformProviders />
      </TabsContent>

      <TabsContent value="email" className="space-y-6">

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Email providers</h2>
          <p className="text-sm text-muted-foreground">
            Credentials are encrypted server-side and never exposed to customers.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          Add provider
        </Button>
      </div>

      <ReplyToSettings />
      <InboundWebhookSettings />
      <div className="grid gap-6 lg:grid-cols-2">
        <WebhookStatus />
        <MxChecker />
      </div>
      <InboundReadiness />
      <InboundTest />
      <InboundOpsSettings />
      <EmailEventLog />

      <div className="surface-card overflow-x-auto">
        {isLoading ? (
          <div className="h-40 animate-pulse bg-muted" />
        ) : providers.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No providers configured yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Daily capacity</TableHead>
                <TableHead>Cost / 1k</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {providerLabel(p.provider)}
                      {p.is_enabled ? "" : " · disabled"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[p.status]}>
                      {p.status}
                    </Badge>
                    {p.last_error ? (
                      <div className="mt-1 max-w-[220px] truncate text-xs text-destructive">
                        {p.last_error}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{p.priority}</TableCell>
                  <TableCell>{p.daily_capacity.toLocaleString()}</TableCell>
                  <TableCell>${(p.cost_per_1k_cents / 100).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testMutation.mutate(p.id)}
                        disabled={testMutation.isPending}
                      >
                        <RefreshCcw className="size-4" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => deleteMutation.mutate(p.id)}
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
            <DialogTitle>Add provider</DialogTitle>
            <DialogDescription>
              Credentials are encrypted before storage and validated on save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_DEFINITIONS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{definition.blurb}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-name">Internal name</Label>
              <Input
                id="provider-name"
                value={name}
                placeholder={definition.label}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {definition.fields.map((f) => (
              <div key={f.name} className="space-y-2">
                <Label htmlFor={`cred-${f.name}`}>{f.label}</Label>
                <Input
                  id={`cred-${f.name}`}
                  type={f.secret ? "password" : "text"}
                  placeholder={f.placeholder}
                  value={credentials[f.name] ?? ""}
                  onChange={(e) =>
                    setCredentials((c) => ({ ...c, [f.name]: e.target.value }))
                  }
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost per 1k (cents)</Label>
                <Input
                  id="cost"
                  type="number"
                  value={costPer1k}
                  onChange={(e) => setCostPer1k(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily">Daily capacity</Label>
                <Input
                  id="daily"
                  type="number"
                  value={dailyCapacity}
                  onChange={(e) => setDailyCapacity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly">Hourly capacity</Label>
                <Input
                  id="hourly"
                  type="number"
                  value={hourlyCapacity}
                  onChange={(e) => setHourlyCapacity(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">Available for campaign routing</p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </TabsContent>
    </Tabs>
  );
}
