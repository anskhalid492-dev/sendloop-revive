/**
 * Phase 9 server functions for system settings.
 *
 * Authorization is re-checked server-side on every call with the existing
 * platform admin guard; the public flag reader is deliberately unauthenticated
 * but returns only booleans and the maintenance message.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { loadAllSettings } = await import("@/lib/platform-settings.server");
    return { groups: await loadAllSettings(context) };
  });

const saveInput = z.object({
  group: z.string().min(1).max(40),
  values: z.record(z.string(), z.unknown()),
});

export const saveSystemSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin-access.server");
    await assertSuperAdmin(context);
    const { saveSettingsGroup } = await import("@/lib/platform-settings.server");
    return saveSettingsGroup(context, data.group, data.values as Record<string, unknown>);
  });

/** Public: maintenance / registration / Google switches for pre-auth screens. */
export const getPlatformFlags = createServerFn({ method: "GET" }).handler(async () => {
  const { readPublicFlags } = await import("@/lib/platform-settings.server");
  try {
    return await readPublicFlags();
  } catch {
    // A settings read failure must never lock everyone out of the product.
    return {
      maintenanceMode: false,
      maintenanceMessage: "",
      registrationEnabled: true,
      googleEnabled: true,
    };
  }
});

/** Public: password rules so sign-up and reset validate against real policy. */
export const getPasswordPolicy = createServerFn({ method: "GET" }).handler(async () => {
  const { readSettings } = await import("@/lib/platform-settings.server");
  try {
    const auth = await readSettings("auth");
    return {
      password_min_length: Number(auth["password_min_length"] ?? 8),
      password_require_number: Boolean(auth["password_require_number"]),
      password_require_symbol: Boolean(auth["password_require_symbol"]),
      email_password_enabled: auth["email_password_enabled"] !== false,
    };
  } catch {
    return {
      password_min_length: 8,
      password_require_number: true,
      password_require_symbol: false,
      email_password_enabled: true,
    };
  }
});
