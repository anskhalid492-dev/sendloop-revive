/**
 * Platform-admin control plane for integrations: enable/disable each
 * integration globally, gate it behind paid plans, and inspect adoption and
 * failures across every workspace. Admin role is re-checked server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export type AdminIntegration = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  isEnabled: boolean;
  requiresPaidPlan: boolean;
  connections: number;
  errored: number;
  events24h: number;
  failures24h: number;
  /** OAuth integrations only: are the server-side app credentials present? */
  oauthConfigured: boolean | null;
};

export type AdminIntegrationEvent = {
  id: string;
  slug: string;
  workspaceName: string;
  eventType: string;
  direction: string;
  status: string;
  message: string | null;
  createdAt: string;
};

export const adminListIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminIntegration[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
    // Presence only — no credential value is ever read into the response.
    const oauthReady: Record<string, boolean> = {
      calendly: Boolean(process.env["CALENDLY_CLIENT_ID"] && process.env["CALENDLY_CLIENT_SECRET"]),
      slack: Boolean(process.env["SLACK_CLIENT_ID"] && process.env["SLACK_CLIENT_SECRET"]),
    };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: catalog }, { data: connections }, { data: events }] = await Promise.all([
      supabaseAdmin.from("integrations").select("*").order("sort_order"),
      supabaseAdmin.from("integration_connections").select("slug, status"),
      supabaseAdmin.from("integration_events").select("slug, status").gte("created_at", since),
    ]);

    const conns = (connections ?? []) as Array<{ slug: string; status: string }>;
    const evts = (events ?? []) as Array<{ slug: string; status: string }>;

    return ((catalog ?? []) as Array<Record<string, unknown>>).map((row) => {
      const slug = String(row["slug"]);
      return {
        slug,
        name: String(row["name"]),
        category: String(row["category"]),
        tagline: String(row["tagline"] ?? ""),
        isEnabled: Boolean(row["is_enabled"]),
        requiresPaidPlan: Boolean(row["requires_paid_plan"]),
        connections: conns.filter((c) => c.slug === slug).length,
        errored: conns.filter((c) => c.slug === slug && c.status === "error").length,
        events24h: evts.filter((e) => e.slug === slug).length,
        failures24h: evts.filter((e) => e.slug === slug && e.status === "failed").length,
        oauthConfigured:
          INTEGRATIONS_BY_SLUG[slug]?.authType === "oauth" ? (oauthReady[slug] ?? false) : null,
      };
    });
  });

const toggleInput = z.object({
  slug: z.string().min(2).max(50),
  isEnabled: z.boolean().optional(),
  requiresPaidPlan: z.boolean().optional(),
});

export const adminUpdateIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof toggleInput>) => toggleInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, boolean> = {};
    if (typeof data.isEnabled === "boolean") patch["is_enabled"] = data.isEnabled;
    if (typeof data.requiresPaidPlan === "boolean") patch["requires_paid_plan"] = data.requiresPaidPlan;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin.from("integrations").update(patch as never).eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListIntegrationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminIntegrationEvent[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("integration_events")
      .select("id, slug, event_type, direction, status, message, created_at, workspaces:workspace_id(name)")
      .order("created_at", { ascending: false })
      .limit(100);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r["id"]),
      slug: String(r["slug"]),
      workspaceName: String((r["workspaces"] as { name?: string } | null)?.name ?? "—"),
      eventType: String(r["event_type"]),
      direction: String(r["direction"]),
      status: String(r["status"]),
      message: (r["message"] as string | null) ?? null,
      createdAt: String(r["created_at"]),
    }));
  });
