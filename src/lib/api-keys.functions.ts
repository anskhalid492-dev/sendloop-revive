/**
 * Dashboard management of Public API keys.
 *
 * All queries run through the caller's authenticated Supabase client, so RLS
 * decides what they may see and change: members can list keys, only owners and
 * admins can create, rotate or revoke them. The plaintext secret is returned
 * exactly once — from `createApiKey` — and only its SHA-256 hash is stored.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api/v1/keys";
import { isGrantableScope } from "@/lib/api/v1/scopes";

const scopeList = z
  .array(z.string().min(1).max(40))
  .min(1)
  .max(20)
  .refine((scopes) => scopes.every(isGrantableScope), {
    message: "One or more scopes are not recognised.",
  });

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("api_keys")
      .select(
        "id, name, prefix, scopes, status, last_used_at, revoked_at, expires_at, rate_limit_per_minute, created_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { keys: rows ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(80),
        scopes: scopeList,
        expiresAt: z.string().datetime().nullish(),
        rateLimitPerMinute: z.number().int().min(10).max(6000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const secret = generateApiKey();

    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        prefix: keyPrefix(secret),
        key_hash: await hashApiKey(secret),
        scopes: data.scopes,
        created_by: context.userId,
        expires_at: data.expiresAt ?? null,
        rate_limit_per_minute: data.rateLimitPerMinute ?? 120,
      })
      .select("id, name, prefix, scopes, status, expires_at, rate_limit_per_minute, created_at")
      .single();

    // RLS rejects non-admins here; surface that as a readable message.
    if (error) throw new Error("Only workspace owners and admins can create API keys.");

    return { key: row, secret };
  });

export const updateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        scopes: scopeList.optional(),
        status: z.enum(["active", "revoked"]).optional(),
        rateLimitPerMinute: z.number().int().min(10).max(6000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.scopes !== undefined) patch["scopes"] = data.scopes;
    if (data.rateLimitPerMinute !== undefined)
      patch["rate_limit_per_minute"] = data.rateLimitPerMinute;
    if (data.status !== undefined) {
      patch["status"] = data.status;
      patch["revoked_at"] = data.status === "revoked" ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase.from("api_keys").update(patch).eq("id", data.id);
    if (error) throw new Error("Only workspace owners and admins can change API keys.");
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error("Only workspace owners and admins can delete API keys.");
    return { ok: true };
  });
