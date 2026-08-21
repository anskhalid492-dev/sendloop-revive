import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Plus, RefreshCcw, Trash2 } from "lucide-react";
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
import {
  deleteProvider,
  listProviderRoutingEvents,
  listProviders,
  runProviderPoolHealthCheck,
  saveProvider,
  testProvider,
} from "@/lib/admin.functions";
import { PROVIDER_DEFINITIONS, providerLabel, type ProviderId } from "@/lib/providers/registry";

const HEALTH_STYLES: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  degraded: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  down: "bg-destructive/10 text-destructive border-destructive/20",
  unknown: "bg-muted text-muted-foreground border-border",
};

const POOL_PROVIDERS: ProviderId[] = ["resend", "ses", "mailgun", "brevo", "sendgrid"].filter((id) =>
  PROVIDER_DEFINITIONS.some((d) => d.id === id),
) as ProviderId[];

/** Region is only meaningful for providers that are region-scoped. */
const REGION_PROVIDERS = new Set(["ses"]);

function percent(used: number, capacity: number) {
  if (capacity <= 0) return "—";
  return `${Math.min(100, Math.round((used / capacity) * 100))}%`;
}

export function ProviderPool() {
  const queryClient = useQueryClient();
  const fetchProviders = useServerFn(listProviders);
  const fetchEvents = useServerFn(listProviderRoutingEvents);
  const save = useServerFn(saveProvider);
  const test = useServerFn(testProvider);
  const remove = useServerFn(deleteProvider);
  const health = useServerFn(runProviderPoolHealthCheck);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["admin", "providers"],
    queryFn: () => fetchProviders(),
  });
  const { data: events = [] } = useQuery({
    queryKey: ["admin", "provider-routing-events"],
    queryFn: () => fetchEvents(),
  });

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("resend");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(10);
  const [mode, setMode] = useState<"sandbox" | "live">("live");
  const [region, setRegion] = useState("us-east-1");
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
          mode,
          region: REGION_PROVIDERS.has(provider) ? region.trim() : undefined,
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

  const healthMutation = useMutation({
    mutationFn: () => health(),
    onSuccess: (result) => {
      toast.success(`Health checked for ${result.results.length} provider(s)`);
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
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Provider pool</h2>
          <p className="text-sm text-muted-foreground">
            Global sending infrastructure. MunchReach routes every domain and every send
            automatically — providers are never assigned to a workspace or a customer.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
          >
            <Activity className="size-4" />
            Run health checks
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add provider
          </Button>
        </div>
      </div>

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
                <TableHead>Health</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Error rate</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => {
                const ok = p.success_count ?? 0;
                const bad = p.failure_count ?? 0;
                const rate = ok + bad === 0 ? 0 : (bad / (ok + bad)) * 100;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {providerLabel(p.provider)}
                        {p.region ? ` · ${p.region}` : ""}
                        {p.is_enabled ? "" : " · disabled"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={HEALTH_STYLES[p.health_status ?? "unknown"]}
                      >
                        {p.health_status ?? "unknown"}
                      </Badge>
                      {p.health_detail ? (
                        <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                          {p.health_detail}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="capitalize">{p.mode ?? "live"}</TableCell>
                    <TableCell>{p.priority}</TableCell>
                    <TableCell className="text-sm">
                      {p.hourly_capacity.toLocaleString()}/hr
                      <div className="text-xs text-muted-foreground">
                        {p.daily_capacity.toLocaleString()}/day
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(p.sent_hour ?? 0).toLocaleString()} ·{" "}
                      {percent(p.sent_hour ?? 0, p.hourly_capacity)}
                      <div className="text-xs text-muted-foreground">
                        {(p.sent_day ?? 0).toLocaleString()} today
                      </div>
                    </TableCell>
                    <TableCell>{rate.toFixed(1)}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.last_success_at
                        ? new Date(p.last_success_at).toLocaleString()
                        : p.last_tested_at
                          ? `tested ${new Date(p.last_tested_at).toLocaleString()}`
                          : "—"}
                    </TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold">Routing &amp; failover log</h3>
        <p className="text-xs text-muted-foreground">
          Every automatic assignment, failover and deferred switch is recorded here.
        </p>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No routing events yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {events.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-medium">{e.event.replace(/_/g, " ")}</span>
                  {e.domain ? <span className="text-muted-foreground"> · {e.domain}</span> : null}
                  {e.reason ? (
                    <span className="text-muted-foreground"> · {e.reason}</span>
                  ) : null}
                  {e.detail ? (
                    <div className="truncate text-xs text-muted-foreground">{e.detail}</div>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add provider to the pool</DialogTitle>
            <DialogDescription>
              Credentials are encrypted server-side, validated on save, and never exposed to
              customers.
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
                  {PROVIDER_DEFINITIONS.filter((d) => POOL_PROVIDERS.includes(d.id)).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                  {PROVIDER_DEFINITIONS.filter((d) => !POOL_PROVIDERS.includes(d.id)).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{definition.blurb}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-name">Internal name</Label>
                <Input
                  id="provider-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={definition.label}
                />
              </div>
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "sandbox" | "live")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {REGION_PROVIDERS.has(provider) ? (
              <div className="space-y-2">
                <Label htmlFor="provider-region">Region</Label>
                <Input
                  id="provider-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="us-east-1"
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-priority">Priority (lower routes first)</Label>
                <Input
                  id="provider-priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-cost">Cost per 1k (cents)</Label>
                <Input
                  id="provider-cost"
                  type="number"
                  value={costPer1k}
                  onChange={(e) => setCostPer1k(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-hourly">Hourly capacity</Label>
                <Input
                  id="provider-hourly"
                  type="number"
                  value={hourlyCapacity}
                  onChange={(e) => setHourlyCapacity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-daily">Daily capacity</Label>
                <Input
                  id="provider-daily"
                  type="number"
                  value={dailyCapacity}
                  onChange={(e) => setDailyCapacity(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Credentials</p>
              {definition.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={`cred-${field.name}`}>{field.label}</Label>
                  <Input
                    id={`cred-${field.name}`}
                    type={field.secret ? "password" : "text"}
                    value={credentials[field.name] ?? ""}
                    onChange={(e) =>
                      setCredentials((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    placeholder={field.placeholder ?? ""}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">
                  Disabled providers are skipped by automatic routing.
                </p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
