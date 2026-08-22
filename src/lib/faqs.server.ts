/**
 * Server helpers for the admin-managed FAQ library.
 *
 * Public reads use the publishable key (the `published = true` policy is the
 * only thing they can see); admin writes go through the caller's own client so
 * RLS still applies as that user.
 */
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";

export type SiteFaq = {
  id: string;
  page_slug: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  published: boolean;
};

export const FAQ_COLUMNS = "id, page_slug, question, answer, category, sort_order, published";

export async function publicFaqClient() {
  const key = SUPABASE_PUBLISHABLE_KEY;
  const url = SUPABASE_URL;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
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
  });
}
