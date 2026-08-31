import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Eye, History, Loader2, Mail, Pencil, RotateCcw, Save, Search, Send, Undo2 } from "lucide-react";
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
import { listSystemSenderIdentities, updateSystemSenderIdentity } from "@/lib/transactional-email.functions";
import { isRequiredSystemEmail } from "@/lib/transactional/policy";
import { systemEmailPurpose } from "@/lib/system-email-senders";
import { listBirthdayGifts } from "@/lib/birthday-gift.functions";
import { SesSystemEmailPanel } from "@/components/admin/SesSystemEmailPanel";

export const Route = createFileRoute("/_authenticated/mranuskhalid/system-emails")({
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
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
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

function BirthdayGiftLog() {
  const fetchGifts = useServerFn(listBirthdayGifts);
  const gifts = useQuery({ queryKey: ["admin-birthday-gifts"], queryFn: () => fetchGifts() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Birthday gifts</CardTitle>
        <CardDescription>
          Every birthday gift granted by the automation: the year it was booked against, whether the free
          month was applied, and the delivery status of the Birthday Gift email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {gifts.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (gifts.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No birthday gifts have been granted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Gift year</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Gift granted</th>
                  <th className="py-2 pr-4">Free month until</th>
                  <th className="py-2 pr-4">Email</th>
                </tr>
              </thead>
              <tbody>
                {(gifts.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{row.email ?? "—"}</td>
                    <td className="py-2 pr-4">{row.giftYear}</td>
                    <td className="py-2 pr-4">{row.giftDate}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.granted ? "default" : "destructive"}>
                        {row.granted ? "Granted" : row.grantError ?? "Not granted"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {row.grantExpiresAt ? row.grantExpiresAt.slice(0, 10) : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{row.deliveryStatus ?? row.emailStatus}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  const [testKey, setTestKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    provider?: string | null;
    providerMessageId?: string | null;
    from?: string | null;
    subject?: string | null;
  } | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const fetchSenders = useServerFn(listSystemSenderIdentities);
  const sendersQuery = useQuery({ queryKey: ["admin", "system-senders"], queryFn: () => fetchSenders() });
  const senders = sendersQuery.data?.identities ?? [];
  const provider = sendersQuery.data?.provider ?? null;
  const providerOptions = sendersQuery.data?.providerOptions ?? [];
  const [senderEdit, setSenderEdit] = useState<{
    purpose: string;
    email: string;
    name: string;
    replyTo: string;
    provider: "auto" | "managed" | "ses";
    active: boolean;
  } | null>(null);
  const saveSender = useServerFn(updateSystemSenderIdentity);
  const senderMutation = useMutation({
    mutationFn: (input: NonNullable<typeof senderEdit>) =>
      saveSender({ data: { ...input, purpose: input.purpose as never } }),
    onSuccess: () => {
      toast.success("Sender identity updated");
      setSenderEdit(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "system-senders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "system-emails"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update sender identity"),
  });

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
    mutationFn: () => testFn({ data: { eventKey: testKey ?? activeKey!, to: testTo } }),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.ok) toast.success("Test email sent");
      else toast.error(res.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewRow = useMutation({
    mutationFn: (eventKey: string) => previewFn({ data: { eventKey } }),
    onSuccess: (res) => setPreviewHtml(res.rendered?.html ?? null),
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
            <Link to="/mranuskhalid/email-log">Delivery log</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Transactional emails" value={String(templates.length)} />
        <SummaryCard
          label="Enabled"
          value={String(templates.filter((t) => t.enabled).length)}
        />
        <SummaryCard label="Configured senders" value={String(senders.length)} />
        <SummaryCard
          label="Active provider"
          value={provider?.label ?? "—"}
          tone={provider && !provider.available ? "bad" : "default"}
        />
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="settings">Delivery settings</TabsTrigger>
          <TabsTrigger value="senders">Sender identities</TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="ses">Amazon SES</TabsTrigger>
          <TabsTrigger value="birthday">Birthday gifts</TabsTrigger>
        </TabsList>

        <TabsContent value="ses" className="space-y-4">
          <SesSystemEmailPanel
            enabled={settings?.ses_enabled === true}
            toggling={saveSettings.isPending}
            onToggle={(next) => saveSettings.mutate({ ses_enabled: next })}
          />
        </TabsContent>

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
                  <div className="hidden gap-3 px-4 py-2 text-xs uppercase text-muted-foreground lg:flex">
                    <span className="min-w-56 flex-1">Email type</span>
                    <span className="w-56">From address</span>
                    <span className="w-40">Provider</span>
                    <span className="w-28">Status</span>
                    <span className="w-32">Last updated</span>
                    <span className="w-64 text-right">Actions</span>
                  </div>
                  {filtered.map((t) => {
                    const stats = usage[t.event_key];
                    const required = isRequiredSystemEmail(t.event_key);
                    const from =
                      t.from_email ??
                      senders.find((sn) => sn.purpose === systemEmailPurpose(t.event_key, t.category))?.email ??
                      settings?.from_email ??
                      "system default";
                    return (
                      <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-56 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t.name}</span>
                            {t.draft ? <Badge variant="secondary">Draft</Badge> : null}
                            {!t.is_default ? <Badge variant="outline">Customised</Badge> : null}
                            {required ? <Badge variant="outline">Required</Badge> : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {t.event_key} · {t.category} · v{t.version}
                          </p>
                        </div>
                        <span className="w-56 truncate text-xs text-muted-foreground">{from}</span>
                        <span className="w-40 text-xs">
                          <Badge variant={provider?.available === false ? "destructive" : "outline"}>
                            {provider?.label ?? "—"}
                          </Badge>
                        </span>
                        <span className="w-28 text-xs">
                          <Badge variant={t.enabled ? "default" : "secondary"}>
                            {t.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </span>
                        <span className="w-32 text-xs text-muted-foreground">
                          {new Date(t.updated_at).toLocaleDateString()}
                          <br />
                          {stats ? `${stats.sent} sent · ${stats.failed} failed` : "No sends (30d)"}
                        </span>
                        <div className="flex w-64 items-center justify-end gap-2">
                          {required ? (
                            <span className="text-[11px] text-muted-foreground">Required system email</span>
                          ) : (
                            <Switch
                              checked={t.enabled}
                              onCheckedChange={(enabled) => toggle.mutate({ eventKey: t.event_key, enabled })}
                              aria-label={`Enable ${t.name}`}
                            />
                          )}
                          <Button size="sm" variant="outline" onClick={() => openEditor(t.event_key)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => previewRow.mutate(t.event_key)}
                            aria-label={`Preview ${t.name}`}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTestKey(t.event_key);
                              setTestResult(null);
                            }}
                            aria-label={`Send test ${t.name}`}
                          >
                            <Send className="size-4" />
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

        <TabsContent value="senders">
          <Card>
            <CardHeader>
              <CardTitle>Sender identities</CardTitle>
              <CardDescription>
                MunchReach system sender addresses and their provider verification state. Credentials and keys are
                never shown here. When Amazon SES is enabled, only verified identities can be selected on a template.
              </CardDescription>
              {provider ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Active provider:</span>
                  <Badge variant={provider.available ? "default" : "secondary"}>{provider.label}</Badge>
                  <span className="text-xs text-muted-foreground">{provider.detail}</span>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Display name</th>
                      <th className="px-4 py-2">Provider</th>
                      <th className="px-4 py-2">Verification</th>
                      <th className="px-4 py-2">Region</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {senders.map((sender) => (
                      <tr key={sender.email} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{sender.email}</td>
                        <td className="px-4 py-2">{sender.name}</td>
                        <td className="px-4 py-2">
                          {sender.provider}
                          {sender.providerPreference !== "auto" ? (
                            <span className="ml-1 text-xs text-muted-foreground">(pinned)</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={sender.verification === "Verified" ? "default" : "secondary"}>
                            {sender.verification}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{sender.region}</td>
                        <td className="px-4 py-2">
                          <Badge variant={sender.active ? (sender.selectable ? "outline" : "secondary") : "secondary"}>
                            {sender.active ? (sender.selectable ? "Active" : "Not selectable") : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setSenderEdit({
                                purpose: sender.purpose,
                                email: sender.email,
                                name: sender.name,
                                replyTo: sender.replyTo,
                                provider: sender.providerPreference as "auto" | "managed" | "ses",
                                active: sender.active,
                              })
                            }
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {senders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                          {sendersQuery.isLoading ? "Loading sender identities…" : "No sender identities."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
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

        <TabsContent value="birthday">
          <BirthdayGiftLog />
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
                <div className="grid gap-1">
                  <Label>From address (system sender identity)</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={effectiveDraft.from_email}
                    onChange={(e) => setDraft({ ...effectiveDraft, from_email: e.target.value })}
                  >
                    <option value="">Use mapped system sender</option>
                    {senders.map((sn) => (
                      <option key={sn.email} value={sn.email} disabled={!sn.selectable}>
                        {sn.name} — {sn.email}
                        {sn.selectable ? "" : ` (${sn.verification})`}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="Reply-to (optional)" value={effectiveDraft.reply_to} onChange={(v) => setDraft({ ...effectiveDraft, reply_to: v })} />
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Insert a variable (click to copy)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`{{${v}}}`);
                        toast.success(`Copied {{${v}}}`);
                      }}
                      className="rounded-md border px-2 py-1 font-mono text-[11px] hover:bg-muted"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
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
                <Button
                  onClick={() => {
                    setTestKey(activeKey);
                    sendTest.mutate();
                  }}
                  disabled={!testTo || sendTest.isPending}
                >
                  {sendTest.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                  Send test
                </Button>
                {testResult ? (
                  <p className="w-full break-all rounded-md bg-muted p-2 text-xs">
                    {testResult.ok ? "Sent" : "Failed"} · {testResult.provider ?? "provider"} ·{" "}
                    {testResult.providerMessageId ?? testResult.message}
                  </p>
                ) : null}
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
          <div className="flex items-center gap-2 px-6">
            <Button
              size="sm"
              variant={previewDevice === "desktop" ? "default" : "outline"}
              onClick={() => setPreviewDevice("desktop")}
            >
              Desktop
            </Button>
            <Button
              size="sm"
              variant={previewDevice === "mobile" ? "default" : "outline"}
              onClick={() => setPreviewDevice("mobile")}
            >
              Mobile
            </Button>
          </div>
          <div className="flex justify-center overflow-auto bg-muted/40 p-4">
            <iframe
              title="Email preview"
              srcDoc={previewHtml ?? ""}
              sandbox=""
              className={`h-[68vh] border-0 bg-white ${previewDevice === "mobile" ? "w-[390px] rounded-xl shadow" : "w-full"}`}
            />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!testKey && !activeKey}
        onOpenChange={(open) => (open ? null : (setTestKey(null), setTestResult(null)))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription className="font-mono text-xs">{testKey}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Recipient</Label>
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            </div>
            <Button onClick={() => sendTest.mutate()} disabled={!testTo || sendTest.isPending}>
              {sendTest.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Send test
            </Button>
            {testResult ? (
              <p className="break-all rounded-md bg-muted p-3 text-xs">
                {testResult.ok ? "Sent" : "Failed"} · {testResult.provider ?? "provider"} ·{" "}
                {testResult.providerMessageId ?? testResult.message}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!senderEdit} onOpenChange={(open) => (open ? null : setSenderEdit(null))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit sender identity</DialogTitle>
            <DialogDescription>
              Changes apply to every MunchReach system email that uses this identity. Templates and sending
              logic are unchanged.
            </DialogDescription>
          </DialogHeader>
          {senderEdit ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input
                  value={senderEdit.email}
                  onChange={(e) => setSenderEdit({ ...senderEdit, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input
                  value={senderEdit.name}
                  onChange={(e) => setSenderEdit({ ...senderEdit, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reply-To</Label>
                <Input
                  value={senderEdit.replyTo}
                  onChange={(e) => setSenderEdit({ ...senderEdit, replyTo: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={senderEdit.provider}
                  onChange={(e) =>
                    setSenderEdit({ ...senderEdit, provider: e.target.value as "auto" | "managed" | "ses" })
                  }
                >
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value} disabled={!option.available}>
                      {option.label}
                      {option.available ? "" : " — not available"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">
                    Inactive identities cannot be selected on a template.
                  </p>
                </div>
                <Switch
                  checked={senderEdit.active}
                  onCheckedChange={(checked) => setSenderEdit({ ...senderEdit, active: checked })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSenderEdit(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => senderMutation.mutate(senderEdit)}
                  disabled={senderMutation.isPending}
                >
                  {senderMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-4 w-4" />
                  )}
                  Save identity
                </Button>
              </div>
            </div>
          ) : null}
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

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
