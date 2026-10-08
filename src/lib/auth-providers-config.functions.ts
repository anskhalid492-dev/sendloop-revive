/**
 * Admin-only server functions for Google Cloud Identity Platform
 * configuration (preparation only — not used by any sign-in flow).
 * Every handler re-checks the platform admin role server-side. Responses
 * contain status and masked values only; audit entries never include secrets.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function guard(context: { supabase: unknown; userId: string; claims?: Record<string, unknown> }, sensitive = false, action?: string) {
  const { assertPlatformAdmin } = await import("@/lib/billing/access.server");
  await assertPlatformAdmin(context as never, sensitive ? { sensitive: true, action } : {});
}

async function audit(userId: string, action: string) {
  try {
    const { writeAudit } = await import("@/lib/billing/core.server");
    await writeAudit({ userId, action, detail: { provider: "google_identity_platform" } });
  } catch {
    /* audit is best effort */
  }
}

export const adminGetGoogleIdpConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const { getGoogleIdpView } = await import("@/lib/auth-providers-config.server");
    const view = await getGoogleIdpView();
    await audit(context.userId, "auth.google.settings_viewed");
    return view;
  });

const saveInput = z.object({
  projectId: z.string().max(64),
  clientId: z.string().max(256),
  clientSecret: z.string().max(512).optional().nullable(),
  authorizedDomain: z.string().max(260),
});

export const adminSaveGoogleIdpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof saveInput>) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    await guard(context, true, "change authentication provider settings");
    const { saveGoogleIdpConfig } = await import("@/lib/auth-providers-config.server");
    const view = await saveGoogleIdpConfig(data);
    await audit(context.userId, "auth.google.config_saved");
    return view;
  });

export const adminTestGoogleIdpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context);
    const { testGoogleIdpConnection } = await import("@/lib/auth-providers-config.server");
    const view = await testGoogleIdpConnection();
    await audit(context.userId, "auth.google.config_tested");
    return view;
  });

export const adminSetGoogleIdpEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean }) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await guard(context, true, "change authentication provider settings");
    const { setGoogleIdpEnabled } = await import("@/lib/auth-providers-config.server");
    const view = await setGoogleIdpEnabled(data.enabled);
    await audit(context.userId, data.enabled ? "auth.google.config_enabled" : "auth.google.config_disabled");
    return view;
  });

export const adminRemoveGoogleIdpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: "REMOVE" }) => z.object({ confirm: z.literal("REMOVE") }).parse(d))
  .handler(async ({ context }) => {
    await guard(context, true, "remove authentication provider settings");
    const { removeGoogleIdpConfig } = await import("@/lib/auth-providers-config.server");
    const view = await removeGoogleIdpConfig();
    await audit(context.userId, "auth.google.config_removed");
    return view;
  });
