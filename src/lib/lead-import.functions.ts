/**
 * Server functions for background CSV lead imports.
 *
 * The browser uploads the CSV straight to R2, then calls `startLeadImport`. That
 * call only records the job and hands processing to the background worker, so
 * the wizard never waits for a large file and the customer can navigate away.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidR2Key, ownerFromKey } from "@/lib/files-model";

const JOB_COLUMNS =
  "id, workspace_id, file_name, file_size, status, list_id, total_rows, processed_rows, imported_rows, skipped_rows, duplicate_rows, invalid_rows, failed_rows, byte_offset, error_message, errors, created_at, finished_at";

/** Fire-and-forget continuation: the response returns immediately either way. */
async function kickWorker(jobId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLeadImportJobToCompletion } = await import("@/lib/lead-import.server");
  const { keepAlive } = await import("@/lib/background.server");
  const work = runLeadImportJobToCompletion(supabaseAdmin as never, jobId, { budgetMs: 20_000 });
  const handed = await keepAlive(work);
  // Without platform background support the scheduled runner picks the job up.
  if (!handed) void work.catch(() => undefined);
}

export const startLeadImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        fileId: z.string().uuid().nullish(),
        r2Key: z.string().trim().min(3).max(512),
        fileName: z.string().trim().min(1).max(255),
        fileSize: z.number().int().nonnegative(),
        mapping: z.record(z.string(), z.string()),
        listId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(10).optional(),
        listVerified: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { UNVERIFIED_LIST_MESSAGE } = await import("@/lib/leads.functions");
    if (data.listVerified !== true) throw new Error(UNVERIFIED_LIST_MESSAGE);

    if (!isValidR2Key(data.r2Key)) throw new Error("Invalid file reference");
    // The uploader's own id is baked into every object key, so one workspace can
    // never point an import job at another workspace's file.
    const owner = ownerFromKey(data.r2Key);
    if (!owner || owner.userId !== context.userId) throw new Error("Forbidden");

    if (!Object.values(data.mapping).includes("email")) {
      throw new Error("Map one column to Email before importing");
    }

    // Written through the caller's own client: workspace membership is enforced
    // by the existing row-level rules, not by this code.
    const { data: row, error } = await context.supabase
      .from("lead_import_jobs")
      .insert({
        workspace_id: data.workspaceId,
        created_by: context.userId,
        file_id: data.fileId ?? null,
        r2_key: data.r2Key,
        file_name: data.fileName,
        file_size: data.fileSize,
        status: "uploaded",
        mapping: data.mapping,
        list_id: data.listId ?? null,
        tags: data.tags ?? [],
        list_verified: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const jobId = row.id as string;
    await kickWorker(jobId);
    return { jobId };
  });

export const listLeadImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(20).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_import_jobs")
      .select(JOB_COLUMNS)
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { jobs: rows ?? [] };
  });

export const getLeadImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_import_jobs")
      .select(JOB_COLUMNS)
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { job: row ?? null };
  });

export const cancelLeadImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Leads already imported stay imported; the worker stops at its next chunk.
    const { error } = await context.supabase
      .from("lead_import_jobs")
      .update({ status: "cancelled", lease_until: null, finished_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .in("status", ["uploading", "uploaded", "processing"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Resumes a failed import from the last committed chunk. Already-imported leads
 * are skipped by the workspace's unique email rule, so a retry cannot duplicate.
 */
export const retryLeadImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_import_jobs")
      .update({ status: "uploaded", error_message: null, lease_until: null, finished_at: null })
      .eq("id", data.jobId)
      .in("status", ["failed", "cancelled"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That import cannot be resumed");

    await kickWorker(row.id as string);
    return { ok: true };
  });
