/** Admin → AI Provider. The API key is write-only; the server returns only a masked flag. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SALES_AGENT_AI_PROVIDERS,
  SALES_AGENT_MODEL_PLACEHOLDER,
  SALES_AGENT_PROVIDER_LABEL,
  type SalesAgentAiProvider,
  type SalesAgentProviderStatus,
} from "@/lib/sales-agent-provider";
import {
  getSalesAgentProvider,
  removeSalesAgentProviderKey,
  saveSalesAgentProvider,
  testSalesAgentProvider,
} from "@/lib/sales-agent-provider.functions";

const STATUS: Record<SalesAgentProviderStatus, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  not_configured: { label: "Not configured", variant: "outline" },
  configured: { label: "Configured", variant: "secondary" },
  test_ok: { label: "Connection test successful", variant: "default" },
  test_failed: { label: "Connection test failed", variant: "destructive" },
};

export function SalesAgentProviderSettings() {
  const qc = useQueryClient();
  const load = useServerFn(getSalesAgentProvider);
  const save = useServerFn(saveSalesAgentProvider);
  const remove = useServerFn(removeSalesAgentProviderKey);
  const test = useServerFn(testSalesAgentProvider);
  const q = useQuery({ queryKey: ["admin", "sales-agent-provider"], queryFn: () => load() });
  const view = q.data;

  const [provider, setProvider] = useState<SalesAgentAiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "remove">(null);
  const [confirm, setConfirm] = useState(false);
  const [lastTest, setLastTest] = useState<string | null>(null);

  useEffect(() => {
    if (!view) return;
    if (view.provider) setProvider(view.provider);
    setModel(view.model);
  }, [view]);

  const providerChanged = Boolean(view?.provider && view.provider !== provider);
  const needsKey = !view?.hasKey || providerChanged;
  const refresh = (v: unknown) => qc.setQueryData(["admin", "sales-agent-provider"], v);

  async function onSave() {
    setBusy("save");
    try {
      refresh(await save({ data: { provider, model, apiKey: apiKey || null } }));
      setApiKey("");
      setLastTest(null);
      toast.success("AI provider saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }
  async function onTest() {
    setBusy("test");
    try {
      const r = await test();
      setLastTest(`${r.message}${r.latencyMs ? ` (${r.latencyMs} ms)` : ""}`);
      (r.ok ? toast.success : toast.error)(r.message);
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(null);
    }
  }
  async function onRemove() {
    setBusy("remove");
    try {
      refresh(await remove());
      setLastTest(null);
      toast.success("API key removed. The AI Sales Agent is now unavailable.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove key.");
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) return <p className="text-sm text-destructive">Could not load AI provider settings.</p>;
  const status = STATUS[view?.status ?? "not_configured"];

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">MunchReach AI provider</CardTitle>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as SalesAgentAiProvider)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SALES_AGENT_AI_PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>{SALES_AGENT_PROVIDER_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {providerChanged && <p className="text-xs text-muted-foreground">Switching provider requires a new API key for {SALES_AGENT_PROVIDER_LABEL[provider]}.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-key">API key</Label>
          <Input
            id="ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={view?.hasKey && !providerChanged ? view.maskedKey ?? "" : "Paste API key"}
          />
          <p className="text-xs text-muted-foreground">Stored encrypted on the server. It is never shown again. Leave blank to keep the saved key.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-model">Model</Label>
          <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={SALES_AGENT_MODEL_PLACEHOLDER[provider]} />
        </div>
        {(lastTest || view?.lastError) && <p className="text-sm text-muted-foreground">{lastTest ?? view?.lastError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={busy !== null || !model.trim() || (needsKey && !apiKey.trim())}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={onTest} disabled={busy !== null || !view?.hasKey}>
            {busy === "test" ? "Testing…" : "Test Connection"}
          </Button>
          <Button variant="destructive" onClick={() => setConfirm(true)} disabled={busy !== null || !view?.hasKey}>
            Remove API Key
          </Button>
        </div>
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the API key?</AlertDialogTitle>
            <AlertDialogDescription>
              AI Decision and Generate AI Reply will stop calling AI and route to their fallback / human-review paths until a new key is saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Remove key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
