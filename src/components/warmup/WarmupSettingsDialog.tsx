import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { getWarmupAccount, saveWarmupSettings } from "@/lib/warmup.functions";
import { WARMUP_MODES, WEEKDAYS, type WarmupMode } from "@/lib/warmup-model";
import { cn } from "@/lib/utils";
import { WarmupProgressionEditor } from "@/components/warmup/WarmupProgressionEditor";
import { DEFAULT_WARMUP_STAGES, validateWarmupStages, type ProgressionMode, type ProgressionStage } from "@/lib/warmup-progression";

type Draft = {
  progression_mode: ProgressionMode;
  progression_stages: ProgressionStage[];
  manual_daily_limit: number;
  mode: WarmupMode;
  start_volume: number;
  max_volume: number;
  daily_increase: number;
  ramp_days: number;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  reply_rate: number;
  max_bounce_rate: number;
  min_health_score: number;
  auto_pause: boolean;
};

const DEFAULT_DRAFT: Draft = {
  progression_mode: "automatic",
  progression_stages: DEFAULT_WARMUP_STAGES,
  manual_daily_limit: 1,
  mode: "balanced",
  start_volume: 4,
  max_volume: 40,
  daily_increase: 2,
  ramp_days: 30,
  send_days: [1, 2, 3, 4, 5],
  send_start_hour: 8,
  send_end_hour: 18,
  reply_rate: 35,
  max_bounce_rate: 5,
  min_health_score: 50,
  auto_pause: true,
};

export function WarmupSettingsDialog({
  accountId,
  accountEmail,
  onOpenChange,
}: {
  accountId: string | null;
  accountEmail: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getWarmupAccount);
  const saveFn = useServerFn(saveWarmupSettings);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);

  const detail = useQuery({
    queryKey: ["warmup-account", accountId],
    queryFn: () => fetchAccount({ data: { id: accountId as string, days: 30 } }),
    enabled: Boolean(accountId),
  });

  const settings = detail.data?.settings ?? null;
  const health = detail.data?.health ?? null;
  
  const placementTotals = (detail.data?.stats ?? []).reduce(
    (acc, day) => ({
      inbox: acc.inbox + (day.inbox ?? 0),
      spam: acc.spam + (day.spam ?? 0),
      notReceived: acc.notReceived + (day.not_received ?? 0),
      deferred: acc.deferred + (day.deferred ?? 0),
      rejected: acc.rejected + (day.rejected ?? 0),
    }),
    { inbox: 0, spam: 0, notReceived: 0, deferred: 0, rejected: 0 },
  );
  const confirmed = placementTotals.inbox + placementTotals.spam;

  useEffect(() => {
    if (!settings) { setDraft(DEFAULT_DRAFT); return; }
    setDraft({
      progression_mode: settings.progression_mode ?? "legacy",
      progression_stages: settings.progression_stages ?? DEFAULT_WARMUP_STAGES,
      manual_daily_limit: settings.manual_daily_limit ?? settings.progression_limit ?? settings.start_volume,
      mode: settings.mode,
      start_volume: settings.start_volume,
      max_volume: settings.max_volume,
      daily_increase: settings.daily_increase,
      ramp_days: settings.ramp_days,
      send_days: settings.send_days ?? DEFAULT_DRAFT.send_days,
      send_start_hour: settings.send_start_hour,
      send_end_hour: settings.send_end_hour,
      reply_rate: settings.reply_rate,
      max_bounce_rate: settings.max_bounce_rate,
      min_health_score: settings.min_health_score,
      auto_pause: settings.auto_pause,
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => saveFn({ data: { accountId: accountId as string, ...draft } }),
    onSuccess: async () => {
      toast.success("Warmup settings saved");
      await queryClient.invalidateQueries({ queryKey: ["warmup-accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["warmup-account", accountId] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-mailboxes"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const applyMode = (mode: WarmupMode) => {
    const preset = WARMUP_MODES.find((m) => m.id === mode);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      mode,
      start_volume: preset.start_volume,
      daily_increase: preset.daily_increase,
      max_volume: preset.max_volume,
      ramp_days: preset.ramp_days,
      reply_rate: preset.reply_rate,
    }));
  };

  const num = (key: keyof Draft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: Number(value) || 0 }));

  return (
    <Dialog open={Boolean(accountId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Warmup settings</DialogTitle>
          <DialogDescription>
            Ramp, schedule and safety thresholds for {accountEmail}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {detail.error && <p role="alert" className="text-sm text-destructive">{detail.error.message}</p>}
          <WarmupProgressionEditor mode={draft.progression_mode} stages={draft.progression_stages} limit={draft.manual_daily_limit} settings={settings} onChange={patch => setDraft(prev => ({ ...prev, ...patch }))} />
          {draft.progression_mode === "legacy" && <>
          <div className="grid gap-2 sm:grid-cols-3">
            {WARMUP_MODES.map((mode) => (
              <Button variant="outline"
                key={mode.id}
                type="button"
                onClick={() => applyMode(mode.id)}
                className={cn(
                  "h-auto flex-col items-start whitespace-normal rounded-lg border p-3 text-left transition",
                  draft.mode === mode.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <p className="text-sm font-semibold">{mode.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{mode.description}</p>
              </Button>
            ))}
          </div>

          </>}

          <div className="grid gap-4 sm:grid-cols-2">
            {draft.progression_mode === "legacy" && <><div className="space-y-1.5">
              <Label htmlFor="start_volume">Start volume / day</Label>
              <Input
                id="start_volume"
                type="number"
                value={draft.start_volume}
                onChange={(e) => num("start_volume")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_volume">Max volume / day</Label>
              <Input
                id="max_volume"
                type="number"
                value={draft.max_volume}
                onChange={(e) => num("max_volume")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily_increase">Daily increase</Label>
              <Input
                id="daily_increase"
                type="number"
                value={draft.daily_increase}
                onChange={(e) => num("daily_increase")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ramp_days">Ramp days</Label>
              <Input
                id="ramp_days"
                type="number"
                value={draft.ramp_days}
                onChange={(e) => num("ramp_days")(e.target.value)}
              />
            </div></>}
            <div className="space-y-1.5">
              <Label htmlFor="send_start_hour">Send window start (hour)</Label>
              <Input
                id="send_start_hour"
                type="number"
                value={draft.send_start_hour}
                onChange={(e) => num("send_start_hour")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send_end_hour">Send window end (hour)</Label>
              <Input
                id="send_end_hour"
                type="number"
                value={draft.send_end_hour}
                onChange={(e) => num("send_end_hour")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply_rate">Target reply rate (%)</Label>
              <Input
                id="reply_rate"
                type="number"
                value={draft.reply_rate}
                onChange={(e) => num("reply_rate")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_bounce_rate">Max bounce rate (%)</Label>
              <Input
                id="max_bounce_rate"
                type="number"
                value={draft.max_bounce_rate}
                onChange={(e) => num("max_bounce_rate")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min_health_score">Min health score</Label>
              <Input
                id="min_health_score"
                type="number"
                value={draft.min_health_score}
                onChange={(e) => num("min_health_score")(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sending days</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const active = draft.send_days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        send_days: active
                          ? prev.send_days.filter((d) => d !== day.value)
                          : [...prev.send_days, day.value].sort((a, b) => a - b),
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Auto-pause on poor health</p>
              <p className="text-xs text-muted-foreground">
                Stop warmup automatically when bounces or health cross the thresholds above.
              </p>
            </div>
            <Switch
              checked={draft.auto_pause}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, auto_pause: checked }))}
            />
          </div>
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Deliverability (last 30 days)</p>
            {health ? (
              <span className="text-xs text-muted-foreground">
                Health {health.score} · {health.status}
              </span>
            ) : null}
          </div>

          {confirmed === 0 && placementTotals.notReceived === 0 ? (
            <p className="text-xs text-muted-foreground">
              No arrivals confirmed yet. Placement appears once warmup mail is received by the
              network mailboxes.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              {[
                { label: "Inbox", value: placementTotals.inbox },
                { label: "Spam", value: placementTotals.spam },
                { label: "Delayed", value: placementTotals.deferred },
                { label: "Rejected", value: placementTotals.rejected },
                { label: "Not confirmed", value: placementTotals.notReceived },
              ].map((item) => (
                <div key={item.label} className="rounded-md bg-muted/50 p-2">
                  <p className="text-muted-foreground">{item.label}</p>
                  <p className="text-base font-semibold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {health?.factors?.length ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {health.factors.slice(0, 5).map((factor) => (
                <li key={factor.label}>
                  <span className="font-medium text-foreground">{factor.label}</span>
                  {factor.impact ? ` (${factor.impact})` : ""} — {factor.detail}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Warmup network message details are intentionally not shown to customers. */}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || detail.isPending || detail.isError || Boolean(validateWarmupStages(draft.progression_stages))}>
            {saveMutation.isPending ? "Saving…" : "Save progression settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
