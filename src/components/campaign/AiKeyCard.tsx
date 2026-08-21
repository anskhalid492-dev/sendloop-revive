/**
 * OpenAI key connection for a workspace.
 *
 * MunchReach does not supply AI credits: the customer connects their own
 * OpenAI key, is billed by OpenAI directly, and can disconnect at any time.
 * The key is stored encrypted server-side and never returned to the browser.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
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

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini — fastest, lowest cost" },
  { value: "gpt-4o", label: "GPT-4o — highest quality" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini — balanced" },
  { value: "gpt-4.1", label: "GPT-4.1 — long instructions" },
];

export function AiKeyCard({ workspaceId }: { workspaceId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const fetchKey = useServerFn(getWorkspaceAiKey);
  const saveKey = useServerFn(saveWorkspaceAiKeyFn);
  const removeKey = useServerFn(deleteWorkspaceAiKeyFn);

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");

  const keyQuery = useQuery({
    queryKey: ["workspace-ai-key", workspaceId],
    queryFn: () => fetchKey({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const info = keyQuery.data;

  const save = useMutation({
    mutationFn: () => saveKey({ data: { workspaceId: workspaceId!, apiKey: apiKey.trim(), model } }),
    onSuccess: async (result) => {
      setApiKey("");
      if (result.status === "verified") toast.success("OpenAI key connected");
      else toast.error(result.lastError ?? "Key saved but could not be verified");
      await queryClient.invalidateQueries({ queryKey: ["workspace-ai-key", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: () => removeKey({ data: { workspaceId: workspaceId! } }),
    onSuccess: async () => {
      toast.success("OpenAI key removed");
      await queryClient.invalidateQueries({ queryKey: ["workspace-ai-key", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Your OpenAI connection
          </CardTitle>
          <CardDescription>
            Personalization runs on your own OpenAI account, so you control the model and pay OpenAI
            directly. Your key is encrypted and never shown again after saving.
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
                Key ending •••• {info.last4 ?? "----"}
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

        <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
          <div className="space-y-2">
            <Label htmlFor="openai-key">
              {info?.connected ? "Replace API key" : "OpenAI API key"}
            </Label>
            <Input
              id="openai-key"
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="openai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((option) => (
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
            disabled={!workspaceId || apiKey.trim().length < 20 || save.isPending}
          >
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {info?.connected ? "Update key" : "Connect key"}
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              Get an API key
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
