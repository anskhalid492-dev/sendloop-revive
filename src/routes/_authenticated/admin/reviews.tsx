import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REVIEW_CATEGORIES, categoryLabel, type ReviewCategory } from "@/lib/reviews";
import {
  deleteTestimonial,
  listAllTestimonials,
  saveTestimonial,
  uploadReviewImage,
  type Testimonial,
} from "@/lib/testimonials.functions";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Customer Reviews — Sendloop Admin" },
      {
        name: "description",
        content: "Publish, feature and moderate the customer reviews shown on the Sendloop marketing site.",
      },
    ],
  }),
  component: AdminReviewsPage,
});

type Draft = {
  id?: string;
  name: string;
  role: string;
  company: string;
  bio: string;
  avatarUrl: string;
  companyLogoUrl: string;
  testimonial: string;
  result: string;
  pages: string;
  featured: boolean;
  displayOrder: number;
  active: boolean;
  rating: number;
  category: ReviewCategory;
  verified: boolean;
  reviewedOn: string;
};

function emptyDraft(): Draft {
  return {
    name: "",
    role: "",
    company: "",
    bio: "",
    avatarUrl: "",
    companyLogoUrl: "",
    testimonial: "",
    result: "",
    pages: "",
    featured: false,
    displayOrder: 0,
    active: true,
    rating: 5,
    category: "other",
    verified: false,
    reviewedOn: new Date().toISOString().slice(0, 10),
  };
}

function toDraft(t: Testimonial): Draft {
  return {
    id: t.id,
    name: t.name,
    role: t.role,
    company: t.company,
    bio: t.bio ?? "",
    avatarUrl: t.avatar_url ?? "",
    companyLogoUrl: t.company_logo_url ?? "",
    testimonial: t.testimonial,
    result: t.result ?? "",
    pages: t.pages.join(", "),
    featured: t.featured,
    displayOrder: t.display_order,
    active: t.active,
    rating: t.rating,
    category: t.category,
    verified: t.verified,
    reviewedOn: t.reviewed_on,
  };
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

function AdminReviewsPage() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listAllTestimonials);
  const save = useServerFn(saveTestimonial);
  const remove = useServerFn(deleteTestimonial);
  const upload = useServerFn(uploadReviewImage);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "logo" | null>(null);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: () => fetchAll(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
  };

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          ...(d.id ? { id: d.id } : {}),
          name: d.name,
          role: d.role,
          company: d.company,
          bio: d.bio,
          avatarUrl: d.avatarUrl,
          companyLogoUrl: d.companyLogoUrl,
          testimonial: d.testimonial,
          result: d.result,
          pages: d.pages
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          featured: d.featured,
          displayOrder: d.displayOrder,
          active: d.active,
          rating: d.rating,
          category: d.category,
          verified: d.verified,
          reviewedOn: d.reviewedOn,
        },
      }),
    onSuccess: () => {
      toast.success("Review saved");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Review deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpload = async (kind: "avatar" | "logo", file: File) => {
    if (!draft) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast.error("Use a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("Images must be 2 MB or smaller.");
      return;
    }
    setUploading(kind);
    try {
      const base64 = await readBase64(file);
      const { url } = await upload({
        data: {
          kind,
          fileName: file.name,
          contentType: file.type as "image/png",
          data: base64,
        },
      });
      setDraft((d) => (d ? { ...d, [kind === "avatar" ? "avatarUrl" : "companyLogoUrl"]: url } : d));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Customer Reviews</h1>
          <p className="text-sm text-muted-foreground">
            Everything published here appears on the public /customer-reviews page.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="size-4" /> New review
        </Button>
      </header>

      {draft ? (
        <form
          className="surface-card space-y-5 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate(draft);
          }}
        >
          <h2 className="text-lg font-semibold">{draft.id ? "Edit review" : "New review"}</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Customer name</Label>
              <Input
                id="name"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Short bio</Label>
            <Input
              id="bio"
              placeholder="Leads a 12-person outbound team in Berlin"
              value={draft.bio}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="testimonial">Review</Label>
            <Textarea
              id="testimonial"
              required
              rows={5}
              value={draft.testimonial}
              onChange={(e) => setDraft({ ...draft, testimonial: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="rating">Rating</Label>
              <Select
                value={String(draft.rating)}
                onValueChange={(v) => setDraft({ ...draft, rating: Number(v) })}
              >
                <SelectTrigger id="rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r} star{r === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(v) => setDraft({ ...draft, category: v as ReviewCategory })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reviewedOn">Review date</Label>
              <Input
                id="reviewedOn"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={draft.reviewedOn}
                onChange={(e) => setDraft({ ...draft, reviewedOn: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order">Display order</Label>
              <Input
                id="order"
                type="number"
                min={0}
                value={draft.displayOrder}
                onChange={(e) => setDraft({ ...draft, displayOrder: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="result">Result highlight (optional)</Label>
              <Input
                id="result"
                placeholder="e.g. 3.2x reply rate"
                value={draft.result}
                onChange={(e) => setDraft({ ...draft, result: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pages">Marketing pages (comma separated slugs)</Label>
              <Input
                id="pages"
                placeholder="warmup, crm"
                value={draft.pages}
                onChange={(e) => setDraft({ ...draft, pages: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(["avatar", "logo"] as const).map((kind) => {
              const value = kind === "avatar" ? draft.avatarUrl : draft.companyLogoUrl;
              const field = kind === "avatar" ? "avatarUrl" : "companyLogoUrl";
              return (
                <div key={kind} className="space-y-1.5">
                  <Label htmlFor={`${kind}-url`}>
                    {kind === "avatar" ? "Customer photo" : "Company logo"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${kind}-url`}
                      placeholder="https://…"
                      value={value}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                    />
                    <Button type="button" variant="outline" size="icon" asChild>
                      <label className="cursor-pointer" aria-label={`Upload ${kind}`}>
                        {uploading === kind ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Upload className="size-4" />
                        )}
                        <input
                          type="file"
                          className="sr-only"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUpload(kind, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </Button>
                  </div>
                  {value ? (
                    <img src={value} alt="" className="mt-1 h-10 w-auto rounded object-contain" />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v })}
              />
              Published
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.featured}
                onCheckedChange={(v) => setDraft({ ...draft, featured: v })}
              />
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.verified}
                onCheckedChange={(v) => setDraft({ ...draft, verified: v })}
              />
              Verified customer
            </label>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save review
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center text-muted-foreground">
          No reviews yet. Add the first one once a customer has sent it to you.
        </p>
      ) : (
        <div className="surface-card divide-y divide-border/60">
          {reviews.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{r.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {[r.role, r.company].filter(Boolean).join(", ")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="size-3 fill-primary text-primary" /> {r.rating}
                  </span>
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {categoryLabel(r.category)}
                  </span>
                  {r.featured ? (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                      Featured
                    </span>
                  ) : null}
                  {r.verified ? (
                    <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                      Verified
                    </span>
                  ) : null}
                  {!r.active ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Hidden
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.testimonial}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(r))}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete review by ${r.name}`}
                  onClick={() => {
                    if (confirm(`Delete the review by ${r.name}? This cannot be undone.`)) {
                      deleteMutation.mutate(r.id);
                    }
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
