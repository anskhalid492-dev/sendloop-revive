/**
 * Admin → SEO Manager.
 *
 * Everything site-wide lives here: title/description defaults, OG defaults,
 * Google/Bing verification, tracking scripts, indexing and per-page overrides.
 * The blog editor deliberately only carries post-level SEO fields.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GlobalSeoConfig } from "@/lib/site-content-model";
import { getAdminSiteData, saveGlobalSeo, saveSitePage } from "@/lib/site-content.functions";

export const Route = createFileRoute("/_authenticated/admin/seo")({
  head: () => ({
    meta: [
      { title: "SEO Manager — MunchReach Admin" },
      {
        name: "description",
        content:
          "Global SEO defaults, search engine verification, tracking scripts and per-page metadata overrides.",
      },
    ],
  }),
  component: SeoManagerRoute,
});

type PageDraft = {
  id: string;
  path: string;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
  og_title: string;
  og_description: string;
  og_image_url: string;
  robots_index: boolean;
  robots_follow: boolean;
  structured_data: string;
  title: string;
  status: string;
  changefreq: string;
  priority: number;
  include_in_sitemap: boolean;
};

function SeoManagerRoute() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(getAdminSiteData);
  const data = useQuery({ queryKey: ["admin-site-content"], queryFn: () => fetchAll() });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">SEO Manager</h1>
        <p className="text-sm text-muted-foreground">
          Site-wide search settings and per-page metadata. Blog post SEO stays inside each post.
        </p>
      </div>

      {data.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Tabs defaultValue="global" className="space-y-4">
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="verification">Verification & tracking</TabsTrigger>
            <TabsTrigger value="pages">Per-page overrides</TabsTrigger>
            <TabsTrigger value="files">Robots, sitemap & redirects</TabsTrigger>
          </TabsList>

          <GlobalTabs
            config={data.data?.globalSeo as GlobalSeoConfig}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ["admin-site-content"] });
              void queryClient.invalidateQueries({ queryKey: ["site-content"] });
            }}
          />

          <TabsContent value="pages">
            <PagesPanel
              pages={(data.data?.pages ?? []) as any[]}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ["admin-site-content"] });
                void queryClient.invalidateQueries({ queryKey: ["site-content"] });
              }}
            />
          </TabsContent>

          <TabsContent value="files">
            <div className="grid gap-3 sm:grid-cols-2">
              <LinkCard
                to="/admin/seo-files"
                title="Robots.txt & Sitemap"
                description="Crawl rules, sitemap URL and a live preview of every emitted URL."
              />
              <LinkCard
                to="/admin/redirects"
                title="Redirects"
                description="301/302 rules applied before any page renders."
              />
              <LinkCard
                to="/admin/pages"
                title="Pages directory"
                description="Full page inventory with publish status and SEO health."
              />
              <LinkCard
                to="/admin/blog"
                title="Blog CMS"
                description="Posts, categories, authors and the shared media library."
              />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function LinkCard({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link to={to} className="rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-primary">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {title} <ExternalLink className="size-3.5 text-muted-foreground" />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

function GlobalTabs({ config, onSaved }: { config?: GlobalSeoConfig; onSaved: () => void }) {
  const save = useServerFn(saveGlobalSeo);
  const [draft, setDraft] = useState<GlobalSeoConfig | null>(config ?? null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const mutation = useMutation({
    mutationFn: (input: GlobalSeoConfig) => save({ data: input }),
    onSuccess: () => {
      toast.success("SEO settings saved");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!draft) return null;
  const update = (patch: Partial<GlobalSeoConfig>) => setDraft({ ...draft, ...patch });
  const SaveButton = () => (
    <Button onClick={() => mutation.mutate(draft)} disabled={mutation.isPending}>
      {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
      Save settings
    </Button>
  );

  return (
    <>
      <TabsContent value="global" className="space-y-4">
        <div className="grid gap-4 rounded-lg border border-border/60 bg-card p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Site title</Label>
            <Input value={draft.site_title} onChange={(e) => update({ site_title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Title template</Label>
            <Input
              value={draft.title_template}
              onChange={(e) => update({ title_template: e.target.value })}
              placeholder="%s — MunchReach"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Global meta description</Label>
            <Textarea
              rows={3}
              value={draft.meta_description}
              onChange={(e) => update({ meta_description: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{draft.meta_description.length} / 160 recommended</p>
          </div>
          <div className="space-y-1.5">
            <Label>Default OG image URL</Label>
            <Input value={draft.og_image_url} onChange={(e) => update({ og_image_url: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>OG site name</Label>
            <Input value={draft.og_site_name} onChange={(e) => update({ og_site_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Twitter handle</Label>
            <Input
              value={draft.twitter_handle}
              onChange={(e) => update({ twitter_handle: e.target.value })}
              placeholder="@munchreach"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Allow search engines to index the site</p>
              <p className="text-xs text-muted-foreground">
                Turning this off emits a site-wide noindex, nofollow tag on every page.
              </p>
            </div>
            <Switch checked={draft.index_site} onCheckedChange={(checked) => update({ index_site: checked })} />
          </div>
        </div>
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </TabsContent>

      <TabsContent value="verification" className="space-y-4">
        <div className="space-y-4 rounded-lg border border-border/60 bg-card p-5">
          <div className="space-y-1.5">
            <Label>Google Search Console verification code</Label>
            <Input
              value={draft.google_verification}
              onChange={(e) => update({ google_verification: e.target.value })}
              placeholder="google-site-verification content value"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bing Webmaster verification code</Label>
            <Input
              value={draft.bing_verification}
              onChange={(e) => update({ bing_verification: e.target.value })}
              placeholder="msvalidate.01 content value"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Analytics / tracking scripts (head)</Label>
            <Textarea
              rows={6}
              className="font-mono text-xs"
              value={draft.head_scripts}
              onChange={(e) => update({ head_scripts: e.target.value })}
              placeholder="JavaScript injected into <head> on every public page"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Additional tracking scripts (body)</Label>
            <Textarea
              rows={5}
              className="font-mono text-xs"
              value={draft.body_scripts}
              onChange={(e) => update({ body_scripts: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Scripts run on every visitor's browser. Only paste code from providers you trust.
          </p>
        </div>
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </TabsContent>
    </>
  );
}

function PagesPanel({ pages, onSaved }: { pages: any[]; onSaved: () => void }) {
  const save = useServerFn(saveSitePage);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<PageDraft | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((p) => !q || p.path.toLowerCase().includes(q) || (p.title ?? "").toLowerCase().includes(q));
  }, [pages, search]);

  const mutation = useMutation({
    mutationFn: (input: PageDraft) =>
      save({
        data: {
          id: input.id,
          path: input.path,
          title: input.title,
          status: input.status as any,
          seoTitle: input.seo_title || null,
          metaDescription: input.meta_description || null,
          canonicalUrl: input.canonical_url || null,
          ogTitle: input.og_title || null,
          ogDescription: input.og_description || null,
          ogImageUrl: input.og_image_url || null,
          robotsIndex: input.robots_index,
          robotsFollow: input.robots_follow,
          structuredData: input.structured_data || null,
          changefreq: input.changefreq as any,
          priority: input.priority,
          includeInSitemap: input.include_in_sitemap,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Page SEO saved");
      setDraft(null);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search path or title"
          className="pl-8"
        />
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Path</TableHead>
              <TableHead>SEO title</TableHead>
              <TableHead>Indexing</TableHead>
              <TableHead>Health</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((page) => (
              <TableRow key={page.id}>
                <TableCell className="font-mono text-xs">{page.path}</TableCell>
                <TableCell className="max-w-[280px] truncate text-sm">{page.seo_title || "—"}</TableCell>
                <TableCell className="text-xs">
                  {page.robots_index ? "index" : "noindex"}, {page.robots_follow ? "follow" : "nofollow"}
                </TableCell>
                <TableCell className="text-xs">
                  {page.seo_title && page.meta_description ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Complete</span>
                  ) : (
                    <span className="text-amber-500">Incomplete</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        id: page.id,
                        path: page.path,
                        title: page.title ?? "",
                        status: page.status ?? "published",
                        seo_title: page.seo_title ?? "",
                        meta_description: page.meta_description ?? "",
                        canonical_url: page.canonical_url ?? "",
                        og_title: page.og_title ?? "",
                        og_description: page.og_description ?? "",
                        og_image_url: page.og_image_url ?? "",
                        robots_index: page.robots_index ?? true,
                        robots_follow: page.robots_follow ?? true,
                        structured_data: page.structured_data ? JSON.stringify(page.structured_data, null, 2) : "",
                        changefreq: page.changefreq ?? "weekly",
                        priority: page.priority ?? 0.5,
                        include_in_sitemap: page.include_in_sitemap ?? true,
                      })
                    }
                  >
                    Edit SEO
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{draft.path}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 pb-10">
                <div className="space-y-1.5">
                  <Label>SEO title</Label>
                  <Input value={draft.seo_title} onChange={(e) => setDraft({ ...draft, seo_title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Meta description</Label>
                  <Textarea
                    rows={3}
                    value={draft.meta_description}
                    onChange={(e) => setDraft({ ...draft, meta_description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Canonical URL</Label>
                  <Input
                    value={draft.canonical_url}
                    onChange={(e) => setDraft({ ...draft, canonical_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>OG title</Label>
                  <Input value={draft.og_title} onChange={(e) => setDraft({ ...draft, og_title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>OG description</Label>
                  <Textarea
                    rows={2}
                    value={draft.og_description}
                    onChange={(e) => setDraft({ ...draft, og_description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>OG image URL</Label>
                  <Input
                    value={draft.og_image_url}
                    onChange={(e) => setDraft({ ...draft, og_image_url: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <span className="text-sm">Index</span>
                    <Switch
                      checked={draft.robots_index}
                      onCheckedChange={(checked) => setDraft({ ...draft, robots_index: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <span className="text-sm">Follow</span>
                    <Switch
                      checked={draft.robots_follow}
                      onCheckedChange={(checked) => setDraft({ ...draft, robots_follow: checked })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Structured data (JSON-LD)</Label>
                  <Textarea
                    rows={8}
                    className="font-mono text-xs"
                    value={draft.structured_data}
                    onChange={(e) => setDraft({ ...draft, structured_data: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (draft.structured_data.trim()) {
                      try {
                        JSON.parse(draft.structured_data);
                      } catch {
                        toast.error("Structured data must be valid JSON");
                        return;
                      }
                    }
                    mutation.mutate(draft);
                  }}
                >
                  Save page SEO
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
