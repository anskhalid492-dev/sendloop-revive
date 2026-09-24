/**
 * AI provider connections for a workspace (OpenAI and/or Anthropic's Claude).
 *
 * MunchReach does not supply AI credits: the customer connects their own keys,
 * is billed by the provider directly, and can disconnect any of them at any
 * time. Keys are stored encrypted server-side and never returned to the browser.
 * A workspace can keep one key per provider, so campaigns can choose which one
 * generates their personalization.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiModelPicker } from "@/components/campaign/AiModelPicker";
import {
  deleteWorkspaceAiKeyFn,
  listWorkspaceAiKeys,
  saveWorkspaceAiKeyFn,
} from "@/lib/ai-keys.functions";
import { AI_PROVIDERS, aiProvider, type AiProviderId } from "@/lib/ai-providers";

export function AiKeyCard({ workspaceId }: { workspaceId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const fetchKeys = useServerFn(listWorkspaceAiKeys);
  const saveKey = useServerFn(saveWorkspaceAiKeyFn);
  const removeKey = useServerFn(deleteWorkspaceAiKeyFn);

  const [providerId, setProviderId] = useState<AiProviderId>("openai");
  const [apiKey, setApiKey] = useState("");

  const meta = aiProvider(providerId);

  // Same shape check the server runs, so the button state matches the outcome.
  const trimmedKey = apiKey.trim();
  const keyLooksValid = meta.keyPattern.test(trimmedKey);
  const keyError = trimmedKey.length === 0 || keyLooksValid ? null : meta.keyHint;

  const keysQuery = useQuery({
    queryKey: ["workspace-ai-keys", workspaceId],
    queryFn: () => fetchKeys({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const connections = (keysQuery.data ?? []).filter((row) => row.connected);
  const current = connections.find((row) => row.provider === providerId) ?? null;

  const chooseProvider = (next: AiProviderId) => {
    setProviderId(next);
    setApiKey("");
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspace-ai-keys", workspaceId] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveKey({
        data: { workspaceId: workspaceId!, apiKey: apiKey.trim(), provider: providerId },
      }),
    onSuccess: async () => {
      setApiKey("");
      toast.success(`${meta.label} connected — now choose a model`);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["ai-provider-models", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: (provider: AiProviderId) =>
      removeKey({ data: { workspaceId: workspaceId!, provider } }),
    onSuccess: async () => {
      toast.success("AI key removed");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Your AI connections
          </CardTitle>
          <CardDescription>
            Personalization runs on your own OpenAI or Claude account, so you control the model and
            pay the provider directly. Connect both if you like — each campaign picks which one to
            use. Keys are encrypted and never shown again after saving.
          </CardDescription>
        </div>
        {connections.length ? (
          <Badge
            variant="outline"
            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
          >
            {connections.length} connected
          </Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {connections.map((row) => (
          <div
            key={row.provider}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4 text-sm"
          >
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2
                  className={
                    row.status === "verified"
                      ? "h-4 w-4 text-emerald-600"
                      : "h-4 w-4 text-destructive"
                  }
                />
                {row.providerLabel} connected — key ending •••• {row.last4 ?? "----"}
              </p>
              {row.lastError ? <p className="text-destructive">{row.lastError}</p> : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => disconnect.mutate(row.provider)}
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
        ))}

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
            You can connect one key per provider. Saving a key again only replaces that provider&apos;s
            key.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-key">{current ? "Replace API key" : meta.keyLabel}</Label>
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
          <p className="text-xs text-muted-foreground">
            After the key is verified, MunchReach loads the models your {meta.vendor} account can use.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={!workspaceId || !keyLooksValid || save.isPending}
          >
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {current ? `Update ${meta.label} key` : `Connect ${meta.label} key`}
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
