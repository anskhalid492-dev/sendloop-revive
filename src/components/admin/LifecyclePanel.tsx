/**
 * Admin → System Emails → Lifecycle.
 *
 * Timing, discounts and the termination switch are configuration, not code.
 * The lifecycle templates themselves live in the normal Templates tab.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getLifecycleSettings,
  getLifecycleStats,
  runLifecycleNow,
  updateLifecycleSettings,
} from "@/lib/lifecycle.functions";
import type { LifecycleConfig } from "@/lib/lifecycle/config";

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        min={1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LifecyclePanel() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getLifecycleSettings);
  const fetchStats = useServerFn(getLifecycleStats);
  const save = useServerFn(updateLifecycleSettings);
  const runNow = useServerFn(runLifecycleNow);

  const settingsQuery = useQuery({ queryKey: ["lifecycle-settings"], queryFn: () => fetchSettings() });
  const statsQuery = useQuery({ queryKey: ["lifecycle-stats"], queryFn: () => fetchStats() });

  const [draft, setDraft] = useState<LifecycleConfig | null>(null);
  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (config: LifecycleConfig) => save({ data: config }),
    onSuccess: (config) => {
      setDraft(config);
      toast.success("Lifecycle settings saved");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runMutation = useMutation({
    mutationFn: () => runNow({ data: undefined }),
    onSuccess: (result) => {
      const r = result as { skipped?: string; emailsQueued: number; terminated: number };
      toast.success(
        r.skipped
          ? r.skipped
          : `Cycle finished — ${r.emailsQueued} email(s) queued, ${r.terminated} account(s) closed`,
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!draft) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading lifecycle settings…
      </div>
    );
  }

  const update = (patch: Partial<LifecycleConfig>) => setDraft({ ...draft, ...patch });
  const updateFree = (patch: Partial<LifecycleConfig["free_trial"]>) =>
    setDraft({ ...draft, free_trial: { ...draft.free_trial, ...patch } });
  const updateInactive = (patch: Partial<LifecycleConfig["inactive"]>) =>
    setDraft({ ...draft, inactive: { ...draft.inactive, ...patch } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Customer lifecycle automation</CardTitle>
            <CardDescription>
              Runs on the system email scheduler. Each step is sent once per customer and is cancelled
              automatically when they upgrade or become active again.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs">Enabled</Label>
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => update({ enabled })} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Free / trial upgrade offers</h3>
              <Switch
                checked={draft.free_trial.enabled}
                onCheckedChange={(enabled) => updateFree({ enabled })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="First offer (days after sign-up)"
                value={draft.free_trial.email_1_day}
                onChange={(email_1_day) => updateFree({ email_1_day })}
              />
              <NumberField
                label="First offer discount %"
                value={draft.free_trial.discount_1_percent}
                onChange={(discount_1_percent) => updateFree({ discount_1_percent })}
              />
              <NumberField
                label="Discount code valid for (days)"
                value={draft.free_trial.coupon_valid_days}
                onChange={(coupon_valid_days) => updateFree({ coupon_valid_days })}
              />
              <NumberField
                label="Second offer (days after sign-up)"
                value={draft.free_trial.email_2_day}
                onChange={(email_2_day) => updateFree({ email_2_day })}
              />
              <NumberField
                label="Second offer discount %"
                value={draft.free_trial.discount_2_percent}
                onChange={(discount_2_percent) => updateFree({ discount_2_percent })}
              />
            </div>
          </section>

          <section className="space-y-3 border-t pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Inactive customer re-engagement</h3>
              <Switch
                checked={draft.inactive.enabled}
                onCheckedChange={(enabled) => updateInactive({ enabled })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Inactive after (days)"
                value={draft.inactive.inactive_days}
                onChange={(inactive_days) => updateInactive({ inactive_days })}
                hint="No sign-in, workspace, campaign or lead activity."
              />
              <NumberField
                label="Reminder 1 (day)"
                value={draft.inactive.email_1_day}
                onChange={(email_1_day) => updateInactive({ email_1_day })}
              />
              <NumberField
                label="Reminder 2 (day)"
                value={draft.inactive.email_2_day}
                onChange={(email_2_day) => updateInactive({ email_2_day })}
              />
              <NumberField
                label="Reminder 3 (day)"
                value={draft.inactive.email_3_day}
                onChange={(email_3_day) => updateInactive({ email_3_day })}
              />
              <NumberField
                label="Final warning (day)"
                value={draft.inactive.final_warning_day}
                onChange={(final_warning_day) => updateInactive({ final_warning_day })}
              />
              <NumberField
                label="Account closed (day)"
                value={draft.inactive.termination_day}
                onChange={(termination_day) => updateInactive({ termination_day })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Close accounts automatically</p>
                <p className="text-xs text-muted-foreground">
                  When off, the sequence stops after the final warning and no account is closed.
                </p>
              </div>
              <Switch
                checked={draft.inactive.terminate}
                onCheckedChange={(terminate) => updateInactive({ terminate })}
              />
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save settings
            </Button>
            <Button
              variant="outline"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Run cycle now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrollments</CardTitle>
          <CardDescription>Current lifecycle state per customer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(statsQuery.data?.byTrackState ?? []).map((row) => (
              <Badge key={`${row.track}-${row.state}`} variant="secondary">
                {row.track} · {row.state} · {row.count}
              </Badge>
            ))}
            {(statsQuery.data?.byTrackState ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No enrollments yet.</p>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Track</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Next step</th>
                  <th className="py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {(statsQuery.data?.recent ?? []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2 pr-3">{row.email ?? "—"}</td>
                    <td className="py-2 pr-3">{row.track}</td>
                    <td className="py-2 pr-3">{row.state}</td>
                    <td className="py-2 pr-3">
                      {row.nextActionAt ? new Date(row.nextActionAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">{row.cancelReason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
