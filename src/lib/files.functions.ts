/**
 * File service backed by Cloudflare R2.
 *
 * The app never stores bytes: the browser asks for a short-lived presigned URL
 * and talks to R2 directly. The database keeps metadata only (`files` table).
 *
 * Every presign request is authenticated, checked against the owner segment of
 * the object key, size/mime limited and rate limited.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  FILE_CATEGORIES,
  MAX_UPLOAD_BYTES,
  TMP_TTL_HOURS,
  buildR2Key,
  fileExtension,
  isAllowedMimeType,
  isValidR2Key,
  ownerFromKey,
  safeFileName,
  type FileCategory,
} from "@/lib/files-model";

const PRESIGN_LIMIT_PER_MINUTE = 60;

type AuthContext = { supabase: any; userId: string };

async function assertPresignRateLimit(context: AuthContext, action: string) {
  // Counted with the service-role client: the counter routine is backend-only,
  // so a caller can never reset or bypass their own budget.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("admin_rate_limit_hit", {
    _bucket: `r2:${action}:${context.userId}`,
    _limit: PRESIGN_LIMIT_PER_MINUTE,
    _window_seconds: 60,
  });
  // A rate-limit outage must not break uploads; only an explicit deny blocks.
  if (error) return;
  if (data && data.allowed === false) {
    throw new Error("Too many file requests — please wait a moment and try again");
  }
}

async function isStaff(context: AuthContext): Promise<boolean> {
  const [admin, support] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "support" }),
  ]);
  return Boolean(admin.data) || Boolean(support.data);
}

/** A caller may touch a key when the owner segment is their own user id. */
function ownsKey(key: string, userId: string): boolean {
  const owner = ownerFromKey(key);
  return Boolean(owner && owner.userId === userId);
}

const categorySchema = z.enum(FILE_CATEGORIES as unknown as [FileCategory, ...FileCategory[]]);

export const requestFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        category: categorySchema,
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().max(160).default("application/octet-stream"),
        size: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES),
        workspaceId: z.string().uuid().nullish(),
        campaignId: z.string().uuid().nullish(),
        invoiceId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPresignRateLimit(context as AuthContext, "upload");

    const mimeType = (data.mimeType || "application/octet-stream").toLowerCase();
    if (data.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 50 MB or smaller");
    if (!isAllowedMimeType(mimeType)) throw new Error(`Unsupported file type: ${mimeType}`);

    const key = buildR2Key({
      category: data.category,
      userId: context.userId,
      extension: fileExtension(data.fileName),
      campaignId: data.campaignId ?? null,
      invoiceId: data.invoiceId ?? null,
      fileName: data.fileName,
    });

    const { presignR2Url } = await import("@/lib/r2.server");
    const uploadUrl = await presignR2Url({ key, method: "PUT", expiresInSeconds: 300 });

    const expiresAt =
      data.category === "tmp" ? new Date(Date.now() + TMP_TTL_HOURS * 3600_000).toISOString() : null;

    const { data: row, error } = await context.supabase
      .from("files")
      .insert({
        user_id: context.userId,
        workspace_id: data.workspaceId ?? null,
        type: data.category,
        r2_key: key,
        file_name: safeFileName(data.fileName),
        size: data.size,
        mime_type: mimeType,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { fileId: row.id as string, key, uploadUrl, expiresIn: 300 };
  });

export const confirmFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fileId: z.string().uuid(),
        size: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES).optional(),
        status: z.enum(["ready", "failed"]).default("ready"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { status: string; size?: number } = { status: data.status };
    if (typeof data.size === "number") patch.size = data.size;
    const { error } = await context.supabase
      .from("files")
      .update(patch)
      .eq("id", data.fileId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Short-lived download URL. Either a metadata row id or a raw object key can be
 * supplied; both go through the same ownership check.
 */
export const requestFileDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fileId: z.string().uuid().optional(),
        key: z.string().trim().min(3).max(512).optional(),
        expiresIn: z.number().int().min(30).max(3600).default(300),
      })
      .refine((v) => Boolean(v.fileId || v.key), { message: "fileId or key is required" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPresignRateLimit(context as AuthContext, "download");

    let key = data.key ?? "";
    if (data.fileId) {
      const { data: row, error } = await context.supabase
        .from("files")
        .select("r2_key, user_id")
        .eq("id", data.fileId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("File not found");
      key = row.r2_key as string;
    }

    if (!isValidR2Key(key)) throw new Error("Invalid file reference");
    if (!ownsKey(key, context.userId) && !(await isStaff(context as AuthContext))) {
      throw new Error("Forbidden");
    }

    const { presignR2Url } = await import("@/lib/r2.server");
    const url = await presignR2Url({ key, method: "GET", expiresInSeconds: data.expiresIn });
    return { url, key };
  });

/**
 * Download URL for shared assets whose key is not owned by the caller
 * (workspace logos, blog media, support attachments read by staff).
 */
export const requestSharedFileDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: z.string().trim().min(3).max(512),
        expiresIn: z.number().int().min(30).max(3600).default(900),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPresignRateLimit(context as AuthContext, "shared");
    if (!isValidR2Key(data.key)) throw new Error("Invalid file reference");

    const owner = ownerFromKey(data.key);
    const category = owner?.category ?? "";
    const readableByAnyMember = category === "media" || category === "workspace-logos";

    if (!readableByAnyMember && !ownsKey(data.key, context.userId)) {
      if (!(await isStaff(context as AuthContext))) throw new Error("Forbidden");
    }

    const { presignR2Url } = await import("@/lib/r2.server");
    const url = await presignR2Url({ key: data.key, method: "GET", expiresInSeconds: data.expiresIn });
    return { url };
  });

export const deleteStoredFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ fileId: z.string().uuid().optional(), key: z.string().trim().min(3).max(512).optional() })
      .refine((v) => Boolean(v.fileId || v.key), { message: "fileId or key is required" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let key = data.key ?? "";
    if (data.fileId) {
      const { data: row } = await context.supabase
        .from("files")
        .select("r2_key")
        .eq("id", data.fileId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!row) throw new Error("File not found");
      key = row.r2_key as string;
    }
    if (!isValidR2Key(key)) throw new Error("Invalid file reference");
    if (!ownsKey(key, context.userId) && !(await isStaff(context as AuthContext))) {
      throw new Error("Forbidden");
    }

    const { deleteR2Object } = await import("@/lib/r2.server");
    await deleteR2Object(key);
    await context.supabase.from("files").delete().eq("r2_key", key);
    return { ok: true };
  });

export const listMyFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ type: categorySchema.optional(), limit: z.number().int().min(1).max(200).default(50) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("files")
      .select("id, type, r2_key, file_name, size, mime_type, status, created_at, expires_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.type) query = query.eq("type", data.type);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { files: rows ?? [] };
  });

/**
 * Stores a server-generated document (export, invoice, report) in R2 and
 * returns a download link. Used by flows that build the file server-side.
 */
export const saveGeneratedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        category: categorySchema,
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().max(160).default("text/csv"),
        content: z.string().max(MAX_UPLOAD_BYTES),
        workspaceId: z.string().uuid().nullish(),
        campaignId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const bytes = new TextEncoder().encode(data.content);
    if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Generated file exceeds the 50 MB limit");

    const key = buildR2Key({
      category: data.category,
      userId: context.userId,
      extension: fileExtension(data.fileName, "csv"),
      campaignId: data.campaignId ?? null,
      fileName: data.fileName,
    });

    const { putR2Object, presignR2Url } = await import("@/lib/r2.server");
    await putR2Object(key, bytes, data.mimeType || "text/csv");

    const expiresAt =
      data.category === "tmp" ? new Date(Date.now() + TMP_TTL_HOURS * 3600_000).toISOString() : null;

    const { data: row, error } = await context.supabase
      .from("files")
      .insert({
        user_id: context.userId,
        workspace_id: data.workspaceId ?? null,
        type: data.category,
        r2_key: key,
        file_name: safeFileName(data.fileName),
        size: bytes.byteLength,
        mime_type: data.mimeType || "text/csv",
        status: "ready",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const url = await presignR2Url({ key, method: "GET", expiresInSeconds: 900 });
    return { fileId: row.id as string, key, url };
  });
