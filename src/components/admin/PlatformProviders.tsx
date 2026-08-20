/**
 * Admin → Providers overview. Renders the platform-wide provider inventory
 * (sending, inbound, AI, verification, billing, analytics) plus the dedicated
 * email/sending infrastructure view. Configuration status only — the browser
 * never receives a credential value.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  adminListPlatformProviders,
  adminListSendingProviders,
  adminSetSendingProviderEnabled,
  adminSetSendingProviderPriority,
  adminTestPlatformProvider,
} from "@/lib/admin-platform.functions";

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  not_tested: "bg-muted text-muted-foreground border-border",
  not_configured: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  disabled: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  not_tested: "Not tested",
  not_configured: "Not configured",
  failed: "Failed",
  disabled: "Disabled",
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function PlatformProviders() {
  const queryClient = useQueryClient();
  const listAll = useServerFn(adminListPlatformProviders);
  const listSending = useServerFn(adminListSendingProviders);
  const test = useServerFn(adminTestPlatformProvider);
  const toggle = useServerFn(adminSetSendingProviderEnabled);
  const setPriority = useServerFn(adminSetSendingProviderPriority);

  const [category, setCategory] = useState<string>("all");

  const all = useQuery({ queryKey: ["admin", "platform-providers"], queryFn: () => listAll() });
  const sending = useQuery({ queryKey: ["admin", "sending-providers"], queryFn: () => listSending() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const testMutation = useMutation({
    mutationFn: (input: { source: "email" | "billing"; id?: string; provider?: string; environment?: "test" | "live" }) =>
      test({ data: input }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](`${result.ok ? "SUCCESS" : "FAILED"} — ${result.message}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggle({ data: input }),
    onSuccess: () => {
      toast.success("Provider updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priorityMutation = useMutation({
    mutationFn: (input: { id: string; priority: number }) => setPriority({ data: input }),
    onSuccess: () => {
      toast.success("Priority saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const providers = all.data?.providers ?? [];
  const categories = ["all", ...Array.from(new Set(providers.map((p) => p.category)))];
  const visible = providers.filter((p) => category === "all" || p.category === category);

  return (
    <div className="space-y-6">
      <div className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Platform providers</h3>
            <p className="text-xs text-muted-foreground">
              Every provider Sendloop talks to. Credentials stay server-side and are never sent to
              the browser.
            </p>
          </div>
          <Badge variant="outline">
            Billing environment: {all.data?.environment?.toUpperCase() ?? "—"}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(c)}
            >
              {c === "all" ? "All" : c}
            </Button>
          ))}
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last test</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  Loading providers…
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => (
                <TableRow key={p.key}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="max-w-[320px] text-xs text-muted-foreground">{p.detail}</div>
                    {p.lastError ? (
                      <div className="max-w-[320px] truncate text-xs text-destructive">{p.lastError}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{p.category}</TableCell>
                  <TableCell>{p.enabled ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-xs uppercase">{p.environment}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[p.status]}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{when(p.lastTestAt)}</TableCell>
                  <TableCell>{p.priority ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {p.canTest ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testMutation.isPending}
                        onClick={() =>
                          testMutation.mutate(
                            p.source === "billing"
                              ? {
                                  source: "billing",
                                  provider: p.name.split(" ")[0] ?? "",
                                  environment: p.environment as "test" | "live",
                                }
                              : { source: "email", id: p.id ?? "" },
                          )
                        }
                      >
                        <RefreshCcw className="size-4" />
                        Test
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {p.configured ? "—" : "Not configured"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="surface-card overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold">Email &amp; sending infrastructure</h3>
          <p className="text-xs text-muted-foreground">
            Sendloop-managed sending. Customers never see or configure these credentials — they
            connect their own domains and mailboxes under Email Accounts.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Capacity (day / hour)</TableHead>
              <TableHead>Health 24h</TableHead>
              <TableHead>Last success</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sending.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.provider} ·{" "}
                    {row.credentialSource === "platform_env"
                      ? "platform secret"
                      : row.credentialSource === "provider_secret"
                        ? "stored credential"
                        : "not configured"}
                  </div>
                  {row.lastError ? (
                    <div className="max-w-[280px] truncate text-xs text-destructive">{row.lastError}</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {row.dailyCapacity.toLocaleString()} / {row.hourlyCapacity.toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="text-emerald-700">{row.sent24h} sent</span>
                  {" · "}
                  <span className={row.failed24h ? "text-destructive" : "text-muted-foreground"}>
                    {row.failed24h} failed
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{when(row.lastSuccessAt)}</TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-20"
                    type="number"
                    defaultValue={row.priority}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value && value !== row.priority) {
                        priorityMutation.mutate({ id: row.id, priority: value });
                      }
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: row.id, enabled: checked })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
