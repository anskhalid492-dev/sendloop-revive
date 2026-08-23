/**
 * Deep system settings — records-based configuration.
 *
 * Announcements and feature flags are rows, not key/value settings, so they
 * live here rather than in the generated settings form. Every admin path runs
 * through the caller's RLS-bound client (admin-only policies), and every
 * mutation is written to the existing `admin_audit_log`.
 *
 * No credential ever passes through this module: the public reader returns
 * branding, consent, localization, legal contact and API status only.
 */

type Ctx = { supabase: any; userId: string };

export type Announcement = {
  id: string;
  title: string;
  message: string;
  level: "info" | "warning" | "critical";
  audience: "customer" | "admin" | "all";
  starts_at: string | null;
  ends_at: string | null;
  dismissible: boolean;
  cta_label: string | null;
  cta_url: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type FeatureFlag = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  environment: "all" | "production" | "preview";
  rollout_percentage: number;
  audience: "customer" | "admin";
  created_at: string;
  updated_at: string;
};

async function audit(
  ctx: Ctx,
  action: string,
  label: string,
  detail: Record<string, unknown>,
) {
  await ctx.supabase.from("admin_audit_log").insert({
    actor_id: ctx.userId,
    action,
    target_type: "platform_config",
    target_id: null,
    target_label: label,
    detail: { ...detail, result: "success" },
  });
}

/* ----------------------------- announcements ---------------------------- */

export async function listAnnouncements(ctx: Ctx): Promise<Announcement[]> {
  const { data, error } = await ctx.supabase
    .from("platform_announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as Announcement[];
}

export type AnnouncementInput = {
  id?: string | undefined;
  title: string;
  message: string;
  level: string;
  audience: string;
  startsAt: string | null;
  endsAt: string | null;
  dismissible: boolean;
  ctaLabel: string;
  ctaUrl: string;
  enabled: boolean;
};

function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date on the announcement schedule");
  return d.toISOString();
}

export async function upsertAnnouncement(ctx: Ctx, input: AnnouncementInput) {
  const row = {
    title: input.title.trim().slice(0, 160),
    message: input.message.trim().slice(0, 2000),
    level: input.level,
    audience: input.audience,
    starts_at: isoOrNull(input.startsAt),
    ends_at: isoOrNull(input.endsAt),
    dismissible: input.dismissible,
    cta_label: input.ctaLabel.trim().slice(0, 60) || null,
    cta_url: input.ctaUrl.trim().slice(0, 500) || null,
    enabled: input.enabled,
  };
  if (!row.title) throw new Error("Announcement title is required");
  if (!row.message) throw new Error("Announcement message is required");
  if (row.cta_url && !/^(https?:\/\/|\/)/.test(row.cta_url)) {
    throw new Error("Call-to-action URL must be a link or a site path");
  }
  if (row.starts_at && row.ends_at && row.starts_at > row.ends_at) {
    throw new Error("The announcement ends before it starts");
  }

  if (input.id) {
    const { error } = await ctx.supabase
      .from("platform_announcements")
      .update(row)
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    await audit(ctx, "announcement.update", row.title, { id: input.id, ...row });
    return { id: input.id };
  }

  const { data, error } = await ctx.supabase
    .from("platform_announcements")
    .insert({ ...row, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(ctx, "announcement.create", row.title, { id: data.id, ...row });
  return { id: data.id as string };
}

export async function deleteAnnouncement(ctx: Ctx, id: string) {
  const { error } = await ctx.supabase.from("platform_announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(ctx, "announcement.delete", id, { id });
  return { ok: true };
}

/** Live announcements for the signed-in viewer, minus the ones they dismissed. */
export async function listLiveAnnouncements(ctx: Ctx, isAdmin: boolean) {
  const [rows, dismissals] = await Promise.all([
    ctx.supabase
      .from("platform_announcements")
      .select("id, title, message, level, audience, dismissible, cta_label, cta_url, ends_at")
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .limit(20),
    ctx.supabase
      .from("platform_announcement_dismissals")
      .select("announcement_id")
      .eq("user_id", ctx.userId),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  const dismissed = new Set(
    ((dismissals.data ?? []) as { announcement_id: string }[]).map((d) => d.announcement_id),
  );
  return ((rows.data ?? []) as any[])
    .filter((r) => !dismissed.has(r.id))
    .filter((r) => r.audience === "all" || (isAdmin ? r.audience === "admin" : r.audience === "customer"));
}

export async function dismissAnnouncement(ctx: Ctx, id: string) {
  const { error } = await ctx.supabase
    .from("platform_announcement_dismissals")
    .upsert({ announcement_id: id, user_id: ctx.userId }, { onConflict: "announcement_id,user_id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ------------------------------ feature flags --------------------------- */

export async function listFeatureFlags(ctx: Ctx): Promise<FeatureFlag[]> {
  const { data, error } = await ctx.supabase
    .from("platform_feature_flags")
    .select("*")
    .order("key")
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as FeatureFlag[];
}

export type FeatureFlagInput = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  environment: string;
  rolloutPercentage: number;
  audience: string;
};

export async function upsertFeatureFlag(ctx: Ctx, input: FeatureFlagInput) {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "-").slice(0, 60);
  if (!key) throw new Error("Flag key is required");
  const rollout = Math.max(0, Math.min(100, Math.round(input.rolloutPercentage)));
  const row = {
    key,
    name: input.name.trim().slice(0, 120) || key,
    description: input.description.trim().slice(0, 1000),
    enabled: input.enabled,
    environment: input.environment,
    rollout_percentage: rollout,
    audience: input.audience,
    updated_by: ctx.userId,
  };
  const { error } = await ctx.supabase
    .from("platform_feature_flags")
    .upsert(row, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await audit(ctx, "feature_flag.upsert", key, row);
  return { key };
}

export async function deleteFeatureFlag(ctx: Ctx, key: string) {
  const { error } = await ctx.supabase.from("platform_feature_flags").delete().eq("key", key);
  if (error) throw new Error(error.message);
  await audit(ctx, "feature_flag.delete", key, { key });
  return { ok: true };
}

/**
 * Stable per-subject rollout: the same workspace always lands on the same side
 * of the percentage, so a partial rollout does not flicker between requests.
 */
export function flagAppliesTo(flag: FeatureFlag, subjectId: string, environment: string): boolean {
  if (!flag.enabled) return false;
  if (flag.environment !== "all" && flag.environment !== environment) return false;
  if (flag.rollout_percentage >= 100) return true;
  if (flag.rollout_percentage <= 0) return false;
  let hash = 0;
  const seed = `${flag.key}:${subjectId}`;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return hash % 100 < flag.rollout_percentage;
}

/* --------------------------- configuration history ---------------------- */

export type ConfigChange = {
  id: string;
  when: string;
  actorEmail: string | null;
  group: string;
  setting: string;
  from: string;
  to: string;
  reason: string;
};

/** Human-readable rendering of a stored setting value for the history table. */
function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export async function listConfigHistory(ctx: Ctx, limit = 200): Promise<ConfigChange[]> {
  const { data, error } = await ctx.supabase
    .from("admin_audit_log")
    .select("id, created_at, actor_id, action, target_label, detail")
    .in("action", ["settings.update", "announcement.create", "announcement.update", "announcement.delete", "feature_flag.upsert", "feature_flag.delete"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as any[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const emails = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await ctx.supabase.from("profiles").select("id, email").in("id", actorIds);
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      if (p.email) emails.set(p.id, p.email);
    }
  }

  const out: ConfigChange[] = [];
  for (const row of rows) {
    const actorEmail = row.actor_id ? (emails.get(row.actor_id) ?? null) : null;
    const detail = (row.detail ?? {}) as Record<string, any>;
    const reason = String(detail["reason"] ?? "");
    if (row.action === "settings.update") {
      const changed = (detail["changed"] ?? {}) as Record<string, { from: unknown; to: unknown }>;
      for (const [setting, change] of Object.entries(changed)) {
        out.push({
          id: `${row.id}:${setting}`,
          when: row.created_at,
          actorEmail,
          group: String(detail["group"] ?? "settings"),
          setting,
          from: display(change?.from),
          to: display(change?.to),
          reason,
        });
      }
    } else {
      out.push({
        id: String(row.id),
        when: row.created_at,
        actorEmail,
        group: row.action.startsWith("announcement") ? "announcements" : "flags",
        setting: row.target_label ?? row.action,
        from: "",
        to: row.action.endsWith("delete") ? "deleted" : "saved",
        reason,
      });
    }
  }
  return out;
}

/* ------------------------------ public config --------------------------- */

export type ConfigValues = Record<string, string | number | boolean | null>;

export type PublicPlatformConfig = {
  branding: ConfigValues;
  consent: ConfigValues;
  legal: ConfigValues;
  localization: ConfigValues;
  api: ConfigValues;
  limits: ConfigValues;
  general: ConfigValues;
};

const EMPTY_CONFIG: PublicPlatformConfig = {
  branding: {},
  consent: {},
  legal: {},
  localization: {},
  api: {},
  limits: {},
  general: {},
};

/** Non-secret configuration for pre-auth surfaces (branding, consent, limits). */
export async function readPublicConfig(): Promise<PublicPlatformConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("public_platform_config" as never);
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Partial<PublicPlatformConfig>;
  return { ...EMPTY_CONFIG, ...raw };
}
