/**
 * Testimonials shown on the marketing site, managed from the Sendloop admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  company: string;
  avatar_url: string | null;
  company_logo_url: string | null;
  testimonial: string;
  result: string | null;
  pages: string[];
  featured: boolean;
  display_order: number;
  active: boolean;
};

const COLUMNS =
  "id, name, role, company, avatar_url, company_logo_url, testimonial, result, pages, featured, display_order, active";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
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

const testimonialInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80).default(""),
  company: z.string().trim().max(80).default(""),
  avatarUrl: z.string().trim().url().or(z.literal("")).optional(),
  companyLogoUrl: z.string().trim().url().or(z.literal("")).optional(),
  testimonial: z.string().trim().min(10).max(600),
  result: z.string().trim().max(80).optional(),
  pages: z.array(z.string().trim().min(1)).max(20),
  featured: z.boolean(),
  displayOrder: z.number().int().min(0).max(999),
  active: z.boolean(),
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
      testimonial: data.testimonial,
      result: data.result || null,
      pages: data.pages,
      featured: data.featured,
      display_order: data.displayOrder,
      active: data.active,
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
