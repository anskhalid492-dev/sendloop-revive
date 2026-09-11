/**
 * One-time copy of legacy Supabase Storage objects into Cloudflare R2.
 *
 * Admin-only, resumable and strictly non-destructive: objects are copied and
 * recorded in the `files` table, and nothing is ever removed from the old
 * buckets. Run it repeatedly until every bucket reports zero remaining.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEGACY_BUCKETS = ["avatars", "workspace-logos", "support-attachments", "blog-media", "review-media"] as const;

type MigrationResult = {
  bucket: string;
  scanned: number;
  copied: number;
  skipped: number;
  failed: number;
  errors: string[];
  done: boolean;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

/** Depth-first listing of a legacy bucket (Supabase lists one folder at a time). */
async function listBucketObjects(
  admin: any,
  bucket: string,
  prefix: string,
  out: Array<{ path: string; size: number; mime: string }>,
  limit: number,
): Promise<void> {
  if (out.length >= limit) return;
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  for (const entry of data) {
    if (out.length >= limit) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null && !entry.metadata) {
      await listBucketObjects(admin, bucket, path, out, limit);
    } else {
      out.push({
        path,
        size: Number(entry.metadata?.size ?? 0),
        mime: String(entry.metadata?.mimetype ?? "application/octet-stream"),
      });
    }
  }
}

export const migrateStorageToR2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        buckets: z.array(z.enum(LEGACY_BUCKETS)).optional(),
        limitPerBucket: z.number().int().min(1).max(500).default(100),
        dryRun: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { legacyKeyToR2 } = await import("@/lib/files-model");
    const { putR2Object, headR2Object } = await import("@/lib/r2.server");

    const buckets = data.buckets ?? [...LEGACY_BUCKETS];
    const results: MigrationResult[] = [];

    for (const bucket of buckets) {
      const result: MigrationResult = {
        bucket,
        scanned: 0,
        copied: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        done: true,
      };

      const objects: Array<{ path: string; size: number; mime: string }> = [];
      await listBucketObjects(supabaseAdmin, bucket, "", objects, data.limitPerBucket + 1);
      if (objects.length > data.limitPerBucket) {
        result.done = false;
        objects.length = data.limitPerBucket;
      }
      result.scanned = objects.length;

      for (const object of objects) {
        const key = legacyKeyToR2(bucket, object.path);
        try {
          const existing = await headR2Object(key);
          if (existing.exists) {
            result.skipped += 1;
            continue;
          }
          if (data.dryRun) {
            result.copied += 1;
            continue;
          }

          const download = await supabaseAdmin.storage.from(bucket).download(object.path);
          if (download.error || !download.data) throw new Error(download.error?.message ?? "download failed");
          const bytes = new Uint8Array(await download.data.arrayBuffer());
          await putR2Object(key, bytes, object.mime);

          // Metadata rows carry the owner segment of the key when there is one.
          const segments = key.split("/");
          const maybeOwner = segments[1] ?? "";
          const isUuid = /^[0-9a-f-]{36}$/i.test(maybeOwner);
          await supabaseAdmin.from("files").upsert(
            {
              user_id: isUuid ? maybeOwner : context.userId,
              type: segments[0],
              r2_key: key,
              file_name: segments[segments.length - 1],
              size: bytes.byteLength,
              mime_type: object.mime,
              status: "ready",
            },
            { onConflict: "r2_key" },
          );
          result.copied += 1;
        } catch (e) {
          result.failed += 1;
          if (result.errors.length < 5) result.errors.push(`${object.path}: ${(e as Error).message}`);
        }
      }

      results.push(result);
    }

    return { results, dryRun: data.dryRun };
  });
