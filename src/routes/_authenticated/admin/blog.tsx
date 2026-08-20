import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  CONTENT_TYPE_LABELS,
  STATUS_LABELS,
  type BlogContentType,
  type BlogPost,
  type BlogStatus,
} from "@/lib/blog-model";
import {
  deleteBlogPost,
  listAllBlogPosts,
  saveBlogPost,
  setBlogPostStatus,
} from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Sendloop Admin" },
      {
        name: "description",
        content: "Write, schedule and publish Sendloop blog posts with full SEO control.",
      },
    ],
  }),
  component: AdminBlogRoute,
});

type Draft = {
  id?: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  categoryId: string;
  authorId: string;
  contentType: BlogContentType;
  status: BlogStatus;
  featured: boolean;
  popularGuide: boolean;
  readingMinutes: number;
  tags: string;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  publishedAt: string;
};

function emptyDraft(): Draft {
  return {
    slug: "",
    title: "",
    subtitle: "",
    excerpt: "",
    content: "",
    coverImageUrl: "",
    categoryId: "",
    authorId: "",
    contentType: "article",
    status: "draft",
    featured: false,
    popularGuide: false,
    readingMinutes: 5,
    tags: "",
    seoTitle: "",
    metaDescription: "",
    canonicalUrl: "",
    ogImageUrl: "",
    publishedAt: "",
  };
}

function toDraft(post: BlogPost & Record<string, any>): Draft {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle ?? "",
    excerpt: post.excerpt ?? "",
    content: post.content ?? "",
    coverImageUrl: post.cover_image_url ?? "",
    categoryId: post.category_id ?? "",
    authorId: post.author_id ?? "",
    contentType: post.content_type,
    status: post.status,
    featured: post.featured,
    popularGuide: post.popular_guide,
    readingMinutes: post.reading_minutes ?? 5,
    tags: (post.tags ?? []).join(", "),
    seoTitle: post.seo_title ?? "",
    metaDescription: post.meta_description ?? "",
    canonicalUrl: post.canonical_url ?? "",
    ogImageUrl: post.og_image_url ?? "",
    publishedAt: post.published_at ? String(post.published_at).slice(0, 16) : "",
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function AdminBlogRoute() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listAllBlogPosts);
  const save = useServerFn(saveBlogPost);
  const setStatus = useServerFn(setBlogPostStatus);
  const remove = useServerFn(deleteBlogPost);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BlogStatus>("all");

  const data = useQuery({ queryKey: ["admin-blog"], queryFn: () => fetchAll() });
  const posts = (data.data?.posts ?? []) as (BlogPost & Record<string, any>)[];
  const categories = data.data?.categories ?? [];
  const authors = data.data?.authors ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-blog"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sitemap"] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: Draft) =>
      save({
        data: {
          ...(input.id ? { id: input.id } : {}),
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle,
          excerpt: input.excerpt,
          content: input.content,
          coverImageUrl: input.coverImageUrl || null,
          categoryId: input.categoryId || null,
          authorId: input.authorId || null,
          contentType: input.contentType,
          status: input.status,
          featured: input.featured,
          popularGuide: input.popularGuide,
          readingMinutes: input.readingMinutes,
          tags: input.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          seoTitle: input.seoTitle || null,
          metaDescription: input.metaDescription || null,
          canonicalUrl: input.canonicalUrl || null,
          ogImageUrl: input.ogImageUrl || null,
          publishedAt: input.publishedAt ? new Date(input.publishedAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Post saved");
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: BlogStatus }) => setStatus({ data: input }),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Post deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(
    () =>
      posts.filter((post) => {
        if (statusFilter !== "all" && post.status !== statusFilter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return post.title.toLowerCase().includes(q) || post.slug.toLowerCase().includes(q);
      }),
    [posts, search, statusFilter],
  );

  const counts = {
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    archived: posts.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Blog</h1>
          <p className="text-sm text-muted-foreground">
            Posts published here appear on /blog and in the sitemap immediately.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="mr-1.5 size-4" /> New post
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-border/60 bg-card p-4">
            <p className="text-xs capitalize text-muted-foreground">{key}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or slug"
            className="w-72 pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>SEO</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No posts match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{post.title}</p>
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      /blog/{post.slug} <ExternalLink className="size-3" />
                    </a>
                  </TableCell>
                  <TableCell className="text-xs">{CONTENT_TYPE_LABELS[post.content_type]}</TableCell>
                  <TableCell>
                    <Select
                      value={post.status}
                      onValueChange={(v) => statusMutation.mutate({ id: post.id, status: v as BlogStatus })}
                    >
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {post.seo_title && post.meta_description ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Complete</span>
                    ) : (
                      <span className="text-amber-500">Incomplete</span>
                    )}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(post))}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(post.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle>{draft.id ? "Edit post" : "New post"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        title: e.target.value,
                        slug: draft.id || draft.slug ? draft.slug : slugify(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug</Label>
                  <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Subtitle</Label>
                  <Input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Excerpt</Label>
                  <Textarea
                    rows={2}
                    value={draft.excerpt}
                    onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Content (markdown)</Label>
                  <Textarea
                    rows={14}
                    className="font-mono text-xs"
                    value={draft.content}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select
                      value={draft.categoryId || "none"}
                      onValueChange={(v) => setDraft({ ...draft, categoryId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Author</Label>
                    <Select
                      value={draft.authorId || "none"}
                      onValueChange={(v) => setDraft({ ...draft, authorId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No author</SelectItem>
                        {authors.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Content type</Label>
                    <Select
                      value={draft.contentType}
                      onValueChange={(v) => setDraft({ ...draft, contentType: v as BlogContentType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={draft.status}
                      onValueChange={(v) => setDraft({ ...draft, status: v as BlogStatus })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Publish date</Label>
                    <Input
                      type="datetime-local"
                      value={draft.publishedAt}
                      onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reading minutes</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.readingMinutes}
                      onChange={(e) => setDraft({ ...draft, readingMinutes: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Tags (comma separated)</Label>
                  <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cover image URL</Label>
                  <Input
                    value={draft.coverImageUrl}
                    onChange={(e) => setDraft({ ...draft, coverImageUrl: e.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <span className="text-sm">Featured post</span>
                    <Switch
                      checked={draft.featured}
                      onCheckedChange={(checked) => setDraft({ ...draft, featured: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <span className="text-sm">Popular guide</span>
                    <Switch
                      checked={draft.popularGuide}
                      onCheckedChange={(checked) => setDraft({ ...draft, popularGuide: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>SEO title</Label>
                  <Input value={draft.seoTitle} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Meta description</Label>
                  <Textarea
                    rows={2}
                    value={draft.metaDescription}
                    onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Canonical URL</Label>
                  <Input
                    value={draft.canonicalUrl}
                    onChange={(e) => setDraft({ ...draft, canonicalUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>OG image URL</Label>
                  <Input
                    value={draft.ogImageUrl}
                    onChange={(e) => setDraft({ ...draft, ogImageUrl: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pb-8">
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate(draft)}
                    disabled={!draft.title.trim() || !draft.slug.trim() || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Save post
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
