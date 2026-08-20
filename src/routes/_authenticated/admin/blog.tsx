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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  MediaLibraryPanel,
  MediaPickerDialog,
} from "@/components/admin/MediaLibrary";
import {
  CONTENT_TYPE_LABELS,
  STATUS_LABELS,
  type BlogContentType,
  type BlogPost,
  type BlogStatus,
} from "@/lib/blog-model";
import {
  deleteBlogAuthor,
  deleteBlogCategory,
  deleteBlogPost,
  listAllBlogPosts,
  saveBlogAuthor,
  saveBlogCategory,
  saveBlogPost,
  setBlogPostStatus,
} from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog")({
  head: () => ({
    meta: [
      { title: "Blog CMS — Sendloop Admin" },
      {
        name: "description",
        content:
          "Write, schedule and publish Sendloop blog posts with a rich editor, media library, categories and authors.",
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
  contentFormat: "markdown" | "html";
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
    contentFormat: "html",
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
    contentFormat: (post.content_format as "markdown" | "html") ?? "markdown",
    coverImageUrl: post.cover_image_url ?? "",
    categoryId: post["category_id"] ?? post.category?.id ?? "",
    authorId: post["author_id"] ?? post.author?.id ?? "",
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

/** Legacy markdown-lite posts are converted once, on demand, so nothing is lost. */
function markdownToHtml(markdown: string) {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) {
        const level = heading[1]!.length;
        return `<h${level}>${heading[2]}</h${level}>`;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        const items = trimmed
          .split("\n")
          .map((line) => `<li>${line.replace(/^[-*]\s+/, "")}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (/^>\s+/.test(trimmed)) {
        return `<blockquote><p>${trimmed.replace(/^>\s+/gm, "")}</p></blockquote>`;
      }
      return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
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
  const [coverPicker, setCoverPicker] = useState(false);

  const data = useQuery({ queryKey: ["admin-blog"], queryFn: () => fetchAll() });
  const posts = (data.data?.posts ?? []) as (BlogPost & Record<string, any>)[];
  const categories = data.data?.categories ?? [];
  const authors = data.data?.authors ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-blog"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-sitemap"] });
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
          contentFormat: input.contentFormat,
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
          <h1 className="text-xl font-semibold tracking-tight">Blog CMS</h1>
          <p className="text-sm text-muted-foreground">
            Rich editor, media library, categories and authors. SEO defaults and site-wide settings live in
            Admin → SEO Manager.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="mr-1.5 size-4" /> New post
        </Button>
      </div>

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="authors">Authors</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesPanel categories={categories as any[]} onChanged={invalidate} />
        </TabsContent>

        <TabsContent value="authors">
          <AuthorsPanel authors={authors as any[]} onChanged={invalidate} />
        </TabsContent>

        <TabsContent value="media">
          <MediaLibraryPanel />
        </TabsContent>
      </Tabs>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
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
                  <div className="flex items-center justify-between">
                    <Label>Content</Label>
                    {draft.contentFormat === "markdown" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft({ ...draft, contentFormat: "html", content: markdownToHtml(draft.content) })
                        }
                      >
                        Convert to rich text
                      </Button>
                    ) : null}
                  </div>
                  {draft.contentFormat === "markdown" ? (
                    <Textarea
                      rows={14}
                      className="font-mono text-xs"
                      value={draft.content}
                      onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    />
                  ) : (
                    <RichTextEditor
                      value={draft.content}
                      onChange={(html) => setDraft((prev) => (prev ? { ...prev, content: html } : prev))}
                    />
                  )}
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
                    <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as BlogStatus })}>
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
                  <Label>Featured image</Label>
                  <div className="flex gap-2">
                    <Input
                      value={draft.coverImageUrl}
                      onChange={(e) => setDraft({ ...draft, coverImageUrl: e.target.value })}
                      placeholder="/api/public/media/..."
                    />
                    <Button type="button" variant="outline" onClick={() => setCoverPicker(true)}>
                      Choose
                    </Button>
                  </div>
                  {draft.coverImageUrl ? (
                    <img
                      src={draft.coverImageUrl}
                      alt="Featured preview"
                      className="mt-2 h-32 w-full rounded-md object-cover"
                    />
                  ) : null}
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

                <div className="rounded-lg border border-border/60 p-4">
                  <p className="text-sm font-medium">Post SEO overrides</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Site title, verification codes and tracking scripts live in Admin → SEO Manager.
                  </p>
                  <div className="space-y-3">
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
                  </div>
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

      <MediaPickerDialog
        open={coverPicker}
        onOpenChange={setCoverPicker}
        onSelect={(item) => {
          setDraft((prev) => (prev ? { ...prev, coverImageUrl: item.public_url } : prev));
          setCoverPicker(false);
        }}
      />
    </div>
  );
}

type CategoryDraft = { id?: string; slug: string; name: string; description: string; sortOrder: number };

function CategoriesPanel({ categories, onChanged }: { categories: any[]; onChanged: () => void }) {
  const save = useServerFn(saveBlogCategory);
  const remove = useServerFn(deleteBlogCategory);
  const [draft, setDraft] = useState<CategoryDraft | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CategoryDraft) => save({ data: input }),
    onSuccess: () => {
      toast.success("Category saved");
      setDraft(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Category deleted");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Categories power the /blog filters and category pages.</p>
        <Button size="sm" onClick={() => setDraft({ slug: "", name: "", description: "", sortOrder: 0 })}>
          <Plus className="mr-1.5 size-4" /> New category
        </Button>
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Order</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="text-sm font-medium">{category.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{category.slug}</TableCell>
                <TableCell className="text-xs tabular-nums">{category.sort_order}</TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        id: category.id,
                        slug: category.slug,
                        name: category.name,
                        description: category.description ?? "",
                        sortOrder: category.sort_order ?? 0,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(category.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle>{draft.id ? "Edit category" : "New category"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        name: e.target.value,
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
                  <Label>Description</Label>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.sortOrder}
                    onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!draft.name.trim() || !draft.slug.trim() || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                >
                  Save category
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type AuthorDraft = { id?: string; slug: string; name: string; role: string; bio: string; avatarUrl: string };

function AuthorsPanel({ authors, onChanged }: { authors: any[]; onChanged: () => void }) {
  const save = useServerFn(saveBlogAuthor);
  const remove = useServerFn(deleteBlogAuthor);
  const [draft, setDraft] = useState<AuthorDraft | null>(null);
  const [avatarPicker, setAvatarPicker] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (input: AuthorDraft) =>
      save({ data: { ...input, avatarUrl: input.avatarUrl || null } }),
    onSuccess: () => {
      toast.success("Author saved");
      setDraft(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Author deleted");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Authors show as the byline on every published post.</p>
        <Button size="sm" onClick={() => setDraft({ slug: "", name: "", role: "", bio: "", avatarUrl: "" })}>
          <Plus className="mr-1.5 size-4" /> New author
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {authors.map((author) => (
          <div key={author.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4">
            {author.avatar_url ? (
              <img src={author.avatar_url} alt={author.name} className="size-11 rounded-full object-cover" />
            ) : (
              <div className="grid size-11 place-items-center rounded-full bg-muted text-sm font-medium">
                {author.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{author.name}</p>
              <p className="truncate text-xs text-muted-foreground">{author.role || "—"}</p>
              <div className="mt-2 space-x-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: author.id,
                      slug: author.slug,
                      name: author.name,
                      role: author.role ?? "",
                      bio: author.bio ?? "",
                      avatarUrl: author.avatar_url ?? "",
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => deleteMutation.mutate(author.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle>{draft.id ? "Edit author" : "New author"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        name: e.target.value,
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
                  <Label>Role</Label>
                  <Input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bio</Label>
                  <Textarea rows={4} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Avatar</Label>
                  <div className="flex gap-2">
                    <Input
                      value={draft.avatarUrl}
                      onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })}
                      placeholder="/api/public/media/..."
                    />
                    <Button type="button" variant="outline" onClick={() => setAvatarPicker(true)}>
                      Choose
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!draft.name.trim() || !draft.slug.trim() || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                >
                  Save author
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <MediaPickerDialog
        open={avatarPicker}
        onOpenChange={setAvatarPicker}
        onSelect={(item) => {
          setDraft((prev) => (prev ? { ...prev, avatarUrl: item.public_url } : prev));
          setAvatarPicker(false);
        }}
      />
    </div>
  );
}
