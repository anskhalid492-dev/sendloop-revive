import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  TemplateEditorDialog,
  TemplatePreviewDialog,
  emptyTemplateDraft,
  type TemplateDraft,
} from "@/components/templates/TemplateDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  deleteTemplate,
  duplicateTemplate,
  listOfficialTemplates,
  saveTemplate,
} from "@/lib/templates.functions";
import type { EmailTemplateRow } from "@/lib/templates-model";

export const Route = createFileRoute("/_authenticated/admin/templates")({
  head: () => ({
    meta: [
      { title: "Admin Templates — MunchReach" },
      {
        name: "description",
        content: "Create, publish and order the official MunchReach cold email template library.",
      },
      { property: "og:title", content: "Admin Templates — MunchReach" },
      { property: "og:description", content: "Manage the official MunchReach template library." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminTemplatesPage,
});

function AdminTemplatesPage() {
  const queryClient = useQueryClient();
  const fetchTemplates = useServerFn(listOfficialTemplates);
  const saveFn = useServerFn(saveTemplate);
  const duplicateFn = useServerFn(duplicateTemplate);
  const deleteFn = useServerFn(deleteTemplate);

  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<TemplateDraft | null>(null);
  const [preview, setPreview] = useState<EmailTemplateRow | null>(null);

  const query = useQuery({
    queryKey: ["admin-templates"],
    queryFn: () => fetchTemplates(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-templates"] });

  const toggle = useMutation({
    mutationFn: (input: { template: EmailTemplateRow; patch: Partial<EmailTemplateRow> }) =>
      saveFn({
        data: {
          id: input.template.id,
          workspaceId: null,
          isOfficial: true,
          name: input.template.name,
          category: input.template.category,
          description: input.template.description,
          subject: input.template.subject,
          body: input.template.body,
          featured: input.patch.featured ?? input.template.featured,
          published: input.patch.published ?? input.template.published,
          displayOrder: input.patch.display_order ?? input.template.display_order,
        },
      }),
    onSuccess: async () => {
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateFn({ data: { id, asOfficial: true } }),
    onSuccess: async () => {
      toast.success("Template duplicated (unpublished)");
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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = query.data ?? [];
    return q
      ? list.filter((t) => `${t.name} ${t.category} ${t.subject}`.toLowerCase().includes(q))
      : list;
  }, [query.data, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Official templates</h2>
          <p className="text-sm text-muted-foreground">
            Published templates appear in every customer&apos;s library. Customers can copy them
            but never edit them.
          </p>
        </div>
        <Button onClick={() => setEditor({ ...emptyTemplateDraft, published: false })}>
          <Plus className="mr-1.5 size-4" /> New official template
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="pl-9"
        />
      </div>

      <div className="surface-card overflow-hidden">
        {query.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Template</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Variables</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Featured</th>
                  <th className="px-3 py-2">Published</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{t.category}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {t.variables.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        className="h-8 w-20"
                        defaultValue={t.display_order}
                        onBlur={(e) => {
                          const value = Number(e.target.value) || 0;
                          if (value !== t.display_order)
                            toggle.mutate({ template: t, patch: { display_order: value } });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={t.featured}
                        onCheckedChange={(v) =>
                          toggle.mutate({ template: t, patch: { featured: v } })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={t.published}
                        onCheckedChange={(v) =>
                          toggle.mutate({ template: t, patch: { published: v } })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Preview" onClick={() => setPreview(t)}>
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() =>
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
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Duplicate"
                          onClick={() => duplicate.mutate(t.id)}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          className="text-destructive"
                          onClick={() => remove.mutate(t.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TemplatePreviewDialog
        template={preview}
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
      />
      {editor ? (
        <TemplateEditorDialog
          open
          onOpenChange={(open) => !open && setEditor(null)}
          draft={editor}
          workspaceId={null}
          official
          onSaved={() => void refresh()}
        />
      ) : null}
    </div>
  );
}
