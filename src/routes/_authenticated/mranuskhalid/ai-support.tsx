import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/app/admin/OutreachUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteMunchmateKnowledge,
  getMunchmateAdmin,
  refreshMunchmateKnowledge,
  saveMunchmateAdmin,
  setMunchmateKnowledgeEnabled,
  testMunchmateConnection,
  upsertMunchmateKnowledge,
  type MunchmateConfig,
} from "@/lib/munchmate.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/ai-support")({
  head: () => ({
    meta: [
      { title: "AI Support Settings — MunchReach Admin" },
      { name: "description", content: "Configure MunchMate, the MunchReach AI support assistant, and its public knowledge base." },
      { property: "og:title", content: "AI Support Settings — MunchReach Admin" },
      { property: "og:description", content: "MunchMate provider, model, instructions and knowledge base." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiSupportSettings,
});

function AiSupportSettings() {
  const qc = useQueryClient();
  const load = useServerFn(getMunchmateAdmin);
  const save = useServerFn(saveMunchmateAdmin);
  const test = useServerFn(testMunchmateConnection);
  const refresh = useServerFn(refreshMunchmateKnowledge);
  const upsert = useServerFn(upsertMunchmateKnowledge);
  const toggle = useServerFn(setMunchmateKnowledgeEnabled);
  const remove = useServerFn(deleteMunchmateKnowledge);

  const q = useQuery({ queryKey: ["munchmate-admin"], queryFn: () => load() });
  const [cfg, setCfg] = useState<MunchmateConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState({ title: "", url: "", content: "" });

  useEffect(() => {
    if (q.data && !cfg) setCfg(q.data.config);
  }, [q.data, cfg]);

  const saveM = useMutation({
    mutationFn: () => save({ data: { config: cfg!, apiKey: apiKey || undefined } }),
    onSuccess: () => {
      setApiKey("");
      toast.success("MunchMate settings saved");
      void qc.invalidateQueries({ queryKey: ["munchmate-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testM = useMutation({
    mutationFn: () => test({ data: { provider: cfg!.provider, apiKey: apiKey || undefined, model: cfg!.model || undefined } }),
    onSuccess: (r) => {
      setModels(r.models);
      (r.ok ? toast.success : toast.error)(r.message);
    },
  });
  const refreshM = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      toast.success(`Indexed ${r.indexed} public items, removed ${r.removed} outdated`);
      void qc.invalidateQueries({ queryKey: ["munchmate-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addM = useMutation({
    mutationFn: () => upsert({ data: { title: draft.title, url: draft.url || null, content: draft.content } }),
    onSuccess: () => {
      setDraft({ title: "", url: "", content: "" });
      toast.success("Knowledge article added");
      void qc.invalidateQueries({ queryKey: ["munchmate-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !cfg) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const key = q.data!.key;
  const knowledge = q.data!.knowledge.filter((k) =>
    `${k.title} ${k.source}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const set = <K extends keyof MunchmateConfig>(k: K, v: MunchmateConfig[K]) => setCfg({ ...cfg, [k]: v });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="AI Support Settings"
        description="MunchMate answers public website and product-navigation questions from approved public knowledge only. It cannot see customer accounts."
      />

      <section className="surface-card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">MunchMate</h2>
            <p className="text-xs text-muted-foreground">Show the assistant on the website and dashboard.</p>
          </div>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Enable MunchMate" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mm-provider">AI provider</Label>
            <select
              id="mm-provider"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={cfg.provider}
              onChange={(e) => {
                setModels([]);
                setCfg({ ...cfg, provider: e.target.value as MunchmateConfig["provider"], model: "" });
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic Claude</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mm-key">API key</Label>
            <Input
              id="mm-key"
              type="password"
              autoComplete="off"
              placeholder={key.saved ? `Saved (…${key.last4}, ${key.provider}). Enter to replace` : "Paste API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {key.saved && key.provider !== cfg.provider ? (
              <p className="text-xs text-amber-600">The saved key is for {key.provider}. Enter a {cfg.provider} key.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mm-model">Model</Label>
            <Input id="mm-model" list="mm-models" value={cfg.model} onChange={(e) => set("model", e.target.value)} placeholder="Test connection to list models" />
            <datalist id="mm-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mm-max">Max response tokens</Label>
              <Input id="mm-max" type="number" min={100} max={2000} value={cfg.maxTokens} onChange={(e) => set("maxTokens", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mm-temp">Temperature</Label>
              <Input id="mm-temp" type="number" step={0.1} min={0} max={1} value={cfg.temperature} onChange={(e) => set("temperature", Number(e.target.value))} />
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mm-instr">Assistant instructions (tone and style)</Label>
          <Textarea id="mm-instr" rows={4} value={cfg.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Optional. Safety and privacy rules always apply and cannot be overridden." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mm-fallback">Fallback message</Label>
          <Input id="mm-fallback" value={cfg.fallbackMessage} onChange={(e) => set("fallbackMessage", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mm-pages">Approved public pages to index (one path per line)</Label>
          <Textarea id="mm-pages" rows={4} value={cfg.pages.join("\n")} onChange={(e) => set("pages", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>Save settings</Button>
          <Button variant="outline" onClick={() => testM.mutate()} disabled={testM.isPending}>
            {testM.isPending ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </section>

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Knowledge base</h2>
            <p className="text-xs text-muted-foreground">Help Center, published blog posts, FAQs, public plans, approved pages and your custom answers.</p>
          </div>
          <Button variant="outline" onClick={() => refreshM.mutate()} disabled={refreshM.isPending}>
            {refreshM.isPending ? "Refreshing…" : "Refresh index"}
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Add custom answer</p>
          <Input placeholder="Title or question" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Input placeholder="Link (optional, e.g. /help-center/…)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <Textarea rows={3} placeholder="Answer" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          <Button size="sm" onClick={() => addM.mutate()} disabled={addM.isPending || draft.title.length < 3 || draft.content.length < 10}>Add</Button>
        </div>

        <Input placeholder="Filter knowledge…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <p className="text-xs text-muted-foreground">{q.data!.knowledge.length} items indexed</p>
        <ul className="max-h-[520px] divide-y divide-border overflow-auto rounded-lg border border-border">
          {knowledge.map((k) => (
            <li key={k.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="w-16 shrink-0 text-xs uppercase text-muted-foreground">{k.source}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{k.title}</p>
                {k.url ? <p className="truncate text-xs text-muted-foreground">{k.url}</p> : null}
              </div>
              <Switch
                checked={k.enabled}
                aria-label={`Use ${k.title}`}
                onCheckedChange={async (v) => {
                  await toggle({ data: { id: k.id, enabled: v } });
                  void qc.invalidateQueries({ queryKey: ["munchmate-admin"] });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`Remove "${k.title}" from MunchMate?`)) return;
                  await remove({ data: { id: k.id } });
                  void qc.invalidateQueries({ queryKey: ["munchmate-admin"] });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
