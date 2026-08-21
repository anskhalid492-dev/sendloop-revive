import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SiteFaq } from "@/lib/faqs.server";

/** Public: FAQs an admin assigned to one marketing page slug. */
export const listPageFaqs = createServerFn({ method: "GET" })
  .inputValidator((input: { page: string }) => z.object({ page: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { publicFaqClient, FAQ_COLUMNS } = await import("@/lib/faqs.server");
    const supabase = await publicFaqClient();
    const { data: rows, error } = await supabase
      .from("site_faqs")
      .select(FAQ_COLUMNS)
      .eq("page_slug", data.page)
      .eq("published", true)
      .order("sort_order", { ascending: true });
    if (error) return [] as SiteFaq[];
    return (rows ?? []) as SiteFaq[];
  });

/** Admin: every FAQ, published or not. */
export const listAllFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { FAQ_COLUMNS } = await import("@/lib/faqs.server");
    const { data, error } = await context.supabase
      .from("site_faqs")
      .select(FAQ_COLUMNS)
      .order("page_slug", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SiteFaq[];
  });

export const saveFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        pageSlug: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
        question: z.string().trim().min(5).max(200),
        answer: z.string().trim().min(5).max(1200),
        category: z.string().trim().min(1).max(40).default("general"),
        sortOrder: z.number().int().min(0).max(999),
        published: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      page_slug: data.pageSlug,
      question: data.question,
      answer: data.answer,
      category: data.category,
      sort_order: data.sortOrder,
      published: data.published,
    };
    if (data.id) {
      const { error } = await context.supabase.from("site_faqs").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("site_faqs")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("site_faqs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
