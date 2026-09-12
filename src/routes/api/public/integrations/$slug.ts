/**
 * Inbound integration endpoint (Zapier / Make).
 *
 * Security: the caller must present the workspace-specific token that was
 * generated when the integration was connected. The token identifies exactly
 * one connection, so a request can only ever write into that workspace.
 * Repeated deliveries are de-duplicated with an idempotency key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  email: z.string().email().max(320),
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
  company: z.string().max(200).optional(),
  job_title: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  website: z.string().max(300).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/integrations/$slug")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (token.length < 16) return json({ error: "Missing token" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conn } = await supabaseAdmin
          .from("integration_connections")
          .select("id, workspace_id, slug, status")
          .eq("slug", params.slug)
          .eq("config->>inbound_token", token)
          .maybeSingle();
        if (!conn) return json({ error: "Invalid token" }, 401);
        const connection = conn as { id: string; workspace_id: string; slug: string; status: string };
        if (connection.status === "disabled") return json({ error: "Connection disabled" }, 403);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "Invalid payload", details: parsed.error.issues.slice(0, 5) }, 400);
        }

        const idempotencyKey =
          request.headers.get("x-idempotency-key") ??
          `inbound:${connection.id}:${parsed.data.email.toLowerCase()}`;

        const { data: seen } = await supabaseAdmin
          .from("integration_events")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (seen) return json({ ok: true, deduplicated: true });

        const lead = parsed.data;
        const { data: priorLead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("workspace_id", connection.workspace_id)
          .eq("email", lead.email.toLowerCase())
          .maybeSingle();

        const { data: stored, error } = await supabaseAdmin
          .from("leads")
          .upsert(
            {
              workspace_id: connection.workspace_id,
              email: lead.email.toLowerCase(),
              first_name: lead.first_name ?? null,
              last_name: lead.last_name ?? null,
              company: lead.company ?? null,
              job_title: lead.job_title ?? null,
              phone: lead.phone ?? null,
              website: lead.website ?? null,
              lead_source: connection.slug,
            },
            { onConflict: "workspace_id,email" },
          )
          .select("id")
          .maybeSingle();

        if (!error && !priorLead && stored?.id) {
          const { emitLeadCreated } = await import("@/lib/lead-events.server");
          await emitLeadCreated({
            workspaceId: connection.workspace_id,
            leadIds: [stored.id],
          });
        }

        await supabaseAdmin.from("integration_events").insert({
          workspace_id: connection.workspace_id,
          connection_id: connection.id,
          slug: connection.slug,
          direction: "inbound",
          event_type: "lead.created",
          status: error ? "failed" : "success",
          message: error ? error.message : "Lead received.",
          payload: { lead: { email: lead.email } } as never,
          idempotency_key: idempotencyKey,
        });

        if (error) return json({ error: "Could not store the lead" }, 500);
        return json({ ok: true });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, x-idempotency-key",
          },
        }),
    },
  },
});
