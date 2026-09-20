/**
 * Chunked worker for background CSV lead imports.
 *
 * The CSV lives in the private R2 bucket. This worker leases a job, reads the
 * object in byte ranges, validates and inserts leads in batches, and records the
 * byte offset it reached after every chunk. Nothing ever holds the whole file:
 * a 500k-row CSV is just more chunks, not more memory.
 *
 * Resume and idempotency:
 *  - the byte offset is only advanced after the rows it covers are committed, so
 *    a crashed chunk is replayed from the last committed boundary;
 *  - inserts go through the existing unique (workspace_id, email) index with
 *    "do nothing" on conflict, so a replay can never duplicate a lead.
 *
 * Campaign scheduling, sending, mailboxes and the leads schema are untouched.
 */
import {
  IMPORT_CHUNK_BYTES,
  IMPORT_ERROR_SAMPLE,
  IMPORT_INSERT_BATCH,
  leadInsertRow,
  mapCsvRow,
  parseCsvChunk,
  parseCsvFirstRow,
  utf8Length,
  type ImportRowIssue,
} from "@/lib/lead-import";

type AnyClient = { from: (table: string) => any };

const LEASE_MS = 120_000;
const HEADER_PROBE_BYTES = 128 * 1024;
const MAX_ATTEMPTS = 8;

type JobRow = {
  id: string;
  workspace_id: string;
  r2_key: string;
  file_size: number;
  status: string;
  mapping: Record<string, string>;
  headers: string[];
  list_id: string | null;
  tags: string[];
  list_verified: boolean;
  processed_rows: number;
  imported_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  failed_rows: number;
  byte_offset: number;
  errors: ImportRowIssue[] | null;
  attempts: number;
};

const JOB_COLUMNS =
  "id, workspace_id, r2_key, file_size, status, mapping, headers, list_id, tags, list_verified, processed_rows, imported_rows, skipped_rows, duplicate_rows, invalid_rows, failed_rows, byte_offset, errors, attempts";

export type ImportTickResult = {
  jobId: string;
  status: string;
  processedRows: number;
  importedRows: number;
  more: boolean;
  reason?: string;
};

/** Leases the job so two workers never process the same chunk twice. */
async function lease(admin: AnyClient, jobId: string): Promise<JobRow | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("lead_import_jobs")
    .update({
      status: "processing",
      lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
      started_at: nowIso,
    })
    .eq("id", jobId)
    .in("status", ["uploaded", "processing", "failed"])
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .select(JOB_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRow | null) ?? null;
}

async function finish(
  admin: AnyClient,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("lead_import_jobs")
    .update({ ...patch, lease_until: null, finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

/**
 * Processes as much of one import job as fits in the time budget.
 * Returns `more: true` when the file still has bytes left.
 */
export async function processLeadImportJob(
  admin: AnyClient,
  jobId: string,
  options: { budgetMs?: number } = {},
): Promise<ImportTickResult> {
  const budgetMs = Math.min(Math.max(options.budgetMs ?? 20_000, 2_000), 120_000);
  const startedAt = Date.now();

  const job = await lease(admin, jobId);
  if (!job) {
    return { jobId, status: "busy", processedRows: 0, importedRows: 0, more: false, reason: "leased" };
  }

  // The verification gate is part of the lead rules, not the transport.
  if (!job.list_verified) {
    await finish(admin, jobId, {
      status: "failed",
      error_message: "This list was not confirmed as verified, so nothing was imported.",
    });
    return { jobId, status: "failed", processedRows: 0, importedRows: 0, more: false };
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    await finish(admin, jobId, {
      status: "failed",
      error_message: "Import stopped after too many retries. The original file is still stored.",
    });
    return { jobId, status: "failed", processedRows: 0, importedRows: 0, more: false };
  }

  const { getR2ObjectRange, headR2Object } = await import("@/lib/r2.server");
  const decoder = new TextDecoder();

  let fileSize = job.file_size;
  let offset = job.byte_offset;
  let headers = Array.isArray(job.headers) ? job.headers : [];
  const counters = {
    processed: job.processed_rows,
    imported: job.imported_rows,
    skipped: job.skipped_rows,
    duplicates: job.duplicate_rows,
    invalid: job.invalid_rows,
    failed: job.failed_rows,
  };
  const errorSample: ImportRowIssue[] = Array.isArray(job.errors) ? [...job.errors] : [];

  try {
    if (!fileSize) {
      const head = await headR2Object(job.r2_key);
      if (!head.exists || head.size <= 0) throw new Error("The uploaded file could not be read");
      fileSize = head.size;
      await admin.from("lead_import_jobs").update({ file_size: fileSize }).eq("id", jobId);
    }

    if (headers.length === 0) {
      const probe = await getR2ObjectRange(
        job.r2_key,
        0,
        Math.min(HEADER_PROBE_BYTES, fileSize) - 1,
      );
      if (!probe.ok) throw new Error("The uploaded file could not be read");
      const first = parseCsvFirstRow(decoder.decode(probe.bytes));
      if (!first) throw new Error("That file has no readable header row");
      headers = first.values.map((value) => value.trim());
      offset = Math.max(offset, first.consumed);
      await admin
        .from("lead_import_jobs")
        .update({ headers, byte_offset: offset })
        .eq("id", jobId);
    }

    const { checkUsageLimit } = await import("@/lib/billing/usage.server");
    const { emitLeadCreated } = await import("@/lib/lead-events.server");

    while (offset < fileSize) {
      if (Date.now() - startedAt > budgetMs) {
        await admin.from("lead_import_jobs").update({ lease_until: null }).eq("id", jobId);
        return {
          jobId,
          status: "processing",
          processedRows: counters.processed,
          importedRows: counters.imported,
          more: true,
        };
      }

      const end = Math.min(offset + IMPORT_CHUNK_BYTES, fileSize) - 1;
      const chunk = await getR2ObjectRange(job.r2_key, offset, end);
      if (!chunk.ok) throw new Error("The uploaded file could not be read");

      let text = decoder.decode(chunk.bytes);
      const isLastChunk = end >= fileSize - 1;
      // The final row of a file often has no trailing newline.
      if (isLastChunk && !text.endsWith("\n")) text += "\n";

      const { rows, consumed } = parseCsvChunk(text);
      if (consumed === 0) {
        throw new Error("A row in this file is too large to import");
      }

      const seen = new Set<string>();
      const candidates: Array<Record<string, unknown>> = [];
      let invalidInChunk = 0;
      let duplicatesInChunk = 0;

      for (let i = 0; i < rows.length; i += 1) {
        const rowNumber = counters.processed + i + 1;
        const mapped = mapCsvRow({
          headers,
          values: rows[i] as string[],
          mapping: job.mapping ?? {},
          rowNumber,
        });
        if (!mapped.ok) {
          invalidInChunk += 1;
          if (errorSample.length < IMPORT_ERROR_SAMPLE) errorSample.push(mapped.issue);
          continue;
        }
        if (seen.has(mapped.email)) {
          duplicatesInChunk += 1;
          continue;
        }
        seen.add(mapped.email);
        candidates.push(
          leadInsertRow({
            record: mapped.record,
            workspaceId: job.workspace_id,
            listId: job.list_id,
            tags: job.tags ?? [],
          }),
        );
      }

      // Imports must still fit inside the plan's lead allowance.
      if (candidates.length) await checkUsageLimit(job.workspace_id, "leads", candidates.length);

      let insertedInChunk = 0;
      const insertedIds: string[] = [];
      for (let i = 0; i < candidates.length; i += IMPORT_INSERT_BATCH) {
        const batch = candidates.slice(i, i + IMPORT_INSERT_BATCH);
        const { data: inserted, error } = await admin
          .from("leads")
          .upsert(batch as never, { onConflict: "workspace_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error(error.message);
        const ids = ((inserted ?? []) as Array<{ id: string }>).map((row) => row.id);
        insertedIds.push(...ids);
        insertedInChunk += ids.length;
        // Anything the unique index rejected already exists in this workspace.
        duplicatesInChunk += batch.length - ids.length;
      }

      counters.processed += rows.length;
      counters.imported += insertedInChunk;
      counters.invalid += invalidInChunk;
      counters.duplicates += duplicatesInChunk;
      counters.skipped += invalidInChunk + duplicatesInChunk;
      offset += consumed;

      const { data: updated, error: updateError } = await admin
        .from("lead_import_jobs")
        .update({
          byte_offset: offset,
          processed_rows: counters.processed,
          imported_rows: counters.imported,
          invalid_rows: counters.invalid,
          duplicate_rows: counters.duplicates,
          skipped_rows: counters.skipped,
          errors: errorSample,
          lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);

      if (insertedIds.length) {
        await emitLeadCreated({ workspaceId: job.workspace_id, leadIds: insertedIds }).catch(
          () => undefined,
        );
      }

      // The row disappeared from "processing": the customer cancelled it.
      if (!updated) {
        return {
          jobId,
          status: "cancelled",
          processedRows: counters.processed,
          importedRows: counters.imported,
          more: false,
        };
      }
    }

    const hadProblems = counters.invalid > 0 || counters.failed > 0;
    await finish(admin, jobId, {
      status: hadProblems ? "completed_with_errors" : "completed",
      total_rows: counters.processed,
      error_message: null,
    });
    return {
      jobId,
      status: hadProblems ? "completed_with_errors" : "completed",
      processedRows: counters.processed,
      importedRows: counters.imported,
      more: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    // The job, its progress and the original R2 file are all preserved so the
    // customer can resume from the last committed chunk.
    await admin
      .from("lead_import_jobs")
      .update({ status: "failed", error_message: message.slice(0, 500), lease_until: null })
      .eq("id", jobId);
    return {
      jobId,
      status: "failed",
      processedRows: counters.processed,
      importedRows: counters.imported,
      more: false,
      reason: message,
    };
  }
}

/** Runs a job to completion, re-leasing between time slices. */
export async function runLeadImportJobToCompletion(
  admin: AnyClient,
  jobId: string,
  options: { budgetMs?: number; maxSlices?: number } = {},
): Promise<ImportTickResult> {
  const maxSlices = Math.min(Math.max(options.maxSlices ?? 200, 1), 2000);
  let last: ImportTickResult = {
    jobId,
    status: "processing",
    processedRows: 0,
    importedRows: 0,
    more: true,
  };
  for (let slice = 0; slice < maxSlices; slice += 1) {
    last = await processLeadImportJob(admin, jobId, { budgetMs: options.budgetMs ?? 20_000 });
    if (!last.more) return last;
  }
  return last;
}

/**
 * Picks up jobs nobody is working on — a worker that died mid-file, or a job
 * created while the runtime was busy — and continues them.
 */
export async function runLeadImportQueue(
  admin: AnyClient,
  limit = 5,
): Promise<{ picked: number; results: ImportTickResult[] }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("lead_import_jobs")
    .select("id")
    .in("status", ["uploaded", "processing"])
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 25));
  if (error) throw new Error(error.message);

  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const results: ImportTickResult[] = [];
  for (const id of ids) {
    results.push(await runLeadImportJobToCompletion(admin, id, { budgetMs: 20_000 }));
  }
  return { picked: ids.length, results };
}
