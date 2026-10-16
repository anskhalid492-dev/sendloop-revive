import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Linkedin, Loader2, Mail, Plus, Search, Trash2, Twitter } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/mranuskhalid/blog")({
  head: () => ({
    meta: [
      { title: "Blog CMS — MunchReach Admin" },
      {
        name: "description",
        content:
          "Write, schedule and publish MunchReach blog posts with a rich editor, media library, categories and authors.",
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
    publishedAt: toLocalInput(post.published_at),
  };
}

/**
 * `datetime-local` inputs are naive local time; stored timestamps are UTC.
 * Converting in both directions keeps a post from drifting into the future
 * (and disappearing from the public site) every time an admin re-saves it.
 */
function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
          publishedAt: fromLocalInput(input.publishedAt),
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
          <TabsTrigger value="settings">Settings</TabsTrigger>
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

        <TabsContent value="settings">
          <PromoBannerSettings />
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

type AuthorDraft = {
  id?: string;
  slug: string;
  name: string;
  role: string;
  bio: string;
  fullBio: string;
  avatarUrl: string;
  coverImageUrl: string;
  location: string;
  company: string;
  websiteUrl: string;
  linkedinUrl: string;
  xUrl: string;
  publicEmail: string;
  showEmail: boolean;
  introduction: string;
  experience: string;
  certifications: string;
  languages: string;
  featuredQuote: string;
  expertise: string[];
  topics: string[];
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  noindex: boolean;
};

const emptyAuthorDraft: AuthorDraft = {
  slug: "",
  name: "",
  role: "",
  bio: "",
  fullBio: "",
  avatarUrl: "",
  coverImageUrl: "",
  location: "",
  company: "",
  websiteUrl: "",
  linkedinUrl: "",
  xUrl: "",
  publicEmail: "",
  showEmail: true,
  introduction: "",
  experience: "",
  certifications: "",
  languages: "",
  featuredQuote: "",
  expertise: [],
  topics: [],
  seoTitle: "",
  metaDescription: "",
  canonicalUrl: "",
  ogImageUrl: "",
  noindex: false,
};

function authorToDraft(author: any): AuthorDraft {
  return {
    id: author.id,
    slug: author.slug ?? "",
    name: author.name ?? "",
    role: author.role ?? "",
    bio: author.bio ?? "",
    fullBio: author.full_bio ?? "",
    avatarUrl: author.avatar_url ?? "",
    coverImageUrl: author.cover_image_url ?? "",
    location: author.location ?? "",
    company: author.company ?? "",
    websiteUrl: author.website_url ?? "",
    linkedinUrl: author.linkedin_url ?? "",
    xUrl: author.x_url ?? "",
    publicEmail: author.public_email ?? "",
    showEmail: author.show_email !== false,
    introduction: author.introduction ?? "",
    experience: author.experience ?? "",
    certifications: author.certifications ?? "",
    languages: author.languages ?? "",
    featuredQuote: author.featured_quote ?? "",
    expertise: author.expertise ?? [],
    topics: author.topics ?? [],
    seoTitle: author.seo_title ?? "",
    metaDescription: author.meta_description ?? "",
    canonicalUrl: author.canonical_url ?? "",
    ogImageUrl: author.og_image_url ?? "",
    noindex: author.noindex === true,
  };
}

/** Comma/Enter-driven tag editor used for expertise and topics. */
function TagEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim().replace(/,+$/, "");
    if (value && !values.includes(value) && values.length < 20) onChange([...values, value]);
    setText("");
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(values.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={text}
          placeholder={values.length ? "" : placeholder}
          onChange={(e) => {
            if (e.target.value.endsWith(",")) {
              setText(e.target.value);
              setTimeout(add, 0);
            } else setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}

function AuthorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border/60 p-4">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

const AUTHORS_PAGE_SIZE = 9;

function AuthorsPanel({ authors, onChanged }: { authors: any[]; onChanged: () => void }) {
  const save = useServerFn(saveBlogAuthor);
  const remove = useServerFn(deleteBlogAuthor);
  const [draft, setDraft] = useState<AuthorDraft | null>(null);
  const [picker, setPicker] = useState<"avatar" | "cover" | "og" | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: AuthorDraft) =>
      save({
        data: {
          ...input,
          avatarUrl: input.avatarUrl || null,
          coverImageUrl: input.coverImageUrl || null,
          seoTitle: input.seoTitle || null,
          metaDescription: input.metaDescription || null,
          canonicalUrl: input.canonicalUrl || null,
          ogImageUrl: input.ogImageUrl || null,
        },
      }),
    onSuccess: () => {
      toast.success("Author saved");
      setDraft(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (input: { id: string; confirm: boolean }) => remove({ data: input }),
    onSuccess: () => {
      toast.success("Author deleted");
      setPendingDelete(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = authors.filter((a) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [a.name, a.role, a.slug].some((v) => String(v ?? "").toLowerCase().includes(term));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / AUTHORS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * AUTHORS_PAGE_SIZE, safePage * AUTHORS_PAGE_SIZE + AUTHORS_PAGE_SIZE);

  const patchDraft = (patch: Partial<AuthorDraft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Authors show as the byline on every published post and get a public profile page.
        </p>
        <Button size="sm" onClick={() => setDraft({ ...emptyAuthorDraft })}>
          <Plus className="mr-1.5 size-4" /> New author
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search authors…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((author) => (
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
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                /blog/author/{author.slug} · {author.post_count ?? 0} published
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setDraft(authorToDraft(author))}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/blog/author/${author.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" /> Preview
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setPendingDelete(author)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No authors match your search.</p>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {safePage + 1} of {pageCount} · {filtered.length} authors
          </span>
          <div className="space-x-1">
            <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle>{draft.id ? "Edit author" : "New author"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 pb-8">
                <AuthorSection title="Basic information">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Full name</Label>
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
                      <Label>URL slug</Label>
                      <Input
                        value={draft.slug}
                        onChange={(e) => patchDraft({ slug: slugify(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Professional title / role</Label>
                      <Input value={draft.role} onChange={(e) => patchDraft({ role: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Location (optional)</Label>
                      <Input value={draft.location} onChange={(e) => patchDraft({ location: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company / organization</Label>
                      <Input value={draft.company} onChange={(e) => patchDraft({ company: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Personal website</Label>
                      <Input
                        value={draft.websiteUrl}
                        placeholder="https://…"
                        onChange={(e) => patchDraft({ websiteUrl: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Short bio ({draft.bio.length}/200)</Label>
                    <Textarea
                      rows={2}
                      maxLength={200}
                      value={draft.bio}
                      onChange={(e) => patchDraft({ bio: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Full biography</Label>
                    <RichTextEditor value={draft.fullBio} onChange={(html) => patchDraft({ fullBio: html })} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Profile avatar</Label>
                      <div className="flex gap-2">
                        <Input
                          value={draft.avatarUrl}
                          placeholder="/api/public/media/…"
                          onChange={(e) => patchDraft({ avatarUrl: e.target.value })}
                        />
                        <Button type="button" variant="outline" onClick={() => setPicker("avatar")}>
                          Choose
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cover / banner image (optional)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={draft.coverImageUrl}
                          placeholder="/api/public/media/…"
                          onChange={(e) => patchDraft({ coverImageUrl: e.target.value })}
                        />
                        <Button type="button" variant="outline" onClick={() => setPicker("cover")}>
                          Choose
                        </Button>
                      </div>
                    </div>
                  </div>
                </AuthorSection>

                <AuthorSection title="Social profiles & contact">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Linkedin className="size-3.5" /> LinkedIn profile URL
                      </Label>
                      <Input
                        value={draft.linkedinUrl}
                        placeholder="https://www.linkedin.com/in/…"
                        onChange={(e) => patchDraft({ linkedinUrl: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Twitter className="size-3.5" /> X (Twitter) profile URL
                      </Label>
                      <Input
                        value={draft.xUrl}
                        placeholder="https://x.com/…"
                        onChange={(e) => patchDraft({ xUrl: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Mail className="size-3.5" /> Public email address
                      </Label>
                      <Input
                        value={draft.publicEmail}
                        placeholder="name@example.com"
                        onChange={(e) => patchDraft({ publicEmail: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <Switch
                        checked={draft.showEmail}
                        onCheckedChange={(checked) => patchDraft({ showEmail: checked })}
                        id="author-show-email"
                      />
                      <Label htmlFor="author-show-email">Show email publicly</Label>
                    </div>
                  </div>
                </AuthorSection>

                <AuthorSection title="Professional background">
                  <div className="space-y-1.5">
                    <Label>Professional introduction</Label>
                    <Textarea
                      rows={2}
                      value={draft.introduction}
                      onChange={(e) => patchDraft({ introduction: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TagEditor
                      label="Areas of expertise"
                      values={draft.expertise}
                      onChange={(expertise) => patchDraft({ expertise })}
                      placeholder="Type and press Enter"
                    />
                    <TagEditor
                      label="Topics they write about"
                      values={draft.topics}
                      onChange={(topics) => patchDraft({ topics })}
                      placeholder="Type and press Enter"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Professional experience</Label>
                    <Textarea
                      rows={3}
                      value={draft.experience}
                      onChange={(e) => patchDraft({ experience: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Certifications / credentials</Label>
                      <Textarea
                        rows={2}
                        value={draft.certifications}
                        onChange={(e) => patchDraft({ certifications: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Languages</Label>
                      <Input value={draft.languages} onChange={(e) => patchDraft({ languages: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Featured quote</Label>
                    <Textarea
                      rows={2}
                      value={draft.featuredQuote}
                      onChange={(e) => patchDraft({ featuredQuote: e.target.value })}
                    />
                  </div>
                </AuthorSection>

                <AuthorSection title="SEO settings">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>SEO title</Label>
                      <Input value={draft.seoTitle} onChange={(e) => patchDraft({ seoTitle: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Canonical URL (optional)</Label>
                      <Input
                        value={draft.canonicalUrl}
                        onChange={(e) => patchDraft({ canonicalUrl: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Meta description</Label>
                    <Textarea
                      rows={2}
                      value={draft.metaDescription}
                      onChange={(e) => patchDraft({ metaDescription: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Social sharing image</Label>
                    <div className="flex gap-2">
                      <Input
                        value={draft.ogImageUrl}
                        placeholder="/api/public/media/…"
                        onChange={(e) => patchDraft({ ogImageUrl: e.target.value })}
                      />
                      <Button type="button" variant="outline" onClick={() => setPicker("og")}>
                        Choose
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={draft.noindex}
                      onCheckedChange={(checked) => patchDraft({ noindex: checked })}
                      id="author-noindex"
                    />
                    <Label htmlFor="author-noindex">Noindex this profile (hide from search engines)</Label>
                  </div>
                </AuthorSection>

                <Button
                  className="w-full"
                  disabled={!draft.name.trim() || !draft.slug.trim() || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  Save author
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <MediaPickerDialog
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        onSelect={(item) => {
          if (picker === "avatar") patchDraft({ avatarUrl: item.public_url });
          if (picker === "cover") patchDraft({ coverImageUrl: item.public_url });
          if (picker === "og") patchDraft({ ogImageUrl: item.public_url });
          setPicker(null);
        }}
      />

      <Sheet open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {pendingDelete ? (
            <>
              <SheetHeader>
                <SheetTitle>Delete {pendingDelete.name}?</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                {(pendingDelete.post_count ?? 0) > 0 ? (
                  <p>
                    This author is assigned to {pendingDelete.post_count} published post
                    {pendingDelete.post_count === 1 ? "" : "s"}. Deleting removes the byline from those posts. You can
                    reassign the posts to another author first, or confirm deletion.
                  </p>
                ) : (
                  <p>This author has no published posts. The profile page will stop resolving.</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPendingDelete(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteMutation.isPending}
                    onClick={() =>
                      deleteMutation.mutate({ id: pendingDelete.id, confirm: (pendingDelete.post_count ?? 0) > 0 })
                    }
                  >
                    Delete author
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

function PromoBannerSettings() {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getBlogPromoBanner);
  const saveFn = useServerFn(saveBlogPromoBanner);
  const query = useQuery({ queryKey: ["blog-promo-banner"], queryFn: () => getFn() });
  const [form, setForm] = useState<BlogPromoBannerConfig | null>(null);
  const config = form ?? query.data ?? null;

  const saveMutation = useMutation({
    mutationFn: (value: BlogPromoBannerConfig) => saveFn({ data: value }),
    onSuccess: () => {
      toast.success("Promotional banner saved");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["blog-promo-banner"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the banner"),
  });

  if (!config) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading banner settings…
      </div>
    );
  }

  const set = <K extends keyof BlogPromoBannerConfig>(key: K, value: BlogPromoBannerConfig[K]) =>
    setForm({ ...config, [key]: value });

  const colorField = (label: string, key: keyof BlogPromoBannerConfig) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
          value={String(config[key])}
          onChange={(e) => set(key, e.target.value as never)}
        />
        <Input value={String(config[key])} onChange={(e) => set(key, e.target.value as never)} className="font-mono" />
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="rounded-lg border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Promotional Banner</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                One centrally managed card shown in the sidebar of every published blog post. Disabling hides it
                everywhere.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="promo-enabled" className="text-xs">Enabled</Label>
              <Switch id="promo-enabled" checked={config.enabled} onCheckedChange={(v) => set("enabled", v)} />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/60 bg-card p-5">
          <h3 className="text-sm font-semibold">Content</h3>
          <div className="space-y-1.5">
            <Label htmlFor="promo-heading">Heading</Label>
            <Input id="promo-heading" value={config.heading} maxLength={120} onChange={(e) => set("heading", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-description">Description</Label>
            <Textarea id="promo-description" value={config.description} maxLength={240} rows={2} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="promo-cta">Button text</Label>
              <Input id="promo-cta" value={config.ctaLabel} maxLength={80} onChange={(e) => set("ctaLabel", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-url">Button destination URL</Label>
              <Input id="promo-url" value={config.ctaUrl} placeholder="/pricing" onChange={(e) => set("ctaUrl", e.target.value)} />
              <p className="text-xs text-muted-foreground">Internal path like /pricing, or a full https:// URL.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-icon">Brand icon / image URL (optional)</Label>
            <Input id="promo-icon" value={config.iconUrl} placeholder="Leave empty to use the MunchReach favicon" onChange={(e) => set("iconUrl", e.target.value)} />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/60 bg-card p-5">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {colorField("Background color", "backgroundColor")}
            {colorField("Text color", "textColor")}
            {colorField("Button background", "buttonBackgroundColor")}
            {colorField("Button text color", "buttonTextColor")}
            {colorField("Border color", "borderColor")}
            <div className="space-y-1.5">
              <Label htmlFor="promo-radius">Border radius (px)</Label>
              <Input id="promo-radius" type="number" min={0} max={32} value={config.borderRadius} onChange={(e) => set("borderRadius", Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/60 bg-card p-5">
          <h3 className="text-sm font-semibold">Display</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="promo-position">Sidebar position</Label>
              <Input id="promo-position" type="number" min={0} max={99} value={config.position} onChange={(e) => set("position", Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">0 = top of the sidebar.</p>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="promo-desktop" checked={config.showOnDesktop} onCheckedChange={(v) => set("showOnDesktop", v)} />
              <Label htmlFor="promo-desktop" className="text-xs">Show on desktop</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="promo-mobile" checked={config.showOnMobile} onCheckedChange={(v) => set("showOnMobile", v)} />
              <Label htmlFor="promo-mobile" className="text-xs">Show on mobile</Label>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(config)}>
            {saveMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Save banner
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Live preview</p>
        <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 p-4">
          <BlogPromoBanner config={config} variant="sidebar" />
        </div>
      </div>
    </div>
  );
}
