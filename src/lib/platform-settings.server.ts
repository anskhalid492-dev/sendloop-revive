/**
 * Phase 9 — persistence for the centralized system settings.
 *
 * Reads and writes go through the caller's RLS-bound client (admin-only
 * policies on `platform_settings` / `site_settings`), never the service-role
 * client, so a request can never write settings it is not allowed to.
 * Every change is recorded in the existing `admin_audit_log` with a
 * before/after diff — values only, never secrets.
 */
import {
  SETTING_GROUPS,
  groupById,
  groupDefaults,
  validateGroup,
  type SettingGroup,
} from "@/lib/platform-settings";

type Ctx = { supabase: any; userId: string };

export type SettingValue = string | number | boolean;

export type GroupState = {
  id: string;
  values: Record<string, SettingValue>;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByEmail: string | null;
};

async function readRow(ctx: Ctx, group: SettingGroup) {
  const { data, error } = await ctx.supabase
    .from(group.store.table)
    .select("value, updated_at, updated_by")
    .eq("key", group.store.key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as { value: any; updated_at: string | null; updated_by: string | null } | null;
}

/** Google sign-in keeps living in the pre-existing `auth_providers` row. */
async function readGoogleSwitch(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "auth_providers")
    .maybeSingle();
  return ((data?.value ?? {}) as { google?: boolean }).google ?? true;
}

export async function loadAllSettings(ctx: Ctx): Promise<GroupState[]> {
  const rows = await Promise.all(SETTING_GROUPS.map((g) => readRow(ctx, g)));
  const actorIds = [...new Set(rows.map((r) => r?.updated_by).filter(Boolean) as string[])];
  const emails = new Map<string, string>();
  if (actorIds.length) {
    const { data } = await ctx.supabase.from("profiles").select("id, email").in("id", actorIds);
    for (const p of (data ?? []) as { id: string; email: string | null }[]) {
      if (p.email) emails.set(p.id, p.email);
    }
  }

  const google = await readGoogleSwitch(ctx);

  return SETTING_GROUPS.map((group, i) => {
    const row = rows[i];
    const stored = (row?.value ?? {}) as Record<string, SettingValue>;
    const values = { ...groupDefaults(group), ...stored } as Record<string, SettingValue>;
    if (group.id === "auth") values["google_enabled"] = google;
    return {
      id: group.id,
      values,
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
      updatedByEmail: row?.updated_by ? (emails.get(row.updated_by) ?? null) : null,
    };
  });
}

/** Diff limited to changed keys, for the audit record. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(v)) changed[k] = { from: before[k] ?? null, to: v };
  }
  return changed;
}

export async function saveSettingsGroup(
  ctx: Ctx,
  groupId: string,
  input: Record<string, unknown>,
  reason?: string,
): Promise<GroupState> {
  const group = groupById(groupId);
  if (!group) throw new Error("Unknown settings group");

  const clean = validateGroup(group, input);
  const existing = await readRow(ctx, group);
  const before = { ...groupDefaults(group), ...((existing?.value ?? {}) as Record<string, unknown>) };

  // The Google switch is shared with the sign-in page's public RPC, so it is
  // written to its own long-standing row instead of being duplicated here.
  if (group.id === "auth") {
    const google = Boolean(clean["google_enabled"]);
    const { error: gErr } = await ctx.supabase
      .from("platform_settings")
      .upsert(
        { key: "auth_providers", value: { google }, updated_at: new Date().toISOString(), updated_by: ctx.userId },
        { onConflict: "key" },
      );
    if (gErr) throw new Error(gErr.message);
    delete clean["google_enabled"];
  }

  const payload: Record<string, unknown> = {
    key: group.store.key,
    value: clean,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };
  const { error } = await ctx.supabase.from(group.store.table).upsert(payload, { onConflict: "key" });
  if (error) throw new Error(error.message);

  const changed = diff(before, clean);
  if (Object.keys(changed).length > 0) {
    // Settings hold no credentials (secrets live in the secret store), so the
    // diff is safe to persist; it is capped to keep audit rows small.
    await ctx.supabase.from("admin_audit_log").insert({
      actor_id: ctx.userId,
      action: "settings.update",
      target_type: "platform_settings",
      target_id: null,
      target_label: `${group.label} settings`,
      detail: {
        group: group.id,
        changed: Object.fromEntries(Object.entries(changed).slice(0, 30)),
        reason: (reason ?? "").slice(0, 500),
        result: "success",
      },
    });
  }

  const state = await loadAllSettings(ctx);
  return state.find((g) => g.id === groupId)!;
}

/** Public switches — no session required, booleans and a message only. */
export async function readPublicFlags() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("public_platform_flags");
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    maintenanceMode: Boolean(row.maintenance_mode),
    maintenanceMessage: String(row.maintenance_message ?? ""),
    registrationEnabled: row.registration_enabled !== false,
    googleEnabled: row.google_enabled !== false,
  };
}

/**
 * Server-side read of a settings group for enforcement paths (workers,
 * uploads, auth rules). Uses the service-role client because these run
 * without a user session; it only ever reads.
 */
export async function readSettings(groupId: string): Promise<Record<string, unknown>> {
  const group = groupById(groupId);
  if (!group) throw new Error("Unknown settings group");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from(group.store.table as never)
    .select("value")
    .eq("key", group.store.key)
    .maybeSingle();
  const stored = ((data as { value?: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
  return { ...groupDefaults(group), ...stored };
}

/**
 * Numeric platform limit from Admin → System settings → Platform limits.
 * Falls back to the supplied default when settings cannot be read, so
 * enforcement never blocks a request because of a config outage.
 */
export async function platformLimit(key: string, fallback: number): Promise<number> {
  try {
    const limits = await readSettings("limits");
    const raw = limits[key];
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}
