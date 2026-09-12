/**
 * `lead.created` fan-out.
 *
 * Single place every lead-creation path calls so the event fires identically
 * from the CRM, the dashboard import, the public API and inbound integrations.
 *
 * Two independent destinations, on purpose:
 *  - `webhook_endpoints` (public API subscriptions, incl. Zapier REST Hooks) —
 *    queued and deduplicated on (endpoint, event_id), so the same lead can only
 *    ever be delivered once per endpoint no matter how often this is called.
 *  - `integration_connections` (the webhook URL a customer pastes into the
 *    Settings → Integrations card) — delivered inline, so it is only attempted
 *    for interactive single-lead creates, never for a 5,000-row import.
 *
 * Every failure is swallowed: a webhook problem must never break lead creation.
 */

const LEAD_FIELDS =
  "id, workspace_id, email, first_name, last_name, company, job_title, phone, website, linkedin_url, city, state, country, status, crm_stage, stage_id, list_id, owner_id, tags, deal_value, lead_source, custom_fields, archived, last_activity_at, created_at, updated_at";

/** Max leads we will notify inline-delivered integration connections about. */
const INLINE_INTEGRATION_LIMIT = 5;

/** Chunk size for loading lead rows back out of the database. */
const LOAD_CHUNK = 200;

export type EmitLeadCreatedArgs = {
  workspaceId: string;
  leadIds: string[];
  /**
   * True for interactive single/few-lead creates. Bulk paths leave it false so
   * imports never block on customer-pasted webhook URLs.
   */
  inline?: boolean;
};

export async function emitLeadCreated(args: EmitLeadCreatedArgs): Promise<void> {
  const ids = [...new Set(args.leadIds.filter(Boolean))];
  if (ids.length === 0) return;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueWebhookEvent } = await import("@/lib/api/v1/webhook-delivery.server");
    const { serializeContact } = await import("@/lib/api/v1/serializers");

    // Read back through the service role and re-check the workspace, so a
    // caller can never make us publish another tenant's lead.
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < ids.length; i += LOAD_CHUNK) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select(LEAD_FIELDS)
        .eq("workspace_id", args.workspaceId)
        .in("id", ids.slice(i, i + LOAD_CHUNK));
      for (const row of (data ?? []) as Array<Record<string, unknown>>) rows.push(row);
    }
    if (rows.length === 0) return;

    for (const row of rows) {
      const lead = serializeContact(row as never);
      // Stable event id: replaying the same creation is delivered once.
      await enqueueWebhookEvent(
        supabaseAdmin,
        args.workspaceId,
        "lead.created",
        `lead.created:${lead.id}`,
        { lead },
      );
    }

    if (args.inline && rows.length <= INLINE_INTEGRATION_LIMIT) {
      const { emitIntegrationEvent } = await import("@/lib/integrations.server");
      for (const row of rows) {
        const lead = serializeContact(row as never);
        await emitIntegrationEvent(
          args.workspaceId,
          "lead.created",
          { lead },
          `lead.created:${lead.id}`,
        ).catch(() => undefined);
      }
    }
  } catch (error) {
    console.warn("[lead-events] lead.created fan-out failed", error);
  }
}
