/**
 * Live AI model picker for one provider (ChatGPT or Claude).
 *
 * The list is exactly what the provider's Models API returns for the
 * workspace's own key — fetched server-side, the key never reaches the browser.
 * Two modes:
 *  - connection mode (no `value`/`onChange`): picking saves the workspace's
 *    model for that provider.
 *  - controlled mode: the parent (e.g. a campaign's AI settings) owns the value.
 * A saved model the key no longer offers is flagged, never silently replaced.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAiProviderModels, selectAiProviderModel } from "@/lib/ai-keys.functions";
import { aiProvider, type AiModelInfo, type AiProviderId } from "@/lib/ai-providers";

function formatTokens(n: number | null): string | null {
  if (!n) return null;
  return n >= 1000 ? `${Math.round(n / 1000).toLocaleString()}K` : n.toLocaleString();
}

function modelDetail(m: AiModelInfo): string {
  const bits: string[] = [];
  if (m.displayName !== m.id) bits.push(m.id);
  const ctx = formatTokens(m.contextWindow);
  if (ctx) bits.push(`${ctx} context`);
  const out = formatTokens(m.maxOutputTokens);
  if (out) bits.push(`${out} max output`);
  if (m.capabilities.length) bits.push(m.capabilities.slice(0, 3).join(", "));
  return bits.join(" · ");
}

export function aiModelsQueryKey(workspaceId: string | null | undefined, provider: AiProviderId) {
  return ["ai-provider-models", workspaceId, provider] as const;
}

export function AiModelPicker({
  workspaceId,
  provider,
  value,
  onChange,
  label = "AI model",
  allowConnectionDefault = false,
}: {
  workspaceId: string | null | undefined;
  provider: AiProviderId;
  /** Controlled mode: campaign-level model id (null = connection's model). */
  value?: string | null;
  onChange?: (model: string | null) => void;
  label?: string;
  /** Controlled mode: offer "use the connection's model" as an option. */
  allowConnectionDefault?: boolean;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAiProviderModels);
  const selectFn = useServerFn(selectAiProviderModel);
  const meta = aiProvider(provider);
  const controlled = typeof onChange === "function";

  const query = useQuery({
    queryKey: aiModelsQueryKey(workspaceId, provider),
    queryFn: () => listFn({ data: { workspaceId: workspaceId!, provider } }),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (model: string) =>
      selectFn({ data: { workspaceId: workspaceId!, provider, model } }),
    onSuccess: async (_r, model) => {
      toast.success(`${meta.label} will now use ${model}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-ai-keys", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: aiModelsQueryKey(workspaceId, provider) }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const result = query.data;
  const models = result?.ok ? result.models : [];
  const connectionModel = result?.selectedModel ?? "";
  const current = controlled ? (value ?? "") : connectionModel;
  const effective = current || (controlled && allowConnectionDefault ? connectionModel : "");
  const unavailable =
    Boolean(effective) && result?.ok === true && !models.some((m) => m.id === effective);
  const DEFAULT = "__connection_default__";

  const refresh = () => query.refetch();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={refresh}
          disabled={!workspaceId || query.isFetching}
        >
          {query.isFetching ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" />
          )}
          Refresh models
        </Button>
      </div>

      {query.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading models from {meta.vendor}…
        </p>
      ) : query.error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {(query.error as Error).message}
        </p>
      ) : result && !result.ok ? (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {result.message}
        </p>
      ) : (
        <>
          <Select
            value={controlled && !value && allowConnectionDefault ? DEFAULT : current}
            onValueChange={(next) => {
              if (controlled) onChange!(next === DEFAULT ? null : next);
              else save.mutate(next);
            }}
            disabled={save.isPending || models.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={models.length ? "Choose a model" : "No models returned"} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {controlled && allowConnectionDefault ? (
                <SelectItem value={DEFAULT}>
                  Connection default{connectionModel ? ` (${connectionModel})` : " — none selected"}
                </SelectItem>
              ) : null}
              {current && unavailable ? (
                <SelectItem value={current} disabled>
                  {current} — no longer available
                </SelectItem>
              ) : null}
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex flex-col">
                    <span>{m.displayName}</span>
                    {modelDetail(m) ? (
                      <span className="text-[11px] text-muted-foreground">{modelDetail(m)}</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {unavailable ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              “{effective}” is no longer available to your {meta.vendor} key. Choose another model —
              generation is paused until you do.
            </p>
          ) : !effective && models.length ? (
            <p className="text-xs text-amber-700">
              No model selected yet. Pick one — MunchReach never chooses a model for you.
            </p>
          ) : null}
          {result?.ok ? (
            <p className="text-[11px] text-muted-foreground">
              {models.length} model{models.length === 1 ? "" : "s"} available to your {meta.vendor}{" "}
              key
              {result.hiddenCount
                ? ` (${result.hiddenCount} non-text models such as embeddings or audio hidden)`
                : ""}
              .
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
