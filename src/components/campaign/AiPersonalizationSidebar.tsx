import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AI_TOKEN,
  FALLBACK_OPTIONS,
  FIELD_OPTIONS,
  FRAMEWORK_OPTIONS,
  LENGTH_OPTIONS,
  LEVEL_OPTIONS,
  TONE_OPTIONS,
  defaultAiConfig,
  normalizeAiConfig,
  usesAiToken,
  type AiPersonalizationConfig,
  type PersonalizationField,
} from "@/lib/ai-personalization-model";
import {
  cancelAiPersonalization,
  getAiPersonalizationStats,
  getAiSettings,
  previewAiPersonalization,
  queueAiPersonalization,
  retryFailedAiPersonalizations,
  runAiPersonalizationNow,
  saveAiSettings,
} from "@/lib/ai-personalization.functions";
import { listWorkspaceAiKeys } from "@/lib/ai-keys.functions";
import { AiModelPicker } from "@/components/campaign/AiModelPicker";
import type { CampaignBuilder } from "./useCampaignBuilder";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value.toLocaleString()}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function AiPersonalizationSidebar({
  builder,
  open,
  onOpenChange,
}: {
  builder: CampaignBuilder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const campaignId = builder.campaignId;
  const queryClient = useQueryClient();

  const fetchSettings = useServerFn(getAiSettings);
  const saveFn = useServerFn(saveAiSettings);
  const queueFn = useServerFn(queueAiPersonalization);
  const runFn = useServerFn(runAiPersonalizationNow);
  const cancelFn = useServerFn(cancelAiPersonalization);
  const retryFn = useServerFn(retryFailedAiPersonalizations);
  const statsFn = useServerFn(getAiPersonalizationStats);
  const previewFn = useServerFn(previewAiPersonalization);
  const fetchProviders = useServerFn(listWorkspaceAiKeys);

  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AiPersonalizationConfig>(defaultAiConfig());
  const [preview, setPreview] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["ai-settings", campaignId],
    queryFn: () => fetchSettings({ data: { campaignId } }),
    enabled: open,
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setEnabled(settingsQuery.data.enabled);
    setConfig(normalizeAiConfig(settingsQuery.data.config));
  }, [settingsQuery.data]);

  const statsQuery = useQuery({
    queryKey: ["ai-stats", campaignId],
    queryFn: () => statsFn({ data: { campaignId } }),
    enabled: open,
    refetchInterval: (query) =>
      query.state.data && query.state.data.queued > 0 ? 2500 : open ? 15000 : false,
  });

  const stats = statsQuery.data;
  const progress = stats && stats.eligible > 0 ? (stats.personalized / stats.eligible) * 100 : 0;

  const tokenUsed = useMemo(
    () => builder.steps.some((s) => usesAiToken(s.subject) || usesAiToken(s.body)),
    [builder.steps],
  );
  const sampleLeadId = builder.leads[0]?.lead_id ?? null;

  // Providers this workspace has actually connected — never a fake selector.
  const workspaceId = builder.campaign?.workspace_id ?? null;
  const providersQuery = useQuery({
    queryKey: ["workspace-ai-keys", workspaceId],
    queryFn: () => fetchProviders({ data: { workspaceId: workspaceId! } }),
    enabled: open && Boolean(workspaceId),
  });
  const connectedProviders = (providersQuery.data ?? []).filter((row) => row.connected);
  const activeProvider =
    connectedProviders.find((row) => row.provider === config.provider) ??
    connectedProviders.find((row) => row.status === "verified") ??
    connectedProviders[0] ??
    null;
  const activeModel = config.provider && config.model ? config.model : activeProvider?.model || "";
  const activeProviderLabel = activeProvider
    ? `${activeProvider.providerLabel} · ${activeModel || "no model selected"}`
    : "no provider connected";

  const patch = (values: Partial<AiPersonalizationConfig>) =>
    setConfig((prev) => ({ ...prev, ...values }));

  const save = useMutation({
    mutationFn: () => saveFn({ data: { campaignId, enabled, config } }),
    onSuccess: async () => {
      toast.success("AI personalization saved");
      await queryClient.invalidateQueries({ queryKey: ["ai-settings", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async (regenerate: boolean) => {
      await saveFn({ data: { campaignId, enabled: true, config } });
      const queued = await queueFn({ data: { campaignId, regenerate } });
      // One bounded batch keeps this request below the server memory ceiling.
      // The normal runner and this panel's polling continue draining the queue.
      const run = await runFn({ data: { campaignId, passes: 1 } });
      return { ...queued, ...run };
    },
    onSuccess: async (result) => {
      setEnabled(true);
      if (result.paused) toast.warning(result.paused);
      else
        toast.success(
          `Generated ${result.completed.toLocaleString()} snippets${
            result.reused ? ` · reused ${result.reused.toLocaleString()}` : ""
          }`,
        );
      await queryClient.invalidateQueries({ queryKey: ["ai-stats", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drain = useMutation({
    mutationFn: () => runFn({ data: { campaignId, passes: 8 } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-stats", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { campaignId } }),
    onSuccess: async () => {
      toast.success("Remaining generation cancelled");
      await queryClient.invalidateQueries({ queryKey: ["ai-stats", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retry = useMutation({
    mutationFn: async () => {
      await retryFn({ data: { campaignId } });
      return runFn({ data: { campaignId, passes: 4 } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-stats", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testPreview = useMutation({
    mutationFn: async () => {
      if (!sampleLeadId) throw new Error("Add leads to this campaign to preview personalization.");
      return previewFn({ data: { campaignId, leadId: sampleLeadId, config } });
    },
    onSuccess: (result) => {
      if (result.ok) setPreview(result.content);
      else toast.error(result.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleField = (field: PersonalizationField) =>
    patch({
      fields: config.fields.includes(field)
        ? config.fields.filter((f) => f !== field)
        : [...config.fields, field],
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI Personalization
          </SheetTitle>
          <SheetDescription>
            Write one tailored opening line per lead and drop it into your sequence with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{`{{${AI_TOKEN}}}`}</code>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Use AI personalization</div>
              <p className="text-xs text-muted-foreground">
                Applies to every email step that contains the AI variable.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable AI personalization" />
          </div>

          {enabled && !tokenUsed ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              None of your steps use {`{{${AI_TOKEN}}}`} yet — add it to a subject or body in the
              Sequences tab, otherwise nothing will be inserted.
            </div>
          ) : null}

          {/* Coverage */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Coverage</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void statsQuery.refetch()}
              >
                <RefreshCw className="mr-1.5 size-3" /> Refresh
              </Button>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Leads" value={stats?.eligible ?? 0} />
              <Stat label="Ready" value={stats?.personalized ?? 0} tone="text-emerald-600" />
              <Stat label="Queued" value={stats?.queued ?? 0} tone="text-sky-600" />
              <Stat label="Failed" value={stats?.failed ?? 0} tone="text-destructive" />
            </div>
            {stats?.paused ? (
              <p className="text-xs text-destructive">{stats.paused}</p>
            ) : null}
            {stats?.blockedReason && !stats.paused ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                <span className="font-medium">Generation is held up: </span>
                {stats.blockedReason}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => generate.mutate(false)} disabled={generate.isPending}>
                {generate.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Wand2 className="mr-1.5 size-3.5" />
                )}
                Generate for all leads
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generate.mutate(true)}
                disabled={generate.isPending}
              >
                Regenerate all
              </Button>
              {stats && stats.queued > 0 ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => drain.mutate()}
                    disabled={drain.isPending}
                  >
                    {drain.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                    Continue now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate()}>
                    Cancel queue
                  </Button>
                </>
              ) : null}
              {stats && stats.failed > 0 ? (
                <Button size="sm" variant="outline" onClick={() => retry.mutate()}>
                  Retry failed
                </Button>
              ) : null}
            </div>
          </section>

          <Separator />

          {/* AI provider */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">AI provider</h3>
              <Badge variant="outline" className="text-[11px]">
                Using {activeProviderLabel}
              </Badge>
            </div>
            {connectedProviders.length ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">AI Provider</Label>
                  <Select
                    value={config.provider ?? ""}
                    onValueChange={(value) =>
                      // Switching provider clears the model: a model id belongs to one provider.
                      patch({ provider: value as "openai" | "anthropic", model: null })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose ChatGPT or Claude" />
                    </SelectTrigger>
                    <SelectContent>
                      {connectedProviders.map((row) => (
                        <SelectItem key={row.provider} value={row.provider}>
                          {row.providerLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {config.provider ? (
                  <AiModelPicker
                    key={config.provider}
                    workspaceId={workspaceId}
                    provider={config.provider}
                    label="AI Model"
                    value={config.model}
                    onChange={(model) => patch({ model })}
                    allowConnectionDefault
                  />
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  This campaign&apos;s lines are written by the provider you choose here, using your
                  own key. Changing it only affects lines generated from now on — regenerate if you
                  want existing lines rewritten.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No AI provider is connected yet. Connect ChatGPT or Claude in Settings →
                Integrations to choose a provider here.
              </p>
            )}
          </section>

          <Separator />


          {/* Approach */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Approach</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Sales framework</Label>
                <Select
                  value={config.framework}
                  onValueChange={(value) => patch({ framework: value as never })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAMEWORK_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {FRAMEWORK_OPTIONS.find((o) => o.value === config.framework)?.hint}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tone</Label>
                <Select value={config.tone} onValueChange={(value) => patch({ tone: value as never })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {TONE_OPTIONS.find((o) => o.value === config.tone)?.hint}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Depth</Label>
                <Select
                  value={config.level}
                  onValueChange={(value) => patch({ level: value as never })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Length</Label>
                <Select
                  value={config.length}
                  onValueChange={(value) => patch({ length: value as never })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LENGTH_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Language</Label>
                <Input
                  value={config.language}
                  onChange={(e) => patch({ language: e.target.value })}
                  placeholder="English"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Instructions */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Instructions</h3>
            <Textarea
              rows={4}
              value={config.instructions}
              onChange={(e) => patch({ instructions: e.target.value })}
              placeholder="Tell the model what angle to take for this campaign."
            />
            <div className="space-y-1.5">
              <Label className="text-xs">Example of the style you want (optional)</Label>
              <Textarea
                rows={2}
                value={config.exampleOutput}
                onChange={(e) => patch({ exampleOutput: e.target.value })}
                placeholder="Noticed you lead ops at a 30-person logistics team — that stage is where routing breaks."
              />
            </div>
          </section>

          <Separator />

          {/* Data */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Lead data the AI may use</h3>
            <div className="flex flex-wrap gap-2">
              {FIELD_OPTIONS.map((option) => {
                const active = config.fields.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleField(option.value)}
                    aria-pressed={active}
                  >
                    <Badge variant={active ? "default" : "outline"} className="cursor-pointer font-normal">
                      {option.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The model may only use these facts. Anything it cannot verify is never invented.
            </p>
          </section>

          <Separator />

          {/* Fallback */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">If personalization is not available</h3>
            <Select
              value={config.fallbackMode}
              onValueChange={(value) => patch({ fallbackMode: value as never })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FALLBACK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {FALLBACK_OPTIONS.find((o) => o.value === config.fallbackMode)?.hint}
            </p>
            {config.fallbackMode === "fallback_text" ? (
              <Textarea
                rows={2}
                value={config.fallbackText}
                onChange={(e) => patch({ fallbackText: e.target.value })}
              />
            ) : null}
          </section>

          <Separator />

          {/* Preview */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Preview on a real lead</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPreview.mutate()}
                disabled={testPreview.isPending || !sampleLeadId}
              >
                {testPreview.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5" />
                )}
                Try it
              </Button>
            </div>
            <div className="min-h-16 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
              {preview ?? (
                <span className="text-muted-foreground">
                  {sampleLeadId
                    ? "Run a preview to see the exact line this campaign would write."
                    : "Add leads to this campaign to preview personalization."}
                </span>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[11px] text-muted-foreground">
            Snippets are reused across steps, so follow-ups stay consistent.
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Save settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
