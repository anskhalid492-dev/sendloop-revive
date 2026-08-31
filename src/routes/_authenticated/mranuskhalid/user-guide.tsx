import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminDeleteAlert,
  adminDeleteGuideArticle,
  adminListGuide,
  adminSaveAlert,
  adminSaveGuideArticle,
} from "@/lib/trust-center.functions";
import {
  ALERT_TYPES,
  ALERT_TYPE_LABEL,
  GUIDE_CATEGORIES,
} from "@/lib/trust-center-model";

export const Route = createFileRoute("/_authenticated/admin/user-guide")({
  head: () => ({
    meta: [
      { title: "User Guide & Alerts — MunchReach Admin" },
      {
        name: "description",
        content: "Publish guide articles and service alerts to the public MunchReach user guide.",
      },
    ],
  }),
  component: AdminUserGuidePage,
});

type ArticleDraft = {
  id?: string;
  category: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  published: boolean;
  sortOrder: number;
};

type AlertDraft = {
  id?: string;
  alertType: (typeof ALERT_TYPES)[number];
  title: string;
  message: string;
  startsAt: string;
  endsAt: string;
  published: boolean;
  resolved: boolean;
};

const emptyArticle: ArticleDraft = {
  category: GUIDE_CATEGORIES[0],
  slug: "",
  title: "",
  summary: "",
  body: "",
  published: true,
  sortOrder: 0,
};

function localDateTime(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const emptyAlert = (): AlertDraft => ({
  alertType: "information",
  title: "",
  message: "",
  startsAt: localDateTime(),
  endsAt: "",
  published: false,
  resolved: false,
});

function AdminUserGuidePage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListGuide);
  const saveArticle = useServerFn(adminSaveGuideArticle);
  const deleteArticle = useServerFn(adminDeleteGuideArticle);
  const saveAlert = useServerFn(adminSaveAlert);
  const deleteAlert = useServerFn(adminDeleteAlert);

  const [article, setArticle] = useState<ArticleDraft>(emptyArticle);
  const [alert, setAlert] = useState<AlertDraft>(emptyAlert());

  const { data, isLoading } = useQuery({ queryKey: ["admin-guide"], queryFn: () => list({}) });
  const articles = data?.articles ?? [];
  const alerts = data?.alerts ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-guide"] });

  const articleMutation = useMutation({
    mutationFn: (d: ArticleDraft) => saveArticle({ data: { ...(d.id ? { id: d.id } : {}), ...d } }),
    onSuccess: () => {
      toast.success(article.id ? "Article updated" : "Article added");
      setArticle(emptyArticle);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alertMutation = useMutation({
    mutationFn: (d: AlertDraft) => saveAlert({ data: { ...(d.id ? { id: d.id } : {}), ...d } }),
    onSuccess: () => {
      toast.success(alert.id ? "Alert updated" : "Alert created");
      setAlert(emptyAlert());
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveArticle = (index: number, direction: -1 | 1) => {
    const current = articles[index];
    const target = articles[index + direction];
    if (!current || !target) return;
    void Promise.all([
      saveArticle({
        data: {
          id: current.id,
          category: current.category,
          slug: current.slug,
          title: current.title,
          summary: current.summary,
          body: current.body,
          published: current.published,
          sortOrder: target.sort_order,
        },
      }),
      saveArticle({
        data: {
          id: target.id,
          category: target.category,
          slug: target.slug,
          title: target.title,
          summary: target.summary,
          body: target.body,
          published: target.published,
          sortOrder: current.sort_order,
        },
      }),
    ])
      .then(invalidate)
      .catch((e: Error) => toast.error(e.message));
  };

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">User Guide & Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Published articles and active alerts appear on /user-guide right away. With no active
          alerts the page shows a clean “no active service alerts” state.
        </p>
      </header>

      {/* Alerts */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Service alerts</h2>
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="al-type">Type</Label>
              <Select
                value={alert.alertType}
                onValueChange={(v) =>
                  setAlert((a) => ({ ...a, alertType: v as AlertDraft["alertType"] }))
                }
              >
                <SelectTrigger id="al-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ALERT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-title">Title</Label>
              <Input
                id="al-title"
                value={alert.title}
                onChange={(e) => setAlert((a) => ({ ...a, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="al-message">Message</Label>
              <Textarea
                id="al-message"
                rows={3}
                value={alert.message}
                onChange={(e) => setAlert((a) => ({ ...a, message: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-start">Starts</Label>
              <Input
                id="al-start"
                type="datetime-local"
                value={alert.startsAt}
                onChange={(e) => setAlert((a) => ({ ...a, startsAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-end">Ends (optional)</Label>
              <Input
                id="al-end"
                type="datetime-local"
                value={alert.endsAt}
                onChange={(e) => setAlert((a) => ({ ...a, endsAt: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="al-published"
                  checked={alert.published}
                  onCheckedChange={(v) => setAlert((a) => ({ ...a, published: v }))}
                />
                <Label htmlFor="al-published">Published</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="al-resolved"
                  checked={alert.resolved}
                  onCheckedChange={(v) => setAlert((a) => ({ ...a, resolved: v }))}
                />
                <Label htmlFor="al-resolved">Resolved</Label>
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button
              onClick={() => alertMutation.mutate(alert)}
              disabled={alertMutation.isPending || alert.title.trim().length < 3}
            >
              {alertMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {alert.id ? "Save alert" : "Create alert"}
            </Button>
            {alert.id ? (
              <Button variant="ghost" onClick={() => setAlert(emptyAlert())}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card">
          {isLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : alerts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No alerts created.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {a.title}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {ALERT_TYPE_LABEL[a.alert_type] ?? a.alert_type} ·{" "}
                        {a.published ? "published" : "draft"}
                        {a.resolved_at ? " · resolved" : ""}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {a.message}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(a.starts_at).toLocaleString()}
                      {a.ends_at ? ` → ${new Date(a.ends_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAlert({
                          id: a.id,
                          alertType: (a.alert_type as AlertDraft["alertType"]) ?? "information",
                          title: a.title,
                          message: a.message,
                          startsAt: localDateTime(a.starts_at),
                          endsAt: a.ends_at ? localDateTime(a.ends_at) : "",
                          published: a.published,
                          resolved: Boolean(a.resolved_at),
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${a.title}`}
                      onClick={() =>
                        deleteAlert({ data: { id: a.id } })
                          .then(invalidate)
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Articles */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Guide articles</h2>
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ga-category">Category</Label>
              <Input
                id="ga-category"
                list="guide-categories"
                value={article.category}
                onChange={(e) => setArticle((a) => ({ ...a, category: e.target.value }))}
              />
              <datalist id="guide-categories">
                {GUIDE_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ga-slug">Slug</Label>
              <Input
                id="ga-slug"
                value={article.slug}
                placeholder="connect-a-mailbox"
                onChange={(e) =>
                  setArticle((a) => ({ ...a, slug: e.target.value.toLowerCase().trim() }))
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ga-title">Title</Label>
              <Input
                id="ga-title"
                value={article.title}
                onChange={(e) => setArticle((a) => ({ ...a, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ga-summary">Summary</Label>
              <Input
                id="ga-summary"
                value={article.summary}
                onChange={(e) => setArticle((a) => ({ ...a, summary: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ga-body">Body</Label>
              <Textarea
                id="ga-body"
                rows={7}
                value={article.body}
                onChange={(e) => setArticle((a) => ({ ...a, body: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ga-order">Display order</Label>
              <Input
                id="ga-order"
                type="number"
                min={0}
                value={article.sortOrder}
                onChange={(e) => setArticle((a) => ({ ...a, sortOrder: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="ga-published"
                checked={article.published}
                onCheckedChange={(v) => setArticle((a) => ({ ...a, published: v }))}
              />
              <Label htmlFor="ga-published">Published</Label>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button
              onClick={() => articleMutation.mutate(article)}
              disabled={
                articleMutation.isPending ||
                article.title.trim().length < 3 ||
                !/^[a-z0-9-]+$/.test(article.slug)
              }
            >
              {articleMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {article.id ? "Save article" : "Add article"}
            </Button>
            {article.id ? (
              <Button variant="ghost" onClick={() => setArticle(emptyArticle)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card">
          {isLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : articles.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No custom articles yet. The public page still shows the built-in guide.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {articles.map((a, index) => (
                <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {a.title}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {a.category} · {a.published ? "published" : "hidden"} · order{" "}
                        {a.sort_order}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveArticle(index, -1)}
                      disabled={index === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveArticle(index, 1)}
                      disabled={index === articles.length - 1}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setArticle({
                          id: a.id,
                          category: a.category,
                          slug: a.slug,
                          title: a.title,
                          summary: a.summary,
                          body: a.body,
                          published: a.published,
                          sortOrder: a.sort_order,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${a.title}`}
                      onClick={() =>
                        deleteArticle({ data: { id: a.id } })
                          .then(invalidate)
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
