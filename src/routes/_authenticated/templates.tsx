import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { TemplateCard } from "@/components/templates/TemplateCard";
import {
  TemplateEditorDialog,
  TemplatePreviewDialog,
  UseTemplateDialog,
  emptyTemplateDraft,
  type TemplateDraft,
} from "@/components/templates/TemplateDialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/useWorkspace";
import { deleteTemplate, duplicateTemplate, listTemplates } from "@/lib/templates.functions";
import { TEMPLATE_CATEGORIES, type EmailTemplateRow } from "@/lib/templates-model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Template Library — Sendloop" },
      {
        name: "description",
        content:
          "Search, preview and reuse proven cold email templates, or build your own workspace library.",
      },
      { property: "og:title", content: "Template Library — Sendloop" },
      {
        property: "og:description",
        content: "Official Sendloop templates plus the ones your team creates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplatesPage,
});

type ViewTab = "All" | "Featured" | "Recently used" | "My templates" | "Sendloop official";
const VIEW_TABS: ViewTab[] = [
  "All",
  "Featured",
  "Recently used",
  "My templates",
  "Sendloop official",
];

function TemplatesPage() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;

  const fetchTemplates = useServerFn(listTemplates);
  const duplicateFn = useServerFn(duplicateTemplate);
  const deleteFn = useServerFn(deleteTemplate);

  const [view, setView] = useState<ViewTab>("All");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<"recommended" | "newest" | "name">("recommended");
  const [preview, setPreview] = useState<EmailTemplateRow | null>(null);
  const [use, setUse] = useState<EmailTemplateRow | null>(null);
  const [editor, setEditor] = useState<TemplateDraft | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["templates", workspaceId],
    queryFn: () => fetchTemplates({ data: { workspaceId } }),
    enabled: Boolean(workspace) || workspaceId === null,
  });

  const all = templatesQuery.data?.templates ?? [];
  const recent = templatesQuery.data?.recent ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });

  const duplicate = useMutation({
    mutationFn: (template: EmailTemplateRow) =>
      duplicateFn({ data: { id: template.id, workspaceId } }),
    onSuccess: async () => {
      toast.success("Copied to your templates");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Template deleted");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = useMemo(() => {
    let rows = [...all];
    if (view === "Featured") rows = rows.filter((t) => t.featured);
    if (view === "My templates") rows = rows.filter((t) => !t.is_official);
    if (view === "Sendloop official") rows = rows.filter((t) => t.is_official);
    if (view === "Recently used")
      rows = recent
        .map((id) => rows.find((t) => t.id === id))
        .filter((t): t is EmailTemplateRow => Boolean(t));

    if (category !== "all") rows = rows.filter((t) => t.category === category);
    const q = search.trim().toLowerCase();
    if (q)
      rows = rows.filter((t) =>
        [t.name, t.subject, t.body, t.category, t.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );

    if (view !== "Recently used") {
      if (sort === "newest")
        rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      else if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
      else
        rows.sort(
          (a, b) =>
            Number(b.featured) - Number(a.featured) ||
            a.display_order - b.display_order ||
            a.name.localeCompare(b.name),
        );
    }
    return rows;
  }, [all, recent, view, category, search, sort]);

  const counts = {
    mine: all.filter((t) => !t.is_official).length,
    official: all.filter((t) => t.is_official).length,
  };

  return (
    <AppShell
      title="Templates"
      description="A library of proven cold email copy — official Sendloop templates plus your own."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>{counts.official} Sendloop templates</span>
            <span aria-hidden>·</span>
            <span>{counts.mine} workspace templates</span>
          </div>
          <Button onClick={() => setEditor({ ...emptyTemplateDraft })} disabled={!workspaceId}>
            <Plus className="mr-1.5 size-4" /> New template
          </Button>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as ViewTab)}>
          <TabsList className="flex w-full flex-wrap justify-start">
            {VIEW_TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates, subjects or copy…"
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {TEMPLATE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">Recommended</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? "all" : c)}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs transition hover:border-primary/40",
                category === c && "border-primary bg-primary/10 text-primary",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {templatesQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="surface-card p-12 text-center">
            <p className="font-medium">No templates match this view</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another category, or create a template for your workspace.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                canManage={!t.is_official}
                onPreview={() => setPreview(t)}
                onUse={() => setUse(t)}
                onDuplicate={() => duplicate.mutate(t)}
                {...(t.is_official
                  ? {}
                  : {
                      onEdit: () =>
                        setEditor({
                          id: t.id,
                          name: t.name,
                          category: t.category,
                          description: t.description ?? "",
                          subject: t.subject,
                          body: t.body,
                          featured: t.featured,
                          published: t.published,
                          displayOrder: t.display_order,
                        }),
                      onDelete: () => remove.mutate(t.id),
                    })}
              />
            ))}
          </div>
        )}
      </div>

      <TemplatePreviewDialog
        template={preview}
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
        onUse={(t) => {
          setPreview(null);
          setUse(t);
        }}
      />
      <UseTemplateDialog
        template={use}
        workspaceId={workspaceId}
        open={Boolean(use)}
        onOpenChange={(open) => !open && setUse(null)}
      />
      {editor ? (
        <TemplateEditorDialog
          open
          onOpenChange={(open) => !open && setEditor(null)}
          draft={editor}
          workspaceId={workspaceId}
          official={false}
          onSaved={() => void refresh()}
        />
      ) : null}
    </AppShell>
  );
}
