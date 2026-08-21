/**
 * AI personalization tab of the campaign builder.
 *
 * Customers configure instructions, tone and fallbacks here, preview real
 * output against their own leads, and generate personalization for the whole
 * recipient list. Generation runs server-side in the background queue.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AI_TOKEN,
  FALLBACK_OPTIONS,
  FIELD_OPTIONS,
  LENGTH_OPTIONS,
  LEVEL_OPTIONS,
  PRESET_INSTRUCTIONS,
  TONE_OPTIONS,
  defaultAiConfig,
  usesAiToken,
  type AiPersonalizationConfig,
  type PersonalizationField,
  type PersonalizationTone,
} from "@/lib/ai-personalization-model";
import {
  getAiPersonalizationStats,
  getAiSettings,
  listAiPersonalizations,
  previewAiPersonalization,
  queueAiPersonalization,
  retryFailedAiPersonalizations,
  saveAiSettings,
  updateAiPersonalization,
} from "@/lib/ai-personalization.functions";
import { cn } from "@/lib/utils";
import { useSelectedWorkspaceId } from "@/hooks/useWorkspace";
import { AiKeyCard } from "./AiKeyCard";
import type { CampaignBuilder } from "./useCampaignBuilder";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  queued: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  processing: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

export function AiTab({ builder }: { builder: CampaignBuilder }) {
  const { campaignId, steps, leads } = builder;
  const workspaceId = useSelectedWorkspaceId();
  const queryClient = useQueryClient();

  const fetchSettings = useServerFn(getAiSettings);
  const fetchStats = useServerFn(getAiPersonalizationStats);
  const fetchRows = useServerFn(listAiPersonalizations);
  const saveFn = useServerFn(saveAiSettings);
  const previewFn = useServerFn(previewAiPersonalization);
  const queueFn = useServerFn(queueAiPersonalization);
  const retryFn = useServerFn(retryFailedAiPersonalizations);
  const updateFn = useServerFn(updateAiPersonalization);

  const settingsQuery = useQuery({
    queryKey: ["campaign-ai-settings", campaignId],
    queryFn: () => fetchSettings({ data: { campaignId } }),
  });

  const statsQuery = useQuery({
    queryKey: ["campaign-ai-stats", campaignId],
    queryFn: () => fetchStats({ data: { campaignId } }),
    // Poll while the background queue still has work to do.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.queued > 0 ? 4000 : false;
    },
  });

  const rowsQuery = useQuery({
    queryKey: ["campaign-ai-rows", campaignId],
    queryFn: () => fetchRows({ data: { campaignId, limit: 50 } }),
    refetchInterval: (query) => (statsQuery.data?.queued ? 5000 : false),
  });

  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AiPersonalizationConfig>(defaultAiConfig);
  const [hydrated, setHydrated] = useState(false);
  const [previewLeadId, setPreviewLeadId] = useState<string>("");
  const [preview, setPreview] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

  useEffect(() => {
    if (!settingsQuery.data || hydrated) return;
    setEnabled(settingsQuery.data.enabled);
    setConfig(settingsQuery.data.config);
    setHydrated(true);
  }, [settingsQuery.data, hydrated]);

  const patch = (partial: Partial<AiPersonalizationConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial }));

  const leadOptions = useMemo(
    () =>
      leads
        .filter((r) => r.lead)
        .slice(0, 100)
        .map((r) => ({
          id: r.lead!.id,
          label:
            [r.lead!.first_name, r.lead!.last_name].filter(Boolean).join(" ").trim() ||
            r.lead!.email,
          sub: r.lead!.company ?? r.lead!.email,
        })),
    [leads],
  );

  useEffect(() => {
    if (!previewLeadId && leadOptions[0]) setPreviewLeadId(leadOptions[0].id);
  }, [leadOptions, previewLeadId]);

  const tokenUsed = useMemo(
    () => steps.some((s) => usesAiToken(s.subject) || usesAiToken(s.body)),
    [steps],
  );

  const save = useMutation({
    mutationFn: () => saveFn({ data: { campaignId, enabled, config } }),
    onSuccess: async () => {
      toast.success("AI personalization settings saved");
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-settings", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-stats", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runPreview = useMutation({
    mutationFn: () => previewFn({ data: { campaignId, leadId: previewLeadId, config } }),
    onSuccess: (result) => {
      setPreview(
        result.ok
          ? { ok: true, text: result.content }
          : { ok: false, text: result.message },
      );
    },
    onError: (error: Error) => setPreview({ ok: false, text: error.message }),
  });

  const generate = useMutation({
    mutationFn: (regenerate: boolean) =>
      queueFn({ data: { campaignId, regenerate } }),
    onSuccess: async (result) => {
      toast.success(
        result.queued
          ? `${result.queued} lead${result.queued === 1 ? "" : "s"} queued for personalization`
          : "Everything is already personalized",
        result.reused ? { description: `${result.reused} reused from earlier runs` } : undefined,
      );
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-stats", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-rows", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retry = useMutation({
    mutationFn: () => retryFn({ data: { campaignId } }),
    onSuccess: async (result) => {
      toast.success(`${result.requeued} failed item${result.requeued === 1 ? "" : "s"} requeued`);
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-stats", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-rows", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveEdit = useMutation({
    mutationFn: (payload: { id: string; content: string }) => updateFn({ data: payload }),
    onSuccess: async () => {
      setEditing(null);
      toast.success("Personalization updated");
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-rows", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-ai-stats", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stats = statsQuery.data;
  const progress = stats && stats.eligible ? Math.round((stats.personalized / stats.eligible) * 100) : 0;

  const toggleField = (field: PersonalizationField) =>
    patch({
      fields: config.fields.includes(field)
        ? config.fields.filter((f) => f !== field)
        : [...config.fields, field],
    });

  return (
    <div className="space-y-6">
      <AiKeyCard workspaceId={workspaceId} />
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI personalization
            </CardTitle>
            <CardDescription>
              Write a unique opening line for every lead, generated from the data on their record.
              Powered by your own OpenAI key, so you stay in control of the model and the cost.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="ai-enabled" className="text-sm text-muted-foreground">
              {enabled ? "On" : "Off"}
            </Label>
            <Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Use it in your emails</p>
            <p className="mt-1 text-muted-foreground">
              Insert{" "}
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">{`{{${AI_TOKEN}}}`}</code>{" "}
              anywhere in a subject or body. Each lead gets their own generated text.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(`{{${AI_TOKEN}}}`);
                  toast.success("Variable copied");
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy variable
              </Button>
              {enabled && !tokenUsed ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Not used in your sequence yet
                </span>
              ) : null}
            </div>
          </div>

          <Tabs defaultValue="setup">
            <TabsList>
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="space-y-6 pt-4">
              <div className="grid gap-4 md:grid-cols-3">
                {LEVEL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patch({ level: option.value })}
                    className={cn(
                      "rounded-lg border p-4 text-left transition",
                      config.level === option.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:border-primary/40",
                    )}
                  >
                    <span className="flex items-center justify-between text-sm font-medium">
                      {option.label}
                      {config.level === option.value ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-instructions">Instructions</Label>
                  <Select
                    value={config.tone}
                    onValueChange={(value) => {
                      const tone = value as PersonalizationTone;
                      patch({ tone, instructions: PRESET_INSTRUCTIONS[tone] });
                    }}
                  >
                    <SelectTrigger className="h-8 w-[190px] text-xs">
                      <Wand2 className="mr-2 h-3.5 w-3.5" />
                      <SelectValue placeholder="Use a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} preset
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  id="ai-instructions"
                  rows={5}
                  value={config.instructions}
                  onChange={(event) => patch({ instructions: event.target.value })}
                  placeholder="Tell the AI what to write about, e.g. reference their role and what our product does for teams like theirs."
                />
                <p className="text-xs text-muted-foreground">
                  The AI only uses the lead fields you select below — it never invents company news
                  or facts.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select
                    value={config.tone}
                    onValueChange={(value) => patch({ tone: value as PersonalizationTone })}
                  >
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
                </div>
                <div className="space-y-2">
                  <Label>Length</Label>
                  <Select
                    value={config.length}
                    onValueChange={(value) =>
                      patch({ length: value as AiPersonalizationConfig["length"] })
                    }
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
                <div className="space-y-2">
                  <Label htmlFor="ai-language">Language</Label>
                  <Input
                    id="ai-language"
                    value={config.language}
                    onChange={(event) => patch({ language: event.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Lead data the AI may use</Label>
                <div className="flex flex-wrap gap-2">
                  {FIELD_OPTIONS.map((option) => {
                    const active = config.fields.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleField(option.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <Label>If a lead can't be personalized</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  {FALLBACK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => patch({ fallbackMode: option.value })}
                      className={cn(
                        "rounded-lg border p-3 text-left text-sm transition",
                        config.fallbackMode === option.value
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/40",
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
                    </button>
                  ))}
                </div>
                {config.fallbackMode === "fallback_text" ? (
                  <Input
                    value={config.fallbackText}
                    onChange={(event) => patch({ fallbackText: event.target.value })}
                    placeholder="Fallback sentence used when personalization isn't available"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-example">Example output (optional)</Label>
                <Textarea
                  id="ai-example"
                  rows={3}
                  value={config.exampleOutput}
                  onChange={(event) => patch({ exampleOutput: event.target.value })}
                  placeholder="Paste a line you love. The AI copies the style, not the facts."
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save settings
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 pt-4">
              {leadOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add leads to this campaign to preview real personalization.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[240px] space-y-2">
                      <Label>Preview lead</Label>
                      <Select value={previewLeadId} onValueChange={setPreviewLeadId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {leadOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label} — {option.sub}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => runPreview.mutate()}
                      disabled={runPreview.isPending || !previewLeadId}
                    >
                      {runPreview.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Generate preview
                    </Button>
                  </div>
                  {preview ? (
                    <div
                      className={cn(
                        "rounded-lg border p-4 text-sm",
                        preview.ok ? "bg-muted/40" : "border-destructive/30 bg-destructive/5",
                      )}
                    >
                      {preview.ok ? (
                        <p className="leading-relaxed">{preview.text}</p>
                      ) : (
                        <p className="flex items-start gap-2 text-destructive">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          {preview.text}
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </TabsContent>

            <TabsContent value="results" className="space-y-4 pt-4">
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {stats?.personalized ?? 0} of {stats?.eligible ?? 0} leads personalized
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats?.queued ?? 0} in progress · {stats?.failed ?? 0} failed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => generate.mutate(false)}
                      disabled={generate.isPending}
                    >
                      {generate.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Generate for all leads
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => generate.mutate(true)}
                      disabled={generate.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate all
                    </Button>
                    {stats?.failed ? (
                      <Button variant="ghost" onClick={() => retry.mutate()} disabled={retry.isPending}>
                        Retry failed
                      </Button>
                    ) : null}
                  </div>
                </div>
                <Progress value={progress} className="mt-4 h-2" />
                {stats?.paused ? (
                  <p className="mt-3 flex items-start gap-2 text-xs text-amber-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Personalization is paused: {stats.paused}
                  </p>
                ) : null}
              </div>

              <div className="divide-y rounded-lg border">
                {(rowsQuery.data ?? []).length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nothing generated yet. Save your settings, then generate for all leads.
                  </p>
                ) : (
                  (rowsQuery.data ?? []).map((row) => (
                    <div key={row.id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">
                          {row.lead?.name ?? "Lead"}
                          {row.lead?.company ? (
                            <span className="text-muted-foreground"> · {row.lead.company}</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {row.edited ? (
                            <Badge variant="outline" className="text-xs">
                              Edited
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[row.status])}>
                            {row.status}
                          </Badge>
                        </div>
                      </div>
                      {editing?.id === row.id ? (
                        <div className="space-y-2">
                          <Textarea
                            rows={3}
                            value={editing.content}
                            onChange={(event) =>
                              setEditing({ id: row.id, content: event.target.value })
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEdit.mutate(editing)}
                              disabled={saveEdit.isPending || !editing.content.trim()}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {row.content ? (
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {row.content}
                            </p>
                          ) : null}
                          {row.error ? (
                            <p className="text-xs text-destructive">{row.error}</p>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditing({ id: row.id, content: row.content ?? "" })}
                          >
                            Edit text
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
