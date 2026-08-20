import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HEADER_GROUPS, validateHref, type NavItem, type NavLocation } from "@/lib/site-content-model";
import {
  deleteNavItem,
  getAdminSiteData,
  reorderNavItems,
  saveFooterConfig,
  saveNavItem,
} from "@/lib/site-content.functions";

export const Route = createFileRoute("/_authenticated/admin/navigation")({
  head: () => ({
    meta: [
      { title: "Navigation & Footer — Sendloop Admin" },
      {
        name: "description",
        content: "Control the Sendloop header mega menu, footer columns and social links without a deploy.",
      },
    ],
  }),
  component: AdminNavigationRoute,
});

type Draft = {
  id?: string;
  location: NavLocation;
  groupLabel: string;
  label: string;
  href: string;
  description: string;
  icon: string;
  isExternal: boolean;
  isVisible: boolean;
  sortOrder: number;
};

function emptyDraft(location: NavLocation, sortOrder: number): Draft {
  return {
    location,
    groupLabel: location === "header" ? "core" : location === "footer" ? "Product" : "",
    label: "",
    href: "/",
    description: "",
    icon: "",
    isExternal: false,
    isVisible: true,
    sortOrder,
  };
}

function toDraft(item: NavItem): Draft {
  return {
    id: item.id,
    location: item.location,
    groupLabel: item.group_label ?? "",
    label: item.label,
    href: item.href,
    description: item.description ?? "",
    icon: item.icon ?? "",
    isExternal: item.is_external,
    isVisible: item.is_visible,
    sortOrder: item.sort_order,
  };
}

function AdminNavigationRoute() {
  const queryClient = useQueryClient();
  const fetchData = useServerFn(getAdminSiteData);
  const save = useServerFn(saveNavItem);
  const remove = useServerFn(deleteNavItem);
  const reorder = useServerFn(reorderNavItems);
  const saveFooter = useServerFn(saveFooterConfig);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [footer, setFooter] = useState<{ tagline: string; copyright: string } | null>(null);

  const data = useQuery({ queryKey: ["admin-site-data"], queryFn: () => fetchData() });
  const nav = (data.data?.nav ?? []) as NavItem[];
  const pages = data.data?.pages ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-site-data"] });
    queryClient.invalidateQueries({ queryKey: ["site-content"] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: Draft) =>
      save({
        data: {
          ...(input.id ? { id: input.id } : {}),
          location: input.location,
          groupLabel: input.groupLabel || null,
          label: input.label,
          href: input.href,
          description: input.description || null,
          icon: input.icon || null,
          isExternal: input.isExternal,
          isVisible: input.isVisible,
          sortOrder: input.sortOrder,
        },
      }),
    onSuccess: () => {
      toast.success("Link saved");
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Link removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => reorder({ data: { items } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const footerMutation = useMutation({
    mutationFn: (input: { tagline: string; copyright: string }) => saveFooter({ data: input }),
    onSuccess: () => {
      toast.success("Footer settings saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const move = (items: NavItem[], index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    const b = next[target]!;
    reorderMutation.mutate([
      { id: a.id, sortOrder: b.sort_order },
      { id: b.id, sortOrder: a.sort_order },
    ]);
  };

  const draftHrefError = draft ? validateHref(draft.href, draft.isExternal) : null;
  const linkedPage = draft && !draft.isExternal ? pages.find((p: any) => p.path === draft.href.split("#")[0]) : null;

  function LinkGroup({ location, groupKey, title }: { location: NavLocation; groupKey: string | null; title: string }) {
    const items = nav
      .filter((n) => n.location === location && (groupKey === null || (n.group_label ?? "") === groupKey))
      .sort((a, b) => a.sort_order - b.sort_order);
    return (
      <div className="rounded-lg border border-border/60">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <p className="text-sm font-medium">{title}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const next = emptyDraft(location, (items.at(-1)?.sort_order ?? 0) + 10);
              setDraft({ ...next, groupLabel: groupKey ?? next.groupLabel });
            }}
          >
            <Plus className="mr-1 size-3.5" /> Add
          </Button>
        </div>
        <ul className="divide-y divide-border/60">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">No links in this group yet.</li>
          ) : (
            items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex flex-col">
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(items, index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={index === items.length - 1 || reorderMutation.isPending}
                    onClick={() => move(items, index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.label}
                    {!item.is_visible ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        hidden
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{item.href}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(item))}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => deleteMutation.mutate(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  const footerGroups = [...new Set(nav.filter((n) => n.location === "footer").map((n) => n.group_label ?? "More"))];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Navigation &amp; Footer</h1>
        <p className="text-sm text-muted-foreground">
          These links render on the live marketing site. Broken or unpublished targets are rejected on save.
        </p>
      </div>

      {data.isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <Tabs defaultValue="header">
          <TabsList>
            <TabsTrigger value="header">Header mega menu</TabsTrigger>
            <TabsTrigger value="footer">Footer</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
          </TabsList>

          <TabsContent value="header" className="mt-4 grid gap-4 lg:grid-cols-2">
            {HEADER_GROUPS.map((group) => (
              <LinkGroup key={group.value} location="header" groupKey={group.value} title={group.label} />
            ))}
          </TabsContent>

          <TabsContent value="footer" className="mt-4 space-y-4">
            <div className="rounded-lg border border-border/60 p-4">
              <p className="text-sm font-medium">Footer text</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tagline</Label>
                  <Textarea
                    rows={3}
                    value={footer?.tagline ?? data.data?.footerConfig?.tagline ?? ""}
                    onChange={(e) =>
                      setFooter({
                        tagline: e.target.value,
                        copyright: footer?.copyright ?? data.data?.footerConfig?.copyright ?? "",
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Copyright line</Label>
                  <Input
                    value={footer?.copyright ?? data.data?.footerConfig?.copyright ?? ""}
                    onChange={(e) =>
                      setFooter({
                        tagline: footer?.tagline ?? data.data?.footerConfig?.tagline ?? "",
                        copyright: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <Button
                className="mt-3"
                size="sm"
                disabled={!footer || footerMutation.isPending}
                onClick={() => footer && footerMutation.mutate(footer)}
              >
                Save footer text
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {(footerGroups.length ? footerGroups : ["Product"]).map((group) => (
                <LinkGroup key={group} location="footer" groupKey={group} title={group} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="social" className="mt-4">
            <LinkGroup location="social" groupKey={null} title="Social links" />
          </TabsContent>
        </Tabs>
      )}

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle>{draft.id ? "Edit link" : "New link"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Label</Label>
                  <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <Input value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} />
                  {draftHrefError ? <p className="text-xs text-destructive">{draftHrefError}</p> : null}
                  {linkedPage ? (
                    <p className="text-xs text-muted-foreground">
                      Points to “{linkedPage.title}” ({linkedPage.status})
                    </p>
                  ) : !draft.isExternal && !draftHrefError ? (
                    <p className="text-xs text-amber-500">No page registry entry matches this path.</p>
                  ) : null}
                </div>
                {draft.location === "header" ? (
                  <div className="space-y-1.5">
                    <Label>Menu group</Label>
                    <Select
                      value={draft.groupLabel}
                      onValueChange={(v) => setDraft({ ...draft, groupLabel: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HEADER_GROUPS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : draft.location === "footer" ? (
                  <div className="space-y-1.5">
                    <Label>Footer column</Label>
                    <Input
                      value={draft.groupLabel}
                      onChange={(e) => setDraft({ ...draft, groupLabel: e.target.value })}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>Description (mega menu only)</Label>
                  <Textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Icon name (lucide)</Label>
                  <Input
                    value={draft.icon}
                    placeholder="Send"
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <span className="text-sm">Visible</span>
                    <Switch
                      checked={draft.isVisible}
                      onCheckedChange={(checked) => setDraft({ ...draft, isVisible: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <span className="text-sm">External link</span>
                    <Switch
                      checked={draft.isExternal}
                      onCheckedChange={(checked) => setDraft({ ...draft, isExternal: checked })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                  />
                </div>
                <div className="flex justify-end gap-2 pb-8">
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate(draft)}
                    disabled={!!draftHrefError || !draft.label.trim() || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Save link
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
