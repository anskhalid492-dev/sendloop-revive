/** Admin CRUD for referrer notification templates. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REFERRAL_TEMPLATE_KINDS, mergeReferralTemplates } from "@/lib/referral-templates";

const templateSchema = z.object({
  enabled: z.boolean(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  ctaLabel: z.string().trim().min(1).max(80),
});

export const getReferralTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "referral_templates")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mergeReferralTemplates(data?.value);
  });

export const saveReferralTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        templates: z.record(z.enum(REFERRAL_TEMPLATE_KINDS), templateSchema),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const merged = mergeReferralTemplates(data.templates);
    const { error } = await context.supabase.from("platform_settings").upsert(
      { key: "referral_templates", value: merged } as never,
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return merged;
  });
