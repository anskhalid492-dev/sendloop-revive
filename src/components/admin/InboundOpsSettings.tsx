import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getInboundOps, runRetrySweep, saveInboundOps } from "@/lib/ops.functions";

type Settings = {
  maxRetries: number;
  backoffMinutes: number;
  backoffFactor: number;
  retryEnabled: boolean;
  notifyEmail: string | null;
  notifyWebhookUrl: string | null;
  notifyOnSignatureFailure: boolean;
  notifyOnRetryThreshold: boolean;
  retryAlertThreshold: number;
};

/** Admin controls for inbound retry backoff and failure alerting. */
export function InboundOpsSettings() {
  const queryClient = useQueryClient();
  const fetchOps = useServerFn(getInboundOps);
  const save = useServerFn(saveInboundOps);
  const sweep = useServerFn(runRetrySweep);

  const ops = useQuery({ queryKey: ["inbound-ops"], queryFn: () => fetchOps() });
  const [form, setForm] = useState<Settings | null>(null);

  useEffect(() => {
    if (ops.data?.settings && !form) setForm(ops.data.settings);
  }, [ops.data, form]);

  const saveMutation = useMutation({
    mutationFn: (value: Settings) => save({ data: value }),
    onSuccess: () => {
      toast.success("Inbound retry and alert settings saved");
      void queryClient.invalidateQueries({ queryKey: ["inbound-ops"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sweepMutation = useMutation({
    mutationFn: () => sweep({}),
    onSuccess: (result) =>
      toast.success(
        result.disabled
          ? "Automatic retries are turned off."
          : `Retried ${result.retried} · waiting ${result.skipped} · exhausted ${result.exhausted}`,
      ),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!form) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inbound retries &amp; alerts</CardTitle>
          <CardDescription>Loading configuration…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm({ ...form, [key]: value });

  const schedule = [1, 2, 3]
    .map((n) => Math.round(form.backoffMinutes * Math.pow(Math.max(1, form.backoffFactor), n - 1)))
    .join(" → ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" /> Inbound retries &amp; alerts
        </CardTitle>
        <CardDescription>
          Failed inbound deliveries retry automatically with backoff. Alerts fire when a delivery
          fails signature verification or passes the retry threshold.
          {ops.data?.lastAlert
            ? ` Last alert: ${ops.data.lastAlert.title} (${new Date(ops.data.lastAlert.at ?? "").toLocaleString()}).`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Automatic retry</p>
            <p className="text-xs text-muted-foreground">
              Schedule: {schedule} minutes between the first attempts.
            </p>
          </div>
          <Switch
            checked={form.retryEnabled}
            onCheckedChange={(value) => set("retryEnabled", value)}
            aria-label="Enable automatic retries"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="max-retries">Max retries</Label>
            <Input
              id="max-retries"
              type="number"
              min={0}
              max={20}
              value={form.maxRetries}
              onChange={(event) => set("maxRetries", Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="backoff">First delay (minutes)</Label>
            <Input
              id="backoff"
              type="number"
              min={1}
              max={1440}
              value={form.backoffMinutes}
              onChange={(event) => set("backoffMinutes", Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="factor">Backoff multiplier</Label>
            <Input
              id="factor"
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={form.backoffFactor}
              onChange={(event) => set("backoffFactor", Number(event.target.value))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="alert-email">Alert email</Label>
            <Input
              id="alert-email"
              type="email"
              placeholder="ops@yourdomain.com"
              value={form.notifyEmail ?? ""}
              onChange={(event) => set("notifyEmail", event.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alert-webhook">Alert webhook URL</Label>
            <Input
              id="alert-webhook"
              placeholder="https://hooks.example.com/munchreach"
              value={form.notifyWebhookUrl ?? ""}
              onChange={(event) => set("notifyWebhookUrl", event.target.value || null)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
            Alert on signature failure
            <Switch
              checked={form.notifyOnSignatureFailure}
              onCheckedChange={(value) => set("notifyOnSignatureFailure", value)}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
            Alert on retry threshold
            <Switch
              checked={form.notifyOnRetryThreshold}
              onCheckedChange={(value) => set("notifyOnRetryThreshold", value)}
            />
          </label>
        </div>

        <div className="space-y-2 sm:max-w-[220px]">
          <Label htmlFor="threshold">Retry alert threshold</Label>
          <Input
            id="threshold"
            type="number"
            min={1}
            max={20}
            value={form.retryAlertThreshold}
            onChange={(event) => set("retryAlertThreshold", Number(event.target.value))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
          <Button
            variant="outline"
            onClick={() => sweepMutation.mutate()}
            disabled={sweepMutation.isPending}
          >
            <Play className="mr-1 h-3.5 w-3.5" /> Run retry sweep now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
