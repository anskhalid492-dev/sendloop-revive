import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, ImagePlus, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaPickerDialog } from "@/components/admin/MediaLibrary";
import { HelpArticleBody, HelpTableOfContents, parseHelpArticle } from "@/components/help/HelpArticleBody";
import { HELP_CATEGORIES, categoryName } from "@/lib/help-center";
import { helpArticleSchema, type HelpArticleDraft } from "@/lib/help-center-cms";
import { deleteHelpArticle, listAdminHelpArticles, saveHelpArticle } from "@/lib/help-center-cms.functions";

const articlesQuery = queryOptions({ queryKey: ["admin-help-center"], queryFn: () => listAdminHelpArticles() });
export const Route = createFileRoute("/_authenticated/mranuskhalid/help-center")({
  loader: ({ context }) => context.queryClient.ensureQueryData(articlesQuery),
  head: () => ({ meta: [
    { title: "Help Center Articles — MunchReach Admin" },
    { name: "description", content: "Manage MunchReach Help Center articles, categories, drafts and SEO." },
    { property: "og:title", content: "Help Center Articles — MunchReach Admin" },
    { property: "og:description", content: "Manage MunchReach Help Center articles and publishing." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  errorComponent: ({ error }) => <div role="alert" className="space-y-3"><h1 className="text-2xl font-semibold">Help Center</h1><p className="text-sm text-destructive">{error instanceof Error ? error.message : "Articles could not be loaded"}</p></div>,
  component: HelpCenterAdmin,
});

const emptyDraft = (): HelpArticleDraft => ({ title: "", slug: "", category: "getting-started", description: "", content: "", seoTitle: "", metaDescription: "", published: false });

function HelpCenterAdmin() {
  const { data: articles } = useSuspenseQuery(articlesQuery);
  const qc = useQueryClient();
  const router = useRouter();
  const save = useServerFn(saveHelpArticle);
  const remove = useServerFn(deleteHelpArticle);
  const [draft, setDraft] = useState<HelpArticleDraft | null>(null);
  const [lockedSlug, setLockedSlug] = useState(false);
  const [preview, setPreview] = useState(false);
  const [media, setMedia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const visible = articles.filter((a) => a.title.toLowerCase().includes(query.toLowerCase()) &&
    (category === "all" || a.category === category) &&
    (status === "all" ? !a.deleted : status === "deleted" ? a.deleted : !a.deleted && (status === "published" ? a.published : !a.published)));

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["admin-help-center"] });
    await qc.invalidateQueries({ queryKey: ["public-help-articles"] });
    await router.invalidate();
  }

  async function persist(published: boolean) {
    if (!draft) return;
    const parsed = helpArticleSchema.safeParse({ ...draft, published });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check article fields"); return; }
    setBusy(true);
    try {
      const result = await save({ data: parsed.data });
      setDraft({ ...parsed.data, id: result.id }); setLockedSlug(true);
      await refresh(); toast.success(published ? "Article published" : "Draft saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save article"); }
    finally { setBusy(false); }
  }

  const sections = parseHelpArticle(draft?.content ?? "");
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">Help Center</h1>
      <Button onClick={() => { setDraft(emptyDraft()); setLockedSlug(false); }}><Plus className="size-4" />Create Article</Button>
    </header>
    {draft ? <section className="space-y-5 border-y border-border py-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{lockedSlug ? "Edit article" : "Create Article"}</h2><Button variant="ghost" onClick={() => setDraft(null)}>Close editor</Button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="hc-title">Title</Label><Input id="hc-title" value={draft.title} maxLength={160} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="hc-slug">Article slug</Label><Input id="hc-slug" value={draft.slug} disabled={lockedSlug} maxLength={120} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} /></div>
        <div className="space-y-2"><Label>Category</Label><Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}><SelectTrigger aria-label="Article category"><SelectValue /></SelectTrigger><SelectContent>{HELP_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="hc-description">Summary</Label><Input id="hc-description" maxLength={400} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
      </div>
      <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="hc-content">Content</Label><Button variant="outline" size="sm" onClick={() => setMedia(true)}><ImagePlus className="size-4" />Insert image</Button></div><Textarea id="hc-content" rows={18} maxLength={100000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="hc-seo">SEO title</Label><Input id="hc-seo" maxLength={160} value={draft.seoTitle} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="hc-meta">SEO description</Label><Textarea id="hc-meta" rows={2} maxLength={320} value={draft.metaDescription} onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="outline" onClick={() => void persist(false)}><Save className="size-4" />{draft.published ? "Unpublish & save draft" : "Save draft"}</Button><Button disabled={busy} onClick={() => void persist(true)}>{draft.published ? "Save published article" : "Publish article"}</Button><Button variant="ghost" onClick={() => setPreview(true)}><Eye className="size-4" />Preview</Button></div>
      {media ? <MediaPickerDialog open={media} onOpenChange={setMedia} onSelect={(item) => { setDraft({ ...draft, content: `${draft.content}\n\n![${(item.alt_text || item.file_name).replace(/[\]\n]/g, " ")}](${item.public_url})\n` }); setMedia(false); }} /> : null}
    </section> : null}
    <div className="flex flex-wrap gap-3">
      <Input aria-label="Search articles" placeholder="Search articles" className="max-w-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-56" aria-label="Filter category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{HELP_CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40" aria-label="Filter status"><SelectValue /></SelectTrigger><SelectContent>{["all", "published", "draft", "deleted"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All articles" : s[0]?.toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="divide-y divide-border border-y border-border">{visible.length ? visible.map((a) => <div key={a.slug} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{a.title}</h3><p className="text-xs text-muted-foreground">{categoryName(a.category)} · {a.deleted ? "Deleted" : a.published ? "Published" : "Draft"}</p></div><Button variant="outline" size="sm" onClick={() => { setDraft({ id: a.id, slug: a.slug, title: a.title, category: a.category, description: a.description, content: a.content, seoTitle: a.seoTitle ?? "", metaDescription: a.metaDescription ?? "", published: a.deleted ? false : a.published }); setLockedSlug(true); }}><Pencil className="size-4" />{a.deleted ? "Restore & edit" : "Edit"}</Button>{!a.deleted ? <Button size="icon" variant="ghost" aria-label={`Delete ${a.title}`} title="Delete article" onClick={() => setDeleting(a.slug)}><Trash2 className="size-4" /></Button> : null}</div>) : <p className="py-8 text-sm text-muted-foreground">No articles found.</p>}</div>
    <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>Article preview</DialogTitle></DialogHeader><p className="text-xs text-primary">{categoryName(draft?.category ?? "")}</p><h1 className="text-3xl font-bold">{draft?.title}</h1><p className="text-muted-foreground">{draft?.description}</p><div className="grid gap-8 lg:grid-cols-[1fr_220px]"><HelpArticleBody sections={sections} /><HelpTableOfContents sections={sections} /></div></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(v) => { if (!v) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete article?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">The article will be removed from the Help Center. You can restore it from Deleted articles.</p><Button variant="destructive" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); try { await remove({ data: { slug: deleting } }); if (draft?.slug === deleting) setDraft(null); setDeleting(null); await refresh(); toast.success("Article deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete article"); } finally { setBusy(false); } }}>Delete article</Button></DialogContent></Dialog>
  </div>;
}