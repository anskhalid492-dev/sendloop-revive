import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Eye, History, Loader2, Mail, RotateCcw, Save, Search, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_VARIABLES } from "@/lib/transactional/variables";
import {
  getTransactionalTemplate,
  listTransactionalTemplates,
  previewTransactionalTemplate,
  publishTransactionalTemplate,
  restoreAllTransactionalDefaults,
  restoreTransactionalDefault,
  rollbackTransactionalTemplate,
  runTransactionalQueueNow,
  saveTransactionalDraft,
  sendTransactionalTest,
  setTransactionalTemplateEnabled,
  updateTransactionalSettings,
} from "@/lib/transactional-email.functions";

export const Route = createFileRoute("/_authenticated/admin/system-emails")({
  head: () => ({
    meta: [
      { title: "System Emails — MunchReach Admin" },
      {
        name: "description",
        content:
          "Manage every MunchReach system email: templates, variables, previews, test sends, versions and delivery settings.",
      },
      { property: "og:title", content: "System Emails — MunchReach Admin" },
      { property: "og:description", content: "Template manager for MunchReach system emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SystemEmailsPage,
});

type TemplateRow = {
  id: string;
  event_key: string;
  name: string;
  category: string;
  enabled: boolean;
  status: string;
  version: number;
  subject: string;
  is_default: boolean;
  variables: string[];
  draft: Record<string, unknown> | null;
  updated_at: string;
};

type Draft = {
  subject: string;
  preheader: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  html: string;
  text_body: string;
};

function SystemEmailsPage() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listTransactionalTemplates);
  const fetchOne = useServerFn(getTransactionalTemplate);
  const previewFn = useServerFn(previewTransactionalTemplate);
  const saveDraftFn = useServerFn(saveTransactionalDraft);
  const publishFn = useServerFn(publishTransactionalTemplate);
  const rollbackFn = useServerFn(rollbackTransactionalTemplate);
  const restoreFn = useServerFn(restoreTransactionalDefault);
  const restoreAllFn = useServerFn(restoreAllTransactionalDefaults);
  const toggleFn = useServerFn(setTransactionalTemplateEnabled);
  const testFn = useServerFn(sendTransactionalTest);
  const settingsFn = useServerFn(updateTransactionalSettings);
  const runQueueFn = useServerFn(runTransactionalQueueNow);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");

  const listQuery = useQuery({ queryKey: ["admin", "system-emails"], queryFn: () => fetchList({}) });

  const detailQuery = useQuery({
    queryKey: ["admin", "system-emails", activeKey],
    queryFn: () => fetchOne({ data: { eventKey: activeKey! } }),
    enabled: !!activeKey,
  });

  const templates = (listQuery.data?.templates ?? []) as TemplateRow[];
  const settings = listQuery.data?.settings;
  const usage = listQuery.data?.usage ?? {};

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates],
  );

  const filtered = templates.filter((t) => {
    const matchesCategory = category === "all" || t.category === category;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || t.name.toLowerCase().includes(q) || t.event_key.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  function openEditor(eventKey: string) {
    setActiveKey(eventKey);
    setDraft(null);
  }

  const detail = detailQuery.data;
  const effectiveDraft: Draft | null = useMemo(() => {
    if (draft) return draft;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tpl = detail?.template as any;
    if (!tpl) return null;
    const source = (tpl.draft ?? tpl) as Record<string, string | null>;
    return {
      subject: String(source["subject"] ?? ""),
      preheader: String(source["preheader"] ?? ""),
      from_name: String(source["from_name"] ?? ""),
      from_email: String(source["from_email"] ?? ""),
      reply_to: String(source["reply_to"] ?? ""),
      html: String(source["html"] ?? ""),
      text_body: String(source["text_body"] ?? ""),
    };
  }, [draft, detail]);

  function draftPayload(d: Draft) {
    return {
      subject: d.subject,
      preheader: d.preheader || null,
      from_name: d.from_name || null,
      from_email: d.from_email || null,
      reply_to: d.reply_to || null,
      html: d.html,
      text_body: d.text_body || null,
    };
  }

  const saveDraft = useMutation({
    mutationFn: () => saveDraftFn({ data: { eventKey: activeKey!, draft: draftPayload(effectiveDraft!) } }),
    onSuccess: () => {
      toast.success("Draft saved");
      queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { eventKey: activeKey!, draft: draftPayload(effectiveDraft!) } }),
    onSuccess: (res) => {
      toast.success(`Published version ${res.version}`);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMutation({
    mutationFn: () =>
      previewFn({
        data: effectiveDraft ? { eventKey: activeKey!, draft: draftPayload(effectiveDraft) } : { eventKey: activeKey! },
      }),
    onSuccess: (res) => {
      if (res.errors.length > 0) toast.error(res.errors.join(" "));
      setPreviewHtml(res.rendered?.html ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: () => restoreFn({ data: { eventKey: activeKey! } }),
    onSuccess: () => {
      toast.success("Default template restored");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreAll = useMutation({
    mutationFn: () => restoreAllFn({ data: { includeCustomised: false } }),
    onSuccess: (r: { created: number; updated: number; skipped: number }) => {
      toast.success(`Refreshed ${r.updated} template${r.updated === 1 ? "" : "s"} to the latest MunchReach design`, {
        description: r.skipped ? `${r.skipped} customised template(s) left untouched.` : undefined,
      });
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: (version: number) => rollbackFn({ data: { eventKey: activeKey!, version } }),
    onSuccess: () => {
      toast.success("Rolled back");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => testFn({ data: { eventKey: activeKey!, to: testTo } }),
    onSuccess: (res) => (res.ok ? toast.success(res.message) : toast.error(res.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (vars: { eventKey: string; enabled: boolean }) => toggleFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (patch: any) => settingsFn({ data: patch }),
    onSuccess: () => {
      toast.success("Settings updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runQueue = useMutation({
    mutationFn: () => runQueueFn({}),
    onSuccess: (res) =>
      toast.success(res.skipped ? res.skipped : `Processed ${res.claimed} · sent ${res.sent} · failed ${res.failed}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Emails</h1>
          <p className="text-sm text-muted-foreground">
            Every automated email MunchReach sends to customers — templates, variables, previews and delivery.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => runQueue.mutate()} disabled={runQueue.isPending}>
            {runQueue.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            Process queue now
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/email-log">Delivery log</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="settings">Delivery settings</TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, event or subject"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={category === c ? "default" : "outline"}
                  onClick={() => setCategory(c)}
                >
                  {c === "all" ? "All" : c}
                </Button>
              ))}
            </div>
          </div>

          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading templates…
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filtered.map((t) => {
                    const stats = usage[t.event_key];
                    return (
                      <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-56 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t.name}</span>
                            {t.draft ? <Badge variant="secondary">Draft</Badge> : null}
                            {!t.is_default ? <Badge variant="outline">Customised</Badge> : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{t.event_key}</p>
                        </div>
                        <Badge variant="outline">{t.category}</Badge>
                        <span className="w-28 text-xs text-muted-foreground">v{t.version}</span>
                        <span className="w-32 text-xs text-muted-foreground">
                          {stats ? `${stats.sent} sent · ${stats.failed} failed` : "No sends (30d)"}
                        </span>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={t.enabled}
                            onCheckedChange={(enabled) => toggle.mutate({ eventKey: t.event_key, enabled })}
                            aria-label={`Enable ${t.name}`}
                          />
                          <Button size="sm" variant="outline" onClick={() => openEditor(t.event_key)}>
                            Edit
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">No templates match your filters.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Delivery settings</CardTitle>
              <CardDescription>
                System emails send through MunchReach-managed sending infrastructure. Customers never configure this.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">System emails enabled</p>
                  <p className="text-xs text-muted-foreground">Turn off to stop all automated emails.</p>
                </div>
                <Switch
                  checked={!!settings?.enabled}
                  onCheckedChange={(enabled) => saveSettings.mutate({ enabled })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Pause queue</p>
                  <p className="text-xs text-muted-foreground">Keeps queuing but stops delivery.</p>
                </div>
                <Switch checked={!!settings?.paused} onCheckedChange={(paused) => saveSettings.mutate({ paused })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Test mode</p>
                  <p className="text-xs text-muted-foreground">Redirects every email to the test recipient.</p>
                </div>
                <Switch
                  checked={!!settings?.test_mode}
                  onCheckedChange={(test_mode) => saveSettings.mutate({ test_mode })}
                />
              </div>
              <SettingField
                label="Test recipient"
                defaultValue={settings?.test_recipient ?? ""}
                onSave={(value) => saveSettings.mutate({ test_recipient: value || null })}
              />
              <SettingField
                label="From name"
                defaultValue={settings?.from_name ?? ""}
                onSave={(value) => saveSettings.mutate({ from_name: value })}
              />
              <SettingField
                label="From address"
                defaultValue={settings?.from_email ?? ""}
                onSave={(value) => saveSettings.mutate({ from_email: value })}
              />
              <SettingField
                label="Reply-to address"
                defaultValue={settings?.reply_to ?? ""}
                onSave={(value) => saveSettings.mutate({ reply_to: value })}
              />
              <SettingField
                label="Retry attempts"
                defaultValue={String(settings?.retry_count ?? 3)}
                onSave={(value) => saveSettings.mutate({ retry_count: Number(value) })}
              />
              <SettingField
                label="Retry delay (seconds)"
                defaultValue={String(settings?.retry_delay_seconds ?? 300)}
                onSave={(value) => saveSettings.mutate({ retry_delay_seconds: Number(value) })}
              />
              <SettingField
                label="Batch size per run"
                defaultValue={String(settings?.batch_size ?? 25)}
                onSave={(value) => saveSettings.mutate({ batch_size: Number(value) })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variables">
          <Card>
            <CardHeader>
              <CardTitle>Available variables</CardTitle>
              <CardDescription>
                Only these tokens render. Anything else is rejected when publishing, so templates can never execute code.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <code key={v} className="rounded bg-muted px-2 py-1 text-xs">{`{{${v}}}`}</code>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!activeKey} onOpenChange={(open) => (open ? null : (setActiveKey(null), setDraft(null)))}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-4" /> {detail?.template?.name ?? "Template"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{activeKey}</DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading || !effectiveDraft ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Subject" value={effectiveDraft.subject} onChange={(v) => setDraft({ ...effectiveDraft, subject: v })} />
                <Field label="Preheader" value={effectiveDraft.preheader} onChange={(v) => setDraft({ ...effectiveDraft, preheader: v })} />
                <Field label="From name (optional)" value={effectiveDraft.from_name} onChange={(v) => setDraft({ ...effectiveDraft, from_name: v })} />
                <Field label="From address (optional)" value={effectiveDraft.from_email} onChange={(v) => setDraft({ ...effectiveDraft, from_email: v })} />
                <Field label="Reply-to (optional)" value={effectiveDraft.reply_to} onChange={(v) => setDraft({ ...effectiveDraft, reply_to: v })} />
              </div>
              <div className="grid gap-2">
                <Label>HTML body</Label>
                <Textarea
                  value={effectiveDraft.html}
                  onChange={(e) => setDraft({ ...effectiveDraft, html: e.target.value })}
                  className="min-h-64 font-mono text-xs"
                />
              </div>
              <div className="grid gap-2">
                <Label>Plain text body (generated when empty)</Label>
                <Textarea
                  value={effectiveDraft.text_body}
                  onChange={(e) => setDraft({ ...effectiveDraft, text_body: e.target.value })}
                  className="min-h-32 font-mono text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending} variant="outline">
                  <Save className="mr-2 size-4" /> Save draft
                </Button>
                <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
                  {publish.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Publish
                </Button>
                <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending}>
                  <Eye className="mr-2 size-4" /> Preview
                </Button>
                <Button variant="outline" onClick={() => restore.mutate()} disabled={restore.isPending}>
                  <RotateCcw className="mr-2 size-4" /> Restore default
                </Button>
                <Button variant="ghost" onClick={() => restoreAll.mutate()} disabled={restoreAll.isPending}>
                  {restoreAll.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Refresh all to latest design
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                <div className="grid flex-1 gap-1">
                  <Label>Send a test email</Label>
                  <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
                </div>
                <Button onClick={() => sendTest.mutate()} disabled={!testTo || sendTest.isPending}>
                  {sendTest.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                  Send test
                </Button>
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
                  <History className="size-4" /> Version history
                </div>
                <div className="divide-y">
                  {(detail?.versions ?? []).map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        v{v.version} · <span className="text-muted-foreground">{v.subject}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.published_at).toLocaleString()}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => rollback.mutate(v.version)}>
                          <Undo2 className="mr-1 size-3" /> Roll back
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(detail?.versions ?? []).length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">No published versions yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewHtml} onOpenChange={(open) => (open ? null : setPreviewHtml(null))}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription>Rendered with sample data.</DialogDescription>
          </DialogHeader>
          <iframe
            title="Email preview"
            srcDoc={previewHtml ?? ""}
            sandbox=""
            className="h-[70vh] w-full border-0 bg-white"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SettingField({
  label,
  defaultValue,
  onSave,
}: {
  label: string;
  defaultValue: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
        <Button variant="outline" onClick={() => onSave(value)} disabled={value === defaultValue}>
          Save
        </Button>
      </div>
    </div>
  );
}
