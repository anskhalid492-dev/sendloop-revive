/**
 * Public + admin server functions for the trust/legal pages, the user guide,
 * service alerts, privacy requests and guest support tickets.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  GuideArticle,
  PrivacyRequest,
  ServiceAlert,
  Subprocessor,
} from "@/lib/trust-center.server";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

/* ------------------------------------------------------------------ public */

export const listPublicSubprocessors = createServerFn({ method: "GET" }).handler(
  async (): Promise<Subprocessor[]> => {
    const { publicContentClient, SUBPROCESSOR_COLUMNS } = await import("@/lib/trust-center.server");
    const client = await publicContentClient();
    const { data, error } = await client
      .from("subprocessors")
      .select(SUBPROCESSOR_COLUMNS)
      .eq("published", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Subprocessor[];
  },
);

export const listPublicGuide = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ articles: GuideArticle[]; alerts: ServiceAlert[] }> => {
    const { publicContentClient, GUIDE_COLUMNS, ALERT_COLUMNS } = await import(
      "@/lib/trust-center.server"
    );
    const client = await publicContentClient();
    const nowIso = new Date().toISOString();
    const [articlesRes, alertsRes] = await Promise.all([
      client
        .from("guide_articles")
        .select(GUIDE_COLUMNS)
        .eq("published", true)
        .order("sort_order", { ascending: true }),
      client
        .from("service_alerts")
        .select(ALERT_COLUMNS)
        .eq("published", true)
        .is("resolved_at", null)
        .lte("starts_at", nowIso)
        .order("starts_at", { ascending: false }),
    ]);
    if (articlesRes.error) throw new Error(articlesRes.error.message);
    if (alertsRes.error) throw new Error(alertsRes.error.message);
    const alerts = ((alertsRes.data ?? []) as unknown as ServiceAlert[]).filter(
      (a) => !a.ends_at || a.ends_at > nowIso,
    );
    const { data: helpRows } = await (client as any).from("guide_articles").select("id").eq("help_center", true);
    const helpIds = new Set((helpRows ?? []).map((r: { id: string }) => r.id));
    return { articles: ((articlesRes.data ?? []) as unknown as GuideArticle[]).filter((a) => !helpIds.has(a.id)), alerts };
  },
);

export const submitPrivacyRequest = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        company: z.string().trim().max(160).optional().default(""),
        requestType: z.string().trim().min(2).max(60),
        details: z.string().trim().min(10).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("privacy_requests").insert({
      name: data.name,
      email: data.email.toLowerCase(),
      company: data.company || null,
      request_type: data.requestType,
      details: data.details,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const submitPublicSupportRequest = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        workspace: z.string().trim().max(160).optional().default(""),
        category: z.string().trim().min(2).max(40),
        priority: z.enum(["low", "normal", "high", "urgent"]),
        subject: z.string().trim().min(4).max(200),
        message: z.string().trim().min(10).max(6000),
        attachment: z
          .object({
            name: z.string().trim().min(1).max(200),
            type: z.string().trim().max(120).optional().default(""),
            /** base64 payload without the data: prefix. */
            data: z.string().max(8_000_000),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        status: "open",
        source: "public_form",
        contact_name: data.name,
        contact_email: data.email.toLowerCase(),
        contact_workspace: data.workspace || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    let attachmentPath: string | null = null;
    let attachmentSize: number | null = null;
    if (data.attachment) {
      const bytes = Buffer.from(data.attachment.data, "base64");
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Attachment must be under 5 MB");
      const safeName = data.attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
      const path = `support/${ticket.id}/${Date.now()}-${safeName}`;
      try {
        const { putR2Object } = await import("@/lib/r2.server");
        await putR2Object(
          path,
          new Uint8Array(bytes),
          data.attachment.type || "application/octet-stream",
        );
        attachmentPath = path;
        attachmentSize = bytes.byteLength;
      } catch {
        // An attachment failure must not lose the customer's message.
      }
    }

    const { error: msgError } = await supabaseAdmin.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_role: "customer",
      body: `From: ${data.name} <${data.email}>${data.workspace ? `\nWorkspace: ${data.workspace}` : ""}\n\n${data.message}`,
      attachment_path: attachmentPath,
      attachment_name: attachmentPath ? data.attachment?.name ?? null : null,
      attachment_size: attachmentSize,
    });
    if (msgError) throw new Error(msgError.message);

    return { ok: true as const, ticketId: ticket.id as string };
  });

/* ------------------------------------------------------------------- admin */

export const adminListSubprocessors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Subprocessor[]> => {
    await assertAdmin(context);
    const { SUBPROCESSOR_COLUMNS } = await import("@/lib/trust-center.server");
    const { data, error } = await context.supabase
      .from("subprocessors")
      .select(SUBPROCESSOR_COLUMNS)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Subprocessor[];
  });

export const adminSaveSubprocessor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        provider: z.string().trim().min(2).max(120),
        service: z.string().trim().max(160).default(""),
        purpose: z.string().trim().max(400).default(""),
        dataProcessed: z.string().trim().max(400).default(""),
        location: z.string().trim().max(160).default(""),
        status: z.string().trim().max(40).default("active"),
        published: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = {
      provider: data.provider,
      service: data.service,
      purpose: data.purpose,
      data_processed: data.dataProcessed,
      location: data.location,
      status: data.status,
      published: data.published,
      sort_order: data.sortOrder,
    };
    const query = data.id
      ? context.supabase.from("subprocessors").update(row).eq("id", data.id)
      : context.supabase.from("subprocessors").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteSubprocessor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("subprocessors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminListGuide = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ articles: GuideArticle[]; alerts: ServiceAlert[] }> => {
    await assertAdmin(context);
    const { GUIDE_COLUMNS, ALERT_COLUMNS } = await import("@/lib/trust-center.server");
    const [articles, alerts] = await Promise.all([
      context.supabase.from("guide_articles").select(GUIDE_COLUMNS).order("sort_order"),
      context.supabase
        .from("service_alerts")
        .select(ALERT_COLUMNS)
        .order("starts_at", { ascending: false }),
    ]);
    if (articles.error) throw new Error(articles.error.message);
    if (alerts.error) throw new Error(alerts.error.message);
    const { data: helpRows } = await (context.supabase as any).from("guide_articles").select("id").eq("help_center", true);
    const helpIds = new Set((helpRows ?? []).map((r: { id: string }) => r.id));
    return {
      articles: ((articles.data ?? []) as unknown as GuideArticle[]).filter((a) => !helpIds.has(a.id)),
      alerts: (alerts.data ?? []) as unknown as ServiceAlert[],
    };
  });

export const adminSaveGuideArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        category: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(120)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
        title: z.string().trim().min(3).max(160),
        summary: z.string().trim().max(400).default(""),
        body: z.string().trim().max(20000).default(""),
        published: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id) {
      const { data: help } = await (context.supabase as any).from("guide_articles").select("id").eq("id", data.id).eq("help_center", true).maybeSingle();
      if (help) throw new Error("Manage this article in Help Center");
    }
    const row = {
      category: data.category,
      slug: data.slug,
      title: data.title,
      summary: data.summary,
      body: data.body,
      published: data.published,
      sort_order: data.sortOrder,
    };
    const query = data.id
      ? context.supabase.from("guide_articles").update(row).eq("id", data.id)
      : context.supabase.from("guide_articles").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteGuideArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: help } = await (context.supabase as any).from("guide_articles").select("id").eq("id", data.id).eq("help_center", true).maybeSingle();
    if (help) throw new Error("Manage this article in Help Center");
    const { error } = await context.supabase.from("guide_articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminSaveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        alertType: z.enum(["information", "maintenance", "warning", "incident"]),
        title: z.string().trim().min(3).max(160),
        message: z.string().trim().max(4000).default(""),
        startsAt: z.string().trim().min(4),
        endsAt: z.string().trim().optional().default(""),
        published: z.boolean().default(false),
        resolved: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = {
      alert_type: data.alertType,
      title: data.title,
      message: data.message,
      starts_at: new Date(data.startsAt).toISOString(),
      ends_at: data.endsAt ? new Date(data.endsAt).toISOString() : null,
      published: data.published,
      resolved_at: data.resolved ? new Date().toISOString() : null,
    };
    const query = data.id
      ? context.supabase.from("service_alerts").update(row).eq("id", data.id)
      : context.supabase.from("service_alerts").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("service_alerts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminListPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrivacyRequest[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("privacy_requests")
      .select(
        "id, name, email, company, request_type, details, status, admin_notes, handled_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PrivacyRequest[];
  });

export const adminUpdatePrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "in_review", "completed", "rejected"]),
        adminNotes: z.string().trim().max(4000).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("privacy_requests")
      .update({
        status: data.status,
        admin_notes: data.adminNotes || null,
        handled_at:
          data.status === "completed" || data.status === "rejected"
            ? new Date().toISOString()
            : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
