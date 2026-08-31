import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, Info, Loader2, Search, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  auditPages,
  CHANGEFREQS,
  type PageStatus,
  type SeoIssue,
  type SitePage,
} from "@/lib/site-content-model";
import {
  getAdminSiteData,
  getSitemapPreview,
  saveSitePage,
} from "@/lib/site-content.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/pages")({
  head: () => ({
    meta: [
      { title: "Pages & SEO — MunchReach Admin" },
      {
        name: "description",
        content:
          "Manage titles, descriptions, canonicals, Open Graph tags and indexing for every public MunchReach page.",
      },
    ],
  }),
  component: AdminPagesRoute,
});

type Draft = {
  id: string;
  path: string;
  title: string;
  section: string;
  status: PageStatus;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  includeInSitemap: boolean;
  changefreq: (typeof CHANGEFREQS)[number];
  priority: number;
  structuredData: string;
};

function toDraft(page: SitePage): Draft {
  return {
    id: page.id,
    path: page.path,
    title: page.title,
    section: page.section,
    status: page.status,
    seoTitle: page.seo_title ?? "",
    metaDescription: page.meta_description ?? "",
    canonicalUrl: page.canonical_url ?? "",
    ogTitle: page.og_title ?? "",
    ogDescription: page.og_description ?? "",
    ogImageUrl: page.og_image_url ?? "",
    robotsIndex: page.robots_index,
    robotsFollow: page.robots_follow,
    includeInSitemap: page.include_in_sitemap,
    changefreq: (page.changefreq as Draft["changefreq"]) ?? "weekly",
    priority: page.priority,
    structuredData: page.structured_data ? JSON.stringify(page.structured_data, null, 2) : "",
  };
}

const statusTone: Record<PageStatus, string> = {
  published: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  unpublished: "bg-muted text-muted-foreground",
};

function CharCount({ value, max }: { value: string; max: number }) {
  const length = value.trim().length;
  const tone = !length ? "text-destructive" : length > max ? "text-amber-500" : "text-muted-foreground";
  return <span className={`text-[11px] ${tone}`}>{length}/{max}</span>;
}

function AdminPagesRoute() {
  const queryClient = useQueryClient();
  const fetchData = useServerFn(getAdminSiteData);
  const fetchSitemap = useServerFn(getSitemapPreview);
  const save = useServerFn(saveSitePage);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PageStatus>("all");
  const [draft, setDraft] = useState<Draft | null>(null);

  const data = useQuery({ queryKey: ["admin-site-data"], queryFn: () => fetchData() });
  const sitemap = useQuery({ queryKey: ["admin-sitemap"], queryFn: () => fetchSitemap() });

  const pages = (data.data?.pages ?? []) as SitePage[];

  const issues: SeoIssue[] = useMemo(() => {
    if (!pages.length) return [];
    const internalLinks = (data.data?.nav ?? []).filter((n: any) => !n.is_external).map((n: any) => n.href);
    return auditPages(pages, {
      sitemapPaths: (sitemap.data?.entries ?? []).map((e) => e.path),
      internalLinks,
    });
  }, [pages, data.data?.nav, sitemap.data]);

  const issuesByPath = useMemo(() => {
    const map = new Map<string, SeoIssue[]>();
    for (const issue of issues) map.set(issue.path, [...(map.get(issue.path) ?? []), issue]);
    return map;
  }, [issues]);

  const filtered = pages.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.path.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      (p.seo_title ?? "").toLowerCase().includes(q)
    );
  });

  const mutation = useMutation({
    mutationFn: (input: Draft) =>
      save({
        data: {
          id: input.id,
          title: input.title,
          section: input.section,
          status: input.status,
          seoTitle: input.seoTitle || null,
          metaDescription: input.metaDescription || null,
          canonicalUrl: input.canonicalUrl || null,
          ogTitle: input.ogTitle || null,
          ogDescription: input.ogDescription || null,
          ogImageUrl: input.ogImageUrl || null,
          robotsIndex: input.robotsIndex,
          robotsFollow: input.robotsFollow,
          includeInSitemap: input.includeInSitemap,
          changefreq: input.changefreq,
          priority: input.priority,
          structuredData: input.structuredData || null,
        },
      }),
    onSuccess: () => {
      toast.success("Page saved");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["admin-site-data"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sitemap"] });
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const counts = {
    published: pages.filter((p) => p.status === "published").length,
    draft: pages.filter((p) => p.status === "draft").length,
    noindex: pages.filter((p) => p.status === "published" && !p.robots_index).length,
    errors: issues.filter((i) => i.severity === "error").length,
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pages &amp; SEO</h1>
        <p className="text-sm text-muted-foreground">
          Every public route on the marketing site, with the exact metadata the page serves.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Published pages", value: counts.published },
          { label: "Draft / unpublished", value: pages.length - counts.published },
          { label: "Published but noindex", value: counts.noindex },
          { label: "SEO errors", value: counts.errors },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border/60 bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Pages ({pages.length})</TabsTrigger>
          <TabsTrigger value="health">SEO health ({issues.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search path or title"
                className="w-72 pl-8"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="unpublished">Unpublished</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Indexing</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto size-4 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No pages match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((page) => {
                    const pageIssues = issuesByPath.get(page.path) ?? [];
                    const errors = pageIssues.filter((i) => i.severity === "error").length;
                    return (
                      <TableRow key={page.id}>
                        <TableCell className="font-mono text-xs">
                          <a
                            href={page.path}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {page.path}
                            <ExternalLink className="size-3" />
                          </a>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm">{page.title}</TableCell>
                        <TableCell>
                          <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusTone[page.status]}`}>
                            {page.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {page.robots_index ? "index" : "noindex"}, {page.robots_follow ? "follow" : "nofollow"}
                          {page.include_in_sitemap ? " · sitemap" : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {pageIssues.length === 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Clean</span>
                          ) : (
                            <span className={errors ? "text-destructive" : "text-amber-500"}>
                              {pageIssues.length} {errors ? `(${errors} error)` : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(page.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(page))}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <div className="rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      No SEO issues detected across the published pages.
                    </TableCell>
                  </TableRow>
                ) : (
                  issues.map((issue, index) => (
                    <TableRow key={`${issue.path}-${issue.issue}-${index}`}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          {issue.severity === "error" ? (
                            <XCircle className="size-3.5 text-destructive" />
                          ) : issue.severity === "warning" ? (
                            <AlertTriangle className="size-3.5 text-amber-500" />
                          ) : (
                            <Info className="size-3.5 text-muted-foreground" />
                          )}
                          {issue.severity}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{issue.path}</TableCell>
                      <TableCell className="text-sm">{issue.issue}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{issue.detail}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{draft.path}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Internal title</Label>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={draft.status}
                      onValueChange={(v) => setDraft({ ...draft, status: v as PageStatus })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="unpublished">Unpublished</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Section</Label>
                    <Input
                      value={draft.section}
                      onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>SEO title</Label>
                    <CharCount value={draft.seoTitle} max={60} />
                  </div>
                  <Input value={draft.seoTitle} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Meta description</Label>
                    <CharCount value={draft.metaDescription} max={160} />
                  </div>
                  <Textarea
                    rows={3}
                    value={draft.metaDescription}
                    onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
                  />
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Search preview</p>
                  <p className="mt-1 truncate text-sm text-primary">{draft.seoTitle || draft.title}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">munchreach.com{draft.path}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {draft.metaDescription || "No meta description set."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Canonical URL</Label>
                  <Input
                    value={draft.canonicalUrl}
                    placeholder={draft.path}
                    onChange={(e) => setDraft({ ...draft, canonicalUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>OG title</Label>
                  <Input value={draft.ogTitle} onChange={(e) => setDraft({ ...draft, ogTitle: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>OG description</Label>
                  <Textarea
                    rows={2}
                    value={draft.ogDescription}
                    onChange={(e) => setDraft({ ...draft, ogDescription: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>OG image URL</Label>
                  <Input
                    value={draft.ogImageUrl}
                    placeholder="https://…"
                    onChange={(e) => setDraft({ ...draft, ogImageUrl: e.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { key: "robotsIndex" as const, label: "Allow indexing" },
                    { key: "robotsFollow" as const, label: "Follow links" },
                    { key: "includeInSitemap" as const, label: "Include in sitemap" },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                      <span className="text-sm">{row.label}</span>
                      <Switch
                        checked={draft[row.key]}
                        onCheckedChange={(checked) => setDraft({ ...draft, [row.key]: checked })}
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label>Sitemap priority</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={1}
                      value={draft.priority}
                      onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Change frequency</Label>
                  <Select
                    value={draft.changefreq}
                    onValueChange={(v) => setDraft({ ...draft, changefreq: v as Draft["changefreq"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANGEFREQS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Structured data (JSON-LD)</Label>
                  <Textarea
                    rows={6}
                    className="font-mono text-xs"
                    placeholder='{"@context":"https://schema.org","@type":"WebPage"}'
                    value={draft.structuredData}
                    onChange={(e) => setDraft({ ...draft, structuredData: e.target.value })}
                  />
                </div>

                {(issuesByPath.get(draft.path) ?? []).length > 0 ? (
                  <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-xs font-medium">Open issues</p>
                    {(issuesByPath.get(draft.path) ?? []).map((issue, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {issue.issue} — {issue.detail}
                      </p>
                    ))}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 pb-8">
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button onClick={() => mutation.mutate(draft)} disabled={mutation.isPending}>
                    {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Save page
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <p className="text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-2">
          Live
        </Badge>
        Saved metadata is applied to the public page immediately — code values are only used as a fallback.
      </p>
    </div>
  );
}
