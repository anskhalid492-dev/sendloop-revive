/**
 * Webhook endpoint management for the public API.
 *
 * The signing secret is returned exactly once, when the endpoint is created or
 * rotated. Only a hash (for lookup/verification) plus the encrypted copy the
 * delivery worker needs are stored, and neither ever appears in a response.
 */
import { z } from "zod";

import { ApiError } from "../errors";
import { decodeCursor, paginate, parseLimit } from "../pagination";
import { serializeDelivery, serializeWebhook } from "../serializers";
import type { ApiContext } from "../runtime.server";
import { parseQuery, parseWith, pathId } from "../validate";
import { generateWebhookSecret, sha256Hex } from "../webhook-delivery.server";
import { WEBHOOK_EVENTS } from "../webhooks";

const FIELDS =
  "id, workspace_id, url, description, events, status, last_delivery_at, last_delivery_status, consecutive_failures, created_at, updated_at";

const eventSchema = z.union([z.literal("*"), z.enum(WEBHOOK_EVENTS)]);

const urlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((value) => value.startsWith("https://"), {
    message: "Webhook URLs must use https.",
  })
  .refine(
    (value) => {
      // Block loopback/private hosts so a webhook cannot be pointed at internal
      // infrastructure (SSRF).
      try {
        const host = new URL(value).hostname.toLowerCase();
        return !(
          host === "localhost" ||
          host === "0.0.0.0" ||
          host.endsWith(".localhost") ||
          host.endsWith(".internal") ||
          /^127\./.test(host) ||
          /^10\./.test(host) ||
          /^192\.168\./.test(host) ||
          /^169\.254\./.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        );
      } catch {
        return false;
      }
    },
    { message: "Webhook URLs must point at a public host." },
  );

const createSchema = z
  .object({
    url: urlSchema,
    description: z.string().max(500).nullish(),
    events: z.array(eventSchema).min(1).max(WEBHOOK_EVENTS.length + 1),
  })
  .strict();

const patchSchema = z
  .object({
    url: urlSchema.optional(),
    description: z.string().max(500).nullish(),
    events: z.array(eventSchema).min(1).max(WEBHOOK_EVENTS.length + 1).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    rotate_secret: z.boolean().optional(),
  })
  .strict();

export async function listWebhooks(ctx: ApiContext) {
  const { data, error } = await ctx.admin
    .from("webhook_endpoints")
    .select(FIELDS)
    .eq("workspace_id", ctx.auth.workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("internal_error", "Could not list webhook endpoints.");
  return { object: "list", data: (data ?? []).map(serializeWebhook) };
}

export async function createWebhook(ctx: ApiContext) {
  const input = parseWith(createSchema, ctx.body);
  const secret = generateWebhookSecret();
  const { encryptCredentials } = await import("@/lib/provider-credentials.server");

  const { data, error } = await ctx.admin
    .from("webhook_endpoints")
    .insert({
      workspace_id: ctx.auth.workspaceId,
      url: input.url,
      description: input.description ?? null,
      events: input.events,
      secret_hash: await sha256Hex(secret),
      secret_ciphertext: encryptCredentials({ secret }),
      created_by: ctx.auth.createdBy,
    })
    .select(FIELDS)
    .single();
  if (error) throw new ApiError("invalid_request", "The webhook endpoint could not be created.", {
    details: { reason: error.message },
  });

  // The only time the plaintext secret is ever returned.
  return { data: { ...serializeWebhook(data), secret } };
}

async function loadWebhook(ctx: ApiContext, id: string) {
  const { data } = await ctx.admin
    .from("webhook_endpoints")
    .select(FIELDS)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .maybeSingle();
  if (!data) throw new ApiError("webhook_not_found", "No webhook endpoint with that id exists.");
  return data;
}

export async function getWebhook(ctx: ApiContext) {
  const id = pathId(ctx.params["webhookId"], "webhook id");
  return { data: serializeWebhook(await loadWebhook(ctx, id)) };
}

export async function updateWebhook(ctx: ApiContext) {
  const id = pathId(ctx.params["webhookId"], "webhook id");
  await loadWebhook(ctx, id);
  const input = parseWith(patchSchema, ctx.body);

  const patch: Record<string, unknown> = {};
  if (input.url !== undefined) patch["url"] = input.url;
  if (input.description !== undefined) patch["description"] = input.description;
  if (input.events !== undefined) patch["events"] = input.events;
  if (input.status !== undefined) {
    patch["status"] = input.status;
    // Re-enabling clears the failure streak that disabled it.
    if (input.status === "active") patch["consecutive_failures"] = 0;
  }

  let secret: string | undefined;
  if (input.rotate_secret) {
    const { encryptCredentials } = await import("@/lib/provider-credentials.server");
    secret = generateWebhookSecret();
    patch["secret_hash"] = await sha256Hex(secret);
    patch["secret_ciphertext"] = encryptCredentials({ secret });
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError("invalid_request", "Provide at least one field to update.");
  }

  const { data, error } = await ctx.admin
    .from("webhook_endpoints")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId)
    .select(FIELDS)
    .single();
  if (error) throw new ApiError("invalid_request", "The webhook endpoint could not be updated.");

  return { data: secret ? { ...serializeWebhook(data), secret } : serializeWebhook(data) };
}

export async function deleteWebhook(ctx: ApiContext) {
  const id = pathId(ctx.params["webhookId"], "webhook id");
  await loadWebhook(ctx, id);
  const { error } = await ctx.admin
    .from("webhook_endpoints")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.auth.workspaceId);
  if (error) throw new ApiError("conflict", "The webhook endpoint could not be deleted.");
  return { data: { id, object: "webhook_endpoint", deleted: true } };
}

export async function listDeliveries(ctx: ApiContext) {
  const id = pathId(ctx.params["webhookId"], "webhook id");
  await loadWebhook(ctx, id);
  const q = parseQuery(
    z
      .object({
        limit: z.string().optional(),
        cursor: z.string().optional(),
        status: z.enum(["pending", "delivered", "failed", "cancelled"]).optional(),
      })
      .passthrough(),
    ctx.url,
  );
  const limit = parseLimit(q.limit ?? null);

  let query = ctx.admin
    .from("webhook_deliveries")
    .select(
      "id, endpoint_id, event_type, event_id, status, attempts, max_attempts, response_status, failure_reason, next_attempt_at, last_attempt_at, created_at",
    )
    .eq("workspace_id", ctx.auth.workspaceId)
    .eq("endpoint_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (q.status) query = query.eq("status", q.status);
  if (q.cursor) {
    const cursor = decodeCursor(q.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ApiError("internal_error", "Could not list deliveries.");
  const page = paginate(data ?? [], limit, (row: { created_at: string; id: string }) => ({
    createdAt: row.created_at,
    id: row.id,
  }));
  return { object: "list", ...page, data: page.data.map(serializeDelivery) };
}
