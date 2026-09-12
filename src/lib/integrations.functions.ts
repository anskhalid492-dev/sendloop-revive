/**
 * Customer-facing integration endpoints. Every handler re-checks workspace
 * membership (and role for writes) server-side; route guards are UX only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationConnectionView = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  isEnabled: boolean;
  requiresPaidPlan: boolean;
  planAllowed: boolean;
  connected: boolean;
  status: string;
  accountLabel: string | null;
  secretHint: string | null;
  events: string[];
  errorMessage: string | null;
  lastEventAt: string | null;
  lastSyncedAt: string | null;
  inboundUrl: string | null;
  successCount: number;
  failureCount: number;
};

export type IntegrationEventView = {
  id: string;
  slug: string;
  direction: string;
  eventType: string;
  status: string;
  message: string | null;
  createdAt: string;
};

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export const listIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<IntegrationConnectionView[]> => {
    const { requireWorkspaceRole, workspaceHasPaidPlan, maskSecret, loadCredentials } = await import(
      "@/lib/integrations.server"
    );
    const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await requireWorkspaceRole(data.workspaceId, context.userId, false);
    const paid = await workspaceHasPaidPlan(data.workspaceId);

    const [{ data: catalog }, { data: connections }, { data: events }] = await Promise.all([
      supabaseAdmin.from("integrations").select("*").order("sort_order"),
      supabaseAdmin.from("integration_connections").select("*").eq("workspace_id", data.workspaceId),
      supabaseAdmin
        .from("integration_events")
        .select("slug, status, direction")
        .eq("workspace_id", data.workspaceId),
    ]);

    const byslug = new Map(
      ((connections ?? []) as Array<Record<string, unknown>>).map((c) => [String(c["slug"]), c]),
    );

    const out: IntegrationConnectionView[] = [];
    for (const row of (catalog ?? []) as Array<Record<string, unknown>>) {
      const slug = String(row["slug"]);
      const meta = INTEGRATIONS_BY_SLUG[slug];
      if (!meta) continue;
      const conn = byslug.get(slug);
      const config = (conn?.["config"] ?? {}) as Record<string, unknown>;
      let secretHint: string | null = null;
      if (conn) {
        const creds = await loadCredentials(String(conn["id"]));
        const secretField = meta.fields.find((f) => f.secret);
        const value = secretField ? creds?.[secretField.key] : undefined;
        secretHint = value ? maskSecret(value) : null;
      }
      // Only real message/event deliveries belong in the delivered/failed counter.
      // Sign-in bookkeeping rows (direction "oauth") are not deliveries and must
      // never be shown to the customer as failures.
      const slugEvents = (
        (events ?? []) as Array<{ slug: string; status: string; direction: string | null }>
      ).filter((e) => e.slug === slug && (e.direction === "inbound" || e.direction === "outbound"));
      const inboundToken = config["inbound_token"];
      out.push({
        slug,
        name: String(row["name"]),
        category: String(row["category"]),
        tagline: String(row["tagline"] ?? ""),
        isEnabled: Boolean(row["is_enabled"]),
        requiresPaidPlan: Boolean(row["requires_paid_plan"]),
        planAllowed: !row["requires_paid_plan"] || paid,
        connected: Boolean(conn),
        status: conn ? String(conn["status"]) : "not_connected",
        accountLabel: conn ? ((conn["account_label"] as string | null) ?? null) : null,
        secretHint,
        events: (config["events"] as string[] | undefined) ?? meta.events,
        errorMessage: conn ? ((conn["error_message"] as string | null) ?? null) : null,
        lastEventAt: conn ? ((conn["last_event_at"] as string | null) ?? null) : null,
        lastSyncedAt: conn ? ((conn["last_synced_at"] as string | null) ?? null) : null,
        inboundUrl:
          meta.inbound && typeof inboundToken === "string"
            ? `/api/public/integrations/${slug}?token=${inboundToken}`
            : null,
        successCount: slugEvents.filter((e) => e.status === "success").length,
        failureCount: slugEvents.filter((e) => e.status === "failed").length,
      });
    }
    return out;
  });

const connectInput = z.object({
  workspaceId: z.string().uuid(),
  slug: z.string().min(2).max(50),
  values: z.record(z.string(), z.string().max(4000)),
});

export const connectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof connectInput>) => connectInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const {
      requireWorkspaceRole,
      workspaceHasPaidPlan,
      verifyIntegration,
      storeCredentials,
    } = await import("@/lib/integrations.server");
    const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    // Central plan gate — the catalog flag below is an extra per-integration rule.
    const { requireEntitlement } = await import("@/lib/billing/usage.server");
    await requireEntitlement(data.workspaceId, "integrations");

    const meta = INTEGRATIONS_BY_SLUG[data.slug];
    if (!meta) throw new Error("Unknown integration.");
    if (meta.authType === "oauth") {
      // OAuth integrations are only ever connected through their own consent
      // flow — never by posting credentials from the browser.
      return { ok: false, message: `Connect ${meta.name} using the Connect ${meta.name} button.` };
    }

    const { data: catalogRow } = await supabaseAdmin
      .from("integrations")
      .select("is_enabled, requires_paid_plan")
      .eq("slug", data.slug)
      .maybeSingle();
    const row = catalogRow as { is_enabled: boolean; requires_paid_plan: boolean } | null;
    if (!row || !row.is_enabled) {
      return { ok: false, message: "This integration is currently unavailable." };
    }
    if (row.requires_paid_plan && !(await workspaceHasPaidPlan(data.workspaceId))) {
      return { ok: false, message: "This integration is available on paid plans. Upgrade to connect it." };
    }

    const credentials: Record<string, string> = {};
    const config: Record<string, unknown> = {};
    for (const field of meta.fields) {
      const value = (data.values[field.key] ?? "").trim();
      if (field.required && !value) return { ok: false, message: `${field.label} is required.` };
      if (!value) continue;
      if (field.secret) credentials[field.key] = value;
      else config[field.key] = value;
    }

    const verified = await verifyIntegration(data.slug, credentials);
    if (!verified.ok) return { ok: false, message: verified.message };

    config["events"] = meta.events;
    if (meta.inbound) config["inbound_token"] = crypto.randomUUID().replace(/-/g, "");

    const { data: upserted, error } = await supabaseAdmin
      .from("integration_connections")
      .upsert(
        {
          workspace_id: data.workspaceId,
          slug: data.slug,
          status: "connected",
          account_label: verified.accountLabel ?? null,
          config: config as never,
          error_message: null,
          last_synced_at: new Date().toISOString(),
          created_by: context.userId,
        },
        { onConflict: "workspace_id,slug" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await storeCredentials(String((upserted as { id: string }).id), credentials);
    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      connection_id: String((upserted as { id: string }).id),
      slug: data.slug,
      action: "connect",
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return { ok: true, message: verified.message };
  });

const eventsInput = z.object({
  workspaceId: z.string().uuid(),
  slug: z.string().min(2).max(50),
  events: z.array(z.string().max(60)).max(20),
});

export const updateIntegrationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof eventsInput>) => eventsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { INTEGRATIONS_BY_SLUG } = await import("@/lib/integrations-catalog");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const meta = INTEGRATIONS_BY_SLUG[data.slug];
    if (!meta) throw new Error("Unknown integration.");
    const allowed = data.events.filter((e) => meta.events.includes(e));

    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("id, config")
      .eq("workspace_id", data.workspaceId)
      .eq("slug", data.slug)
      .maybeSingle();
    if (!conn) throw new Error("This integration is not connected.");
    const current = ((conn as { config: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;

    const { error } = await supabaseAdmin
      .from("integration_connections")
      .update({ config: { ...current, events: allowed } as never })
      .eq("id", (conn as { id: string }).id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const slugInput = z.object({
  workspaceId: z.string().uuid(),
  slug: z.string().min(2).max(50),
});

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof slugInput>) => slugInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole, deliverEvent } = await import("@/lib/integrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("slug", data.slug)
      .maybeSingle();
    if (!conn) return { ok: false, message: "This integration is not connected." };

    const result = await deliverEvent(
      conn as never,
      "integration.test",
      {
        message: "Test event from MunchReach.",
        lead: { email: "test@munchreach.app", first_name: "Test", last_name: "Lead", company: "MunchReach" },
        timestamp: new Date().toISOString(),
      },
      `test:${crypto.randomUUID()}`,
    );

    await supabaseAdmin.from("integration_sync_logs").insert({
      workspace_id: data.workspaceId,
      connection_id: (conn as { id: string }).id,
      slug: data.slug,
      action: "test",
      status: result.ok ? "success" : "failed",
      error: result.ok ? null : result.message,
      finished_at: new Date().toISOString(),
    });

    return result;
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof slugInput>) => slugInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const { error } = await supabaseAdmin
      .from("integration_connections")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listIntegrationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<IntegrationEventView[]> => {
    const { requireWorkspaceRole } = await import("@/lib/integrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, false);

    const { data: rows } = await supabaseAdmin
      .from("integration_events")
      .select("id, slug, direction, event_type, status, message, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r["id"]),
      slug: String(r["slug"]),
      direction: String(r["direction"]),
      eventType: String(r["event_type"]),
      status: String(r["status"]),
      message: (r["message"] as string | null) ?? null,
      createdAt: String(r["created_at"]),
    }));
  });

const retryInput = z.object({
  workspaceId: z.string().uuid(),
  eventId: z.string().uuid(),
});

export const retryIntegrationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof retryInput>) => retryInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { requireWorkspaceRole, deliverEvent } = await import("@/lib/integrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireWorkspaceRole(data.workspaceId, context.userId, true);

    const { data: event } = await supabaseAdmin
      .from("integration_events")
      .select("connection_id, event_type, payload")
      .eq("id", data.eventId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!event) return { ok: false, message: "Event not found." };
    const row = event as { connection_id: string | null; event_type: string; payload: unknown };
    if (!row.connection_id) return { ok: false, message: "This event has no destination to retry." };

    const { data: conn } = await supabaseAdmin
      .from("integration_connections")
      .select("*")
      .eq("id", row.connection_id)
      .maybeSingle();
    if (!conn) return { ok: false, message: "The destination is no longer connected." };

    return deliverEvent(
      conn as never,
      row.event_type,
      (row.payload ?? {}) as Record<string, unknown>,
      `retry:${crypto.randomUUID()}`,
    );
  });
