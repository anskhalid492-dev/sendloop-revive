/**
 * AI provider connection for a workspace (OpenAI or Anthropic's Claude).
 *
 * MunchReach does not supply AI credits: the customer connects their own key,
 * is billed by the provider directly, and can disconnect at any time. The key
 * is stored encrypted server-side and never returned to the browser.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteWorkspaceAiKeyFn,
  getWorkspaceAiKey,
  saveWorkspaceAiKeyFn,
} from "@/lib/ai-keys.functions";
import { AI_PROVIDERS, aiProvider, resolveAiModel, type AiProviderId } from "@/lib/ai-providers";

export function AiKeyCard({ workspaceId }: { workspaceId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const fetchKey = useServerFn(getWorkspaceAiKey);
  const saveKey = useServerFn(saveWorkspaceAiKeyFn);
  const removeKey = useServerFn(deleteWorkspaceAiKeyFn);

  const [providerId, setProviderId] = useState<AiProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(aiProvider("openai").defaultModel);

  const meta = aiProvider(providerId);

  // Same shape check the server runs, so the button state matches the outcome.
  const trimmedKey = apiKey.trim();
  const keyLooksValid = meta.keyPattern.test(trimmedKey);
  const keyError = trimmedKey.length === 0 || keyLooksValid ? null : meta.keyHint;

  const keyQuery = useQuery({
    queryKey: ["workspace-ai-key", workspaceId],
    queryFn: () => fetchKey({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const info = keyQuery.data;

  useEffect(() => {
    if (!info?.connected) return;
    const stored = (info.provider as AiProviderId) ?? "openai";
    setProviderId(stored);
    setModel(resolveAiModel(stored, info.model));
  }, [info?.connected, info?.provider, info?.model]);

  const chooseProvider = (next: AiProviderId) => {
    setProviderId(next);
    setModel(aiProvider(next).defaultModel);
    setApiKey("");
  };

  const save = useMutation({
    mutationFn: () =>
      saveKey({
        data: { workspaceId: workspaceId!, apiKey: apiKey.trim(), model, provider: providerId },
      }),
    onSuccess: async () => {
      setApiKey("");
      toast.success(`${meta.label} connected`);
      await queryClient.invalidateQueries({ queryKey: ["workspace-ai-key", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: () => removeKey({ data: { workspaceId: workspaceId! } }),
    onSuccess: async () => {
      toast.success("AI key removed");
      await queryClient.invalidateQueries({ queryKey: ["workspace-ai-key", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectedLabel = aiProvider(info?.provider).label;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Your AI connection
          </CardTitle>
          <CardDescription>
            Personalization runs on your own OpenAI or Claude account, so you control the model and
            pay the provider directly. Your key is encrypted and never shown again after saving.
          </CardDescription>
        </div>
        {info?.connected ? (
          <Badge
            variant="outline"
            className={
              info.status === "verified"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                : "border-destructive/20 bg-destructive/10 text-destructive"
            }
          >
            {info.status === "verified" ? "Connected" : "Needs attention"}
          </Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {info?.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {connectedLabel} connected — key ending •••• {info.last4 ?? "----"}
              </p>
              <p className="text-muted-foreground">
                Model: {info.model}
                {info.lastError ? ` — ${info.lastError}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Disconnect
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Provider</Label>
          <div className="flex flex-wrap gap-2">
            {AI_PROVIDERS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={providerId === option.id ? "default" : "outline"}
                size="sm"
                onClick={() => chooseProvider(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            One provider is active per workspace. Switching replaces the stored key.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
          <div className="space-y-2">
            <Label htmlFor="ai-key">{info?.connected ? "Replace API key" : meta.keyLabel}</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={meta.keyPlaceholder}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            {keyError ? <p className="text-xs text-destructive">{keyError}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="ai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meta.models.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={!workspaceId || !keyLooksValid || save.isPending}
          >
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {info?.connected ? "Update key" : "Connect key"}
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href={meta.keysUrl} target="_blank" rel="noreferrer">
              Get a {meta.vendor} API key
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Encrypted at rest, used only for your campaigns.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
