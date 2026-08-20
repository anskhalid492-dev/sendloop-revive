/**
 * Server functions for the deep system settings surfaces: announcements,
 * feature flags, configuration history and the public (non-secret) platform
 * configuration used by branding, consent and validation limits.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Value = string | number | boolean | null;

const announcementInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2000),
  level: z.enum(["info", "warning", "critical"]),
  audience: z.enum(["customer", "admin", "all"]),
  startsAt: z.string().nullable().default(null),
  endsAt: z.string().nullable().default(null),
  dismissible: z.boolean(),
  ctaLabel: z.string().max(60).default(""),
  ctaUrl: z.string().max(500).default(""),
  enabled: z.boolean(),
});

const flagInput = z.object({
  key: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).default(""),
  enabled: z.boolean(),
  environment: z.enum(["all", "production", "preview"]),
  rolloutPercentage: z.number().min(0).max(100),
  audience: z.enum(["customer", "admin"]),
});

/* -------------------------------- admin -------------------------------- */

export const getPlatformConfigAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { listAnnouncements, listFeatureFlags, listConfigHistory } = await import(
      "@/lib/platform-config.server"
    );
    const [announcements, flags, history] = await Promise.all([
      listAnnouncements(context),
      listFeatureFlags(context),
      listConfigHistory(context),
    ]);
    return { announcements, flags, history };
  });

export const saveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => announcementInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { upsertAnnouncement } = await import("@/lib/platform-config.server");
    return upsertAnnouncement(context, data);
  });

export const removeAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { deleteAnnouncement } = await import("@/lib/platform-config.server");
    return deleteAnnouncement(context, data.id);
  });

export const saveFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => flagInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { upsertFeatureFlag } = await import("@/lib/platform-config.server");
    return upsertFeatureFlag(context, data);
  });

export const removeFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { deleteFeatureFlag } = await import("@/lib/platform-config.server");
    return deleteFeatureFlag(context, data.key);
  });

/* ------------------------------- customer ------------------------------- */

/** Live announcements plus customer-facing flags for the signed-in viewer. */
export const getViewerPlatformState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listLiveAnnouncements, listFeatureFlags } = await import(
      "@/lib/platform-config.server"
    );
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const [announcements, flags] = await Promise.all([
      listLiveAnnouncements(context, Boolean(isAdmin)),
      listFeatureFlags(context).catch(() => []),
    ]);
    return {
      announcements,
      flags: flags.map((f) => ({ key: f.key, enabled: f.enabled, rollout: f.rollout_percentage })),
    };
  });

export const dismissPlatformAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { dismissAnnouncement } = await import("@/lib/platform-config.server");
    return dismissAnnouncement(context, data.id);
  });

/* -------------------------------- public -------------------------------- */

/** Public, non-secret platform configuration merged over the schema defaults. */
export const getPublicPlatformConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { SETTING_GROUPS, groupDefaults } = await import("@/lib/platform-settings");
  const defaults: Record<string, Record<string, Value>> = {};
  for (const id of ["branding", "consent", "legal", "localization", "api", "limits", "general"]) {
    const group = SETTING_GROUPS.find((g) => g.id === id);
    defaults[id] = (group ? groupDefaults(group) : {}) as Record<string, Value>;
  }

  let stored: Record<string, Record<string, Value>> = {};
  try {
    const { readPublicConfig } = await import("@/lib/platform-config.server");
    stored = (await readPublicConfig()) as unknown as Record<string, Record<string, Value>>;
  } catch {
    stored = {};
  }

  const merged: Record<string, Record<string, Value>> = {};
  for (const key of Object.keys(defaults)) {
    merged[key] = { ...defaults[key], ...(stored[key] ?? {}) };
  }
  // The general block is trimmed to the values a signed-out page may see;
  // operational switches stay server-side.
  const general = (merged["general"] ?? {}) as Record<string, Value>;
  merged["general"] = {
    site_name: general["site_name"],
    default_language: general["default_language"],
    default_date_format: general["default_date_format"],
    default_time_format: general["default_time_format"],
    default_pagination: general["default_pagination"],
    default_currency: general["default_currency"],
    default_timezone: general["default_timezone"],
    onboarding_enabled: general["onboarding_enabled"],
    suspension_message: general["suspension_message"],
  };
  return merged as {
    branding: Record<string, Value>;
    consent: Record<string, Value>;
    legal: Record<string, Value>;
    localization: Record<string, Value>;
    api: Record<string, Value>;
    limits: Record<string, Value>;
    general: Record<string, Value>;
  };
});
