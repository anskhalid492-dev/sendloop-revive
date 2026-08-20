import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";
/**
 * Testimonials shown on the marketing site, managed from the Sendloop admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReviewCategory } from "@/lib/reviews";

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  company: string;
  avatar_url: string | null;
  company_logo_url: string | null;
  bio: string | null;
  testimonial: string;
  result: string | null;
  pages: string[];
  featured: boolean;
  display_order: number;
  active: boolean;
  rating: number;
  category: ReviewCategory;
  verified: boolean;
  reviewed_on: string;
};



const COLUMNS =
  "id, name, role, company, bio, avatar_url, company_logo_url, testimonial, result, pages, featured, display_order, active, rating, category, verified, reviewed_on";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_PUBLISHABLE_KEY;
  const url = process.env["SUPABASE_URL"] || SUPABASE_URL;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

/** Public: testimonials for one marketing page slug (e.g. "warmup"). */
export const listTestimonials = createServerFn({ method: "GET" })
  .inputValidator((input: { page: string }) => z.object({ page: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    const { data: rows, error } = await supabase
      .from("testimonials")
      .select(COLUMNS)
      .eq("active", true)
      .order("display_order", { ascending: true });
    if (error) return [] as Testimonial[];
    const all = (rows ?? []) as Testimonial[];
    const matching = all.filter((t) => t.pages.includes(data.page));
    return (matching.length > 0 ? matching : all.filter((t) => t.featured)) as Testimonial[];
  });

/** Public: every published review, newest-ordered by admin display order. */
export const listPublicReviews = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await publicClient();
  const { data, error } = await supabase
    .from("testimonials")
    .select(COLUMNS)
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("display_order", { ascending: true })
    .order("reviewed_on", { ascending: false });
  if (error) return [] as Testimonial[];
  return (data ?? []) as Testimonial[];
});

export type ReviewStats = {
  customers: number;
  emailsSent: number;
  campaigns: number;
  averageRating: number | null;
  reviews: number;
};

/** Public: aggregate-only social proof. Never returns individual records. */
export const getReviewStats = createServerFn({ method: "GET" }).handler(async (): Promise<ReviewStats> => {
  const supabase = await publicClient();
  const { data, error } = await supabase.rpc("public_review_stats");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { customers: number; emails_sent: number; campaigns: number; average_rating: number | null; reviews: number }
    | undefined;
  if (error || !row) {
    return { customers: 0, emailsSent: 0, campaigns: 0, averageRating: null, reviews: 0 };
  }
  return {
    customers: Number(row.customers ?? 0),
    emailsSent: Number(row.emails_sent ?? 0),
    campaigns: Number(row.campaigns ?? 0),
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    reviews: Number(row.reviews ?? 0),
  };
});

const testimonialInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80).default(""),
  company: z.string().trim().max(80).default(""),
  avatarUrl: z.string().trim().url().or(z.literal("")).optional(),
  companyLogoUrl: z.string().trim().url().or(z.literal("")).optional(),
  bio: z.string().trim().max(200).optional(),
  testimonial: z.string().trim().min(10).max(600),
  result: z.string().trim().max(80).optional(),
  pages: z.array(z.string().trim().min(1)).max(20),
  featured: z.boolean(),
  displayOrder: z.number().int().min(0).max(999),
  active: z.boolean(),
  rating: z.number().int().min(1).max(5).default(5),
  category: z.enum(["agency", "saas", "sales", "recruiting", "consulting", "other"]).default("other"),
  verified: z.boolean().default(false),
  reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listAllTestimonials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("testimonials")
      .select(COLUMNS)
      .order("display_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Testimonial[];
  });

export const saveTestimonial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => testimonialInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      name: data.name,
      role: data.role,
      company: data.company,
      avatar_url: data.avatarUrl || null,
      company_logo_url: data.companyLogoUrl || null,
      bio: data.bio || null,
      testimonial: data.testimonial,
      result: data.result || null,
      pages: data.pages,
      featured: data.featured,
      display_order: data.displayOrder,
      active: data.active,
      rating: data.rating,
      category: data.category,
      verified: data.verified,
      reviewed_on: data.reviewedOn,
    };

    if (data.id) {
      const { error } = await context.supabase.from("testimonials").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("testimonials")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteTestimonial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("testimonials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Admin: store a customer photo or company logo.
 *
 * The bucket is private, so the caller receives a long-lived signed URL that is
 * persisted on the review row — public visitors never need storage credentials.
 */
export const uploadReviewImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["avatar", "logo"]),
        fileName: z.string().min(1).max(200),
        contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
        /** Base64 payload without the data-URL prefix. */
        data: z.string().min(16).max(4_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only Sendloop admins can upload review images.");

    const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 2_000_000) throw new Error("Images must be 2 MB or smaller.");

    const ext = data.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${data.kind}/${crypto.randomUUID()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("review-media")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);

    // Ten years: the page is public and these assets are not sensitive.
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("review-media")
      .createSignedUrl(path, 60 * 60 * 24 * 3650);
    if (signError || !signed) throw new Error(signError?.message ?? "Could not create image URL");
    return { url: signed.signedUrl };
  });
