import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Monitor, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MarketingLoading,
  MarketingPanel,
} from "@/components/admin/marketing/MarketingUI";
import {
  deleteMarketingTemplate,
  duplicateMarketingTemplate,
  listMarketingTemplates,
  previewMarketingTemplate,
  saveMarketingTemplate,
} from "@/lib/marketing.functions";
import {
  TEMPLATE_CATEGORIES,
  categoryLabel,
} from "@/lib/marketing/template-library";
import type { MarketingTemplate } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mranuskhalid/marketing/templates")({
  head: () => ({
    meta: [
      { title: "Marketing Templates — MunchReach Admin" },
      {
        name: "description",
        content:
          "Built-in protected marketing templates plus editable duplicates for announcements, onboarding and newsletters.",
      },
      { property: "og:title", content: "Marketing Templates — MunchReach Admin" },
      {
        property: "og:description",
        content: "Template library for MunchReach internal marketing email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplatesPage,
});

type Draft = {
  id?: string | undefined;
  key?: string | null | undefined;
  builtIn?: boolean | undefined;
  name: string;
  category: string;
  subject: string;
  previewText: string;
  body: string;
};

const EMPTY: Draft = {
  name: "",
  category: "newsletter",
  subject: "",
  previewText: "",
  body: "",
};

function TemplatesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingTemplates);
  const duplicate = useServerFn(duplicateMarketingTemplate);
  const save = useServerFn(saveMarketingTemplate);
  const remove = useServerFn(deleteMarketingTemplate);
  const preview = useServerFn(previewMarketingTemplate);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [category, setCategory] = useState("all");
  const [html, setHtml] = useState("");

  const query = useQuery({
    queryKey: ["admin", "marketing", "templates"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of query.data?.builtIn ?? []) set.add(t.category);
    for (const t of query.data?.custom ?? []) set.add(t.category);
    return ["all", ...[...set].sort()];
  }, [query.data]);

  const renderPreview = (source: Pick<Draft, "subject" | "previewText" | "body">) => {
    preview({
      data: {
        subject: source.subject,
        previewText: source.previewText,
        body: source.body,
      },
    })
      .then((result) => setHtml(result.html))
      .catch((error: Error) => toast.error(error.message));
  };

  const openTemplate = (template: MarketingTemplate) => {
    const next: Draft = {
      id: template.builtIn ? undefined : template.id,
      key: template.key ?? null,
      builtIn: Boolean(template.builtIn),
      name: template.name,
      category: template.category,
      subject: template.subject,
      previewText: template.previewText,
      body: template.body,
    };
    setDraft(next);
    renderPreview(next);
  };

  const duplicateMutation = useMutation({
    mutationFn: (vars: { key?: string | null; id?: string | null; name?: string }) =>
      duplicate({ data: vars }),
    onSuccess: async (result) => {
      toast.success("Template duplicated — the copy is editable");
      invalidate();
      const fresh = await qc.fetchQuery({
        queryKey: ["admin", "marketing", "templates"],
        queryFn: () => list(),
      });
      const copy = (fresh?.custom ?? []).find((t) => t.id === result.id);
      if (copy) openTemplate(copy);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (draft.builtIn) {
        return Promise.reject(
          new Error("Built-in templates are read-only. Duplicate it to make changes."),
        );
      }
      return save({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          category: draft.category,
          subject: draft.subject,
          previewText: draft.previewText,
          body: draft.body,
        },
      });
    },
    onSuccess: () => {
      toast.success("Template saved");
      setDraft(EMPTY);
      setHtml("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      preview({
        data: { subject: draft.subject, previewText: draft.previewText, body: draft.body },
      }),
    onSuccess: (result) => setHtml(result.html),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      setDraft(EMPTY);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <MarketingLoading label="Loading templates" />;


  const builtIn = (query.data?.builtIn ?? []).filter(
    (t) => category === "all" || t.category === category,
  );
  const custom = (query.data?.custom ?? []).filter(
    (t) => category === "all" || t.category === category,
  );

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Built-in library"
        description="Built-in templates are protected: duplicate one to make an editable copy. The original can never be overwritten or deleted."
        actions={
          <div className="flex flex-wrap gap-1">
            {categories.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={category === value ? "default" : "outline"}
                onClick={() => setCategory(value)}
              >
                {value === "all" ? "All" : categoryLabel(value)}
              </Button>
            ))}
          </div>
        }
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {builtIn.map((template) => (
            <div key={template.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.subject}</p>
                </div>
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Lock className="h-3 w-3" /> built-in
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => duplicateMutation.mutate({ key: template.key })}
                >
                  Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openTemplate(template)}>
                  Open
                </Button>
              </div>
            </div>
          ))}
        </div>
      </MarketingPanel>

      <MarketingPanel title="Your templates" description="Editable copies and custom templates.">
        {custom.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No editable templates yet — duplicate a built-in one to start.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {custom.map((template) => (
              <div key={template.id} className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">{template.subject}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openTemplate(template)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(template.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </MarketingPanel>

      <MarketingPanel
        title={
          draft.builtIn
            ? `Built-in template — read only`
            : draft.id
              ? "Edit template"
              : "New template"
        }
        description={
          draft.builtIn
            ? "Built-in templates are owned by the product and cannot be edited or deleted. Duplicate this one to get a fully editable copy."
            : "Body uses simple block markup. An unsubscribe footer is always appended at render time and cannot be removed."
        }
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => previewMutation.mutate()}>
              Preview
            </Button>
            {draft.builtIn ? (
              <Button
                size="sm"
                onClick={() => duplicateMutation.mutate({ key: draft.key ?? null })}
                disabled={duplicateMutation.isPending}
              >
                Duplicate to edit
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!draft.name.trim() || !draft.subject.trim() || saveMutation.isPending}
              >
                Save
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setHtml("");
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {draft.builtIn ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Protected built-in — changes here are not saved.
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={draft.name}
                  readOnly={draft.builtIn}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-70"
                  value={draft.category}
                  disabled={draft.builtIn}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                >
                  {TEMPLATE_CATEGORIES.some((c) => c.id === draft.category) ? null : (
                    <option value={draft.category}>{categoryLabel(draft.category)}</option>
                  )}
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>Subject</Label>
              <Input
                value={draft.subject}
                readOnly={draft.builtIn}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
              />
            </div>
            <div>
              <Label>Preview text</Label>
              <Input
                value={draft.previewText}
                readOnly={draft.builtIn}
                onChange={(event) => setDraft({ ...draft, previewText: event.target.value })}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                rows={16}
                className="font-mono text-xs"
                readOnly={draft.builtIn}
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Preview</Label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={device === "desktop" ? "default" : "outline"}
                  onClick={() => setDevice("desktop")}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={device === "mobile" ? "default" : "outline"}
                  onClick={() => setDevice("mobile")}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2">
              <iframe
                title="Template preview"
                srcDoc={html || "<p style='font-family:sans-serif;color:#666'>Click Preview</p>"}
                className={cn(
                  "mx-auto h-[520px] rounded bg-white",
                  device === "mobile" ? "w-[390px]" : "w-full",
                )}
              />
            </div>
          </div>
        </div>
      </MarketingPanel>
    </div>
  );
}
