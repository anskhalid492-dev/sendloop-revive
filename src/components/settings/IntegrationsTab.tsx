import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { BrandGlyph, brandIcon } from "@/components/site/BrandGlyph";
import { useWorkspace } from "@/hooks/useWorkspace";
import { INTEGRATIONS_BY_SLUG, INTEGRATION_CATEGORIES, categoryLabel } from "@/lib/integrations-catalog";
import {
  connectIntegration,
  disconnectIntegration,
  listIntegrationEvents,
  listIntegrations,
  retryIntegrationEvent,
  testIntegration,
  updateIntegrationEvents,
  type IntegrationConnectionView,
} from "@/lib/integrations.functions";
import {
  disconnectCalendly,
  getCalendlyStatus,
  startCalendlyOAuth,
} from "@/lib/calendly.functions";
import { cn } from "@/lib/utils";

/** Messages for the `?calendly=` result the OAuth callback redirects back with. */
const CALENDLY_RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Calendly connected — booked meetings will now be tracked." },
  webhook_failed: {
    ok: false,
    text: "Calendly connected, but booking notifications could not be switched on. Try Reconnect.",
  },
  declined: { ok: false, text: "Calendly connection cancelled." },
  state_invalid: { ok: false, text: "That Calendly link was not valid. Please try again." },
  state_used: { ok: false, text: "That Calendly link was already used. Please try again." },
  no_code: { ok: false, text: "Calendly did not return an authorization. Please try again." },
  exchange_failed: { ok: false, text: "Calendly refused the authorization. Please try again." },
  verify_failed: { ok: false, text: "Calendly could not confirm the account. Nothing was saved." },
  store_failed: { ok: false, text: "The Calendly connection could not be saved. Please try again." },
  forbidden: { ok: false, text: "Only workspace owners and admins can connect Calendly." },
};

function StatusBadge({ item }: { item: IntegrationConnectionView }) {
  if (!item.isEnabled) return <Badge variant="outline">Unavailable</Badge>;
  if (!item.connected) return <Badge variant="outline">Not connected</Badge>;
  if (item.status === "error") return <Badge variant="destructive">Needs attention</Badge>;
  return (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="size-3" /> Connected
    </Badge>
  );
}

export function IntegrationsTab() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const queryClient = useQueryClient();

  const fetchList = useServerFn(listIntegrations);
  const fetchEvents = useServerFn(listIntegrationEvents);
  const connect = useServerFn(connectIntegration);
  const disconnect = useServerFn(disconnectIntegration);
  const test = useServerFn(testIntegration);
  const saveEvents = useServerFn(updateIntegrationEvents);
  const retry = useServerFn(retryIntegrationEvent);

  const [category, setCategory] = useState<string>("all");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["integrations", workspaceId],
    queryFn: () => fetchList({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });

  const events = useQuery({
    queryKey: ["integration-events", workspaceId],
    queryFn: () => fetchEvents({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["integrations", workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ["integration-events", workspaceId] });
  };

  const connectMutation = useMutation({
    mutationFn: (slug: string) => connect({ data: { workspaceId, slug, values } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpenSlug(null);
      setValues({});
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: (slug: string) => test({ data: { workspaceId, slug } }),
    onSuccess: async (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: (slug: string) => disconnect({ data: { workspaceId, slug } }),
    onSuccess: async () => {
      toast.success("Integration disconnected");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const eventsMutation = useMutation({
    mutationFn: (input: { slug: string; events: string[] }) =>
      saveEvents({ data: { workspaceId, ...input } }),
    onSuccess: async () => {
      toast.success("Events updated");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retryMutation = useMutation({
    mutationFn: (eventId: string) => retry({ data: { workspaceId, eventId } }),
    onSuccess: async (result) => {
      if (result.ok) toast.success("Event re-delivered");
      else toast.error(result.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /* ----------------------------------------------------- Calendly (OAuth) */

  const fetchCalendly = useServerFn(getCalendlyStatus);
  const startCalendly = useServerFn(startCalendlyOAuth);
  const dropCalendly = useServerFn(disconnectCalendly);
  const resultHandled = useRef(false);

  const calendly = useQuery({
    queryKey: ["calendly-status", workspaceId],
    queryFn: () => fetchCalendly({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });

  const calendlyStart = useMutation({
    mutationFn: () => startCalendly({ data: { workspaceId } }),
    onSuccess: (result) => {
      if (!result.ok || !result.url) {
        toast.error(result.message ?? "Could not start the Calendly connection.");
        return;
      }
      window.location.href = result.url;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const calendlyDisconnect = useMutation({
    mutationFn: () => dropCalendly({ data: { workspaceId } }),
    onSuccess: async (result) => {
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["calendly-status", workspaceId] });
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (resultHandled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("calendly");
    if (!code) return;
    resultHandled.current = true;
    const result = CALENDLY_RESULTS[code] ?? { ok: false, text: "Calendly connection failed." };
    if (result.ok) toast.success(result.text);
    else toast.error(result.text);
    params.delete("calendly");
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
    void queryClient.invalidateQueries({ queryKey: ["calendly-status", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["integrations", workspaceId] });
  }, [queryClient, workspaceId]);

  const items = useMemo(() => {
    const all = list.data ?? [];
    return category === "all" ? all : all.filter((i) => i.category === category);
  }, [list.data, category]);

  const openItem = openSlug ? (list.data ?? []).find((i) => i.slug === openSlug) : null;
  const openMeta = openSlug ? INTEGRATIONS_BY_SLUG[openSlug] : null;

  if (!workspaceId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage integrations.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect MunchReach to the tools your team already uses. Credentials are encrypted and only
          workspace owners and admins can change them.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ id: "all", label: "All" }, ...INTEGRATION_CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              category === c.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading integrations…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const meta = INTEGRATIONS_BY_SLUG[item.slug];
            const Icon = meta?.icon ?? Plug;
            const locked = !item.planAllowed;
            const isOauth = meta?.authType === "oauth";
            const cal = item.slug === "calendly" ? (calendly.data ?? null) : null;
            return (
              <div key={item.slug} className="rounded-xl border border-border/70 bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {brandIcon(meta?.brand) ? (
                        <BrandGlyph brand={meta?.brand} title={item.name} className="size-5" />
                      ) : (
                        <Icon className="size-5" />
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {categoryLabel(item.category)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.tagline}</p>
                    </div>
                  </div>
                  <StatusBadge item={item} />
                </div>

                {cal && cal.connected ? (
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>
                      Calendly account:{" "}
                      <span className="font-medium text-foreground">
                        {cal.accountName ?? cal.accountEmail ?? "Connected"}
                      </span>
                      {cal.accountName && cal.accountEmail ? ` · ${cal.accountEmail}` : ""}
                    </p>
                    <p>
                      {cal.webhookActive
                        ? "Bookings and cancellations are being received."
                        : "Booking notifications are not active — use Reconnect."}
                    </p>
                  </div>
                ) : item.connected && item.accountLabel ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Account: <span className="font-medium text-foreground">{item.accountLabel}</span>
                    {item.secretHint ? ` · key ${item.secretHint}` : ""}
                  </p>
                ) : null}

                {isOauth && cal && !cal.configured ? (
                  <p className="mt-3 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                    Calendly sign-in is not available on this environment yet.
                  </p>
                ) : null}

                {item.errorMessage ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {item.errorMessage}
                  </p>
                ) : null}

                {item.connected ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {item.successCount} delivered · {item.failureCount} failed
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {locked ? (
                    <Button size="sm" variant="outline" disabled className="gap-1.5">
                      <Lock className="size-3.5" /> Paid plan
                    </Button>
                  ) : isOauth ? (
                    <>
                      <Button
                        size="sm"
                        variant={cal?.connected ? "outline" : "default"}
                        disabled={
                          !item.isEnabled ||
                          calendlyStart.isPending ||
                          calendly.isLoading ||
                          cal?.configured === false
                        }
                        onClick={() => calendlyStart.mutate()}
                      >
                        {calendlyStart.isPending ? (
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                          <Link2 className="mr-1.5 size-3.5" />
                        )}
                        {cal?.connected ? "Reconnect" : `Connect ${item.name}`}
                      </Button>
                      {cal?.connected ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={calendlyDisconnect.isPending}
                          onClick={() => calendlyDisconnect.mutate()}
                        >
                          <Trash2 className="mr-1.5 size-3.5" /> Disconnect
                        </Button>
                      ) : null}
                    </>
                  ) : item.connected ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOpenSlug(item.slug);
                          setValues({});
                        }}
                      >
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={testMutation.isPending}
                        onClick={() => testMutation.mutate(item.slug)}
                      >
                        <RefreshCw className="mr-1.5 size-3.5" /> Send test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => disconnectMutation.mutate(item.slug)}
                      >
                        <Trash2 className="mr-1.5 size-3.5" /> Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!item.isEnabled}
                      onClick={() => {
                        setOpenSlug(item.slug);
                        setValues({});
                      }}
                    >
                      <Link2 className="mr-1.5 size-3.5" /> Connect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold">Recent integration activity</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Every delivery attempt is logged with its result so you can retry failures.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
          {(events.data ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No integration events yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Integration</th>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {(events.data ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-border/60">
                    <td className="px-4 py-2">{INTEGRATIONS_BY_SLUG[e.slug]?.name ?? e.slug}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.eventType} <span className="text-xs">({e.direction})</span>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={e.status === "success" ? "secondary" : "destructive"}>
                        {e.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {e.status !== "success" && e.direction === "outbound" ? (
                        <Button size="sm" variant="ghost" onClick={() => retryMutation.mutate(e.id)}>
                          Retry
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={Boolean(openSlug)} onOpenChange={(open) => !open && setOpenSlug(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {openMeta && openItem ? (
            <>
              <DialogHeader>
                <DialogTitle>{openMeta.name}</DialogTitle>
                <DialogDescription>{openMeta.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {openMeta.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`f-${field.key}`}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </Label>
                    <Input
                      id={`f-${field.key}`}
                      type={field.secret ? "password" : "text"}
                      autoComplete="off"
                      placeholder={
                        field.secret && openItem.connected && openItem.secretHint
                          ? `Saved (${openItem.secretHint}) — enter a new value to replace`
                          : field.placeholder
                      }
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    />
                    {field.help ? (
                      <p className="text-xs text-muted-foreground">{field.help}</p>
                    ) : null}
                  </div>
                ))}

                {openItem.connected && openMeta.events.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-border/70 p-3">
                    <p className="text-sm font-medium">Events sent to {openMeta.name}</p>
                    {openMeta.events.map((evt) => {
                      const checked = openItem.events.includes(evt);
                      return (
                        <div key={evt} className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs text-muted-foreground">{evt}</span>
                          <Switch
                            checked={checked}
                            onCheckedChange={(next) =>
                              eventsMutation.mutate({
                                slug: openMeta.slug,
                                events: next
                                  ? [...openItem.events, evt]
                                  : openItem.events.filter((e) => e !== evt),
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {openItem.inboundUrl ? (
                  <div className="space-y-1.5 rounded-lg border border-border/70 p-3">
                    <p className="text-sm font-medium">Your private inbound URL</p>
                    <p className="text-xs text-muted-foreground">
                      POST JSON leads here from {openMeta.name}. Treat it like a password.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                        {typeof window !== "undefined" ? window.location.origin : ""}
                        {openItem.inboundUrl}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}${openItem.inboundUrl}`,
                          );
                          toast.success("Inbound URL copied");
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpenSlug(null)}>
                  Close
                </Button>
                <Button
                  disabled={connectMutation.isPending}
                  onClick={() => connectMutation.mutate(openMeta.slug)}
                >
                  {connectMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {openItem.connected ? "Save & verify" : "Connect"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
