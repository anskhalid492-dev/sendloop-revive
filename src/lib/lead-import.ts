/**
 * Shared vocabulary for the background CSV lead import.
 *
 * Everything in here is pure and runs in both the browser (mapping preview,
 * progress labels) and the worker (chunked parsing, validation), so the rules a
 * customer sees in the wizard are exactly the rules the importer applies.
 *
 * The validation, duplicate handling and field mapping rules mirror the
 * long-standing synchronous importer on purpose: the architecture changed, the
 * lead rules did not.
 */
import { z } from "zod";

import { MAX_WEBSITE_LENGTH, validateWebsite } from "@/lib/lead-model";

/* -------------------------------------------------------------- mapping ids */

export const MAP_IGNORE = "__ignore__";
export const MAP_SPLIT_NAME = "__split_name__";
export const MAP_FIRST_ONLY = "__first_only__";
export const MAP_CUSTOM = "__custom__";

/* --------------------------------------------------------------- job status */

export const LEAD_IMPORT_STATUSES = [
  "uploading",
  "uploaded",
  "processing",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
] as const;

export type LeadImportStatus = (typeof LEAD_IMPORT_STATUSES)[number];

export const LEAD_IMPORT_STATUS_LABELS: Record<LeadImportStatus, string> = {
  uploading: "Uploading",
  uploaded: "Uploaded",
  processing: "Processing",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const LEAD_IMPORT_ACTIVE_STATUSES: LeadImportStatus[] = [
  "uploading",
  "uploaded",
  "processing",
];

export function isLeadImportActive(status: string): boolean {
  return (LEAD_IMPORT_ACTIVE_STATUSES as string[]).includes(status);
}

export type LeadImportJob = {
  id: string;
  workspace_id: string;
  file_name: string | null;
  file_size: number;
  status: LeadImportStatus;
  list_id: string | null;
  total_rows: number | null;
  processed_rows: number;
  imported_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  failed_rows: number;
  byte_offset: number;
  error_message: string | null;
  errors: ImportRowIssue[] | null;
  created_at: string;
  finished_at: string | null;
};

export type ImportRowIssue = { row: number; field: string; reason: string; email: string };

/** Percentage of the file processed. Byte based, so it works before the row count is known. */
export function importProgressPercent(job: {
  status: string;
  byte_offset: number;
  file_size: number;
}): number {
  if (!isLeadImportActive(job.status)) return 100;
  if (!job.file_size) return 0;
  return Math.max(0, Math.min(99, Math.round((job.byte_offset / job.file_size) * 100)));
}

/** "Importing 43,250 / 100,000 leads" when the total is known, a count otherwise. */
export function importProgressLabel(job: {
  status: string;
  processed_rows: number;
  total_rows: number | null;
}): string {
  const processed = job.processed_rows.toLocaleString();
  if (!isLeadImportActive(job.status)) return `${processed} rows processed`;
  if (job.total_rows && job.total_rows > 0) {
    return `Importing ${processed} / ${job.total_rows.toLocaleString()} leads`;
  }
  return `Importing ${processed} leads`;
}

/* ------------------------------------------------------------- csv parsing */

/** Bytes pulled from R2 per chunk. Small enough that a chunk never fills memory. */
export const IMPORT_CHUNK_BYTES = 2 * 1024 * 1024;
/** Rows per database insert. One request per row would be catastrophic at 500k. */
export const IMPORT_INSERT_BATCH = 500;
/** Sample rows kept on the job so the customer can see what went wrong. */
export const IMPORT_ERROR_SAMPLE = 50;

/**
 * Splits a text buffer into complete CSV rows, quote aware.
 *
 * Only rows terminated inside the buffer are returned; the trailing partial row
 * stays unconsumed so the next chunk can pick it up from the exact byte offset.
 */
export function parseCsvChunk(text: string): { rows: string[][]; consumed: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let consumedChars = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      field = "";
      // Blank lines are skipped, matching the previous importer.
      if (row.length > 1 || (row[0] ?? "").trim() !== "") rows.push(row);
      row = [];
      consumedChars = i + 1;
      continue;
    }
    field += ch;
  }

  return { rows, consumed: utf8Length(text.slice(0, consumedChars)) };
}

const encoder = new TextEncoder();

export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength;
}

/** Header row of a CSV buffer, or null when there is no readable header. */
export function parseCsvHeader(text: string): string[] | null {
  const first = parseCsvFirstRow(text);
  if (!first) return null;
  const trimmed = first.values.map((h) => h.trim());
  return trimmed.some((h) => h.length > 0) ? trimmed : null;
}

/**
 * First complete row of a buffer plus the bytes it occupies, so the worker can
 * skip exactly past the header before it starts importing.
 */
export function parseCsvFirstRow(text: string): { values: string[]; consumed: number } | null {
  let end = -1;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
      continue;
    }
    if (ch === "\n" && !quoted) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const line = text.slice(0, end + 1);
  const { rows } = parseCsvChunk(line);
  const values = rows[0];
  if (!values) return null;
  return { values, consumed: utf8Length(line) };
}

/* ------------------------------------------------------- mapping + validation */

const recordSchema = z.object({
  email: z.string().trim().email(),
  first_name: z.string().trim().max(120).optional(),
  last_name: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  job_title: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(60).optional(),
  website: z.string().trim().max(MAX_WEBSITE_LENGTH).optional(),
  linkedin_url: z.string().trim().max(MAX_WEBSITE_LENGTH).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  custom_fields: z.record(z.string(), z.string()).optional(),
});

export const IMPORT_FIELD_LABELS: Record<string, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  job_title: "Job title",
  phone: "Phone",
  website: "Website",
  linkedin_url: "LinkedIn",
  city: "City",
  state: "State",
  country: "Country",
  custom_fields: "Custom fields",
};

export type MappedLeadRow =
  | { ok: true; email: string; record: Record<string, unknown> }
  | { ok: false; issue: ImportRowIssue };

/**
 * Applies the customer's column mapping to one raw CSV row and validates it.
 * A bad cell only ever drops its own row.
 */
export function mapCsvRow(options: {
  headers: string[];
  values: string[];
  mapping: Record<string, string>;
  rowNumber: number;
}): MappedLeadRow {
  const { headers, values, mapping, rowNumber } = options;

  const cells: Record<string, string> = {};
  headers.forEach((header, index) => {
    cells[header] = (values[index] ?? "").trim();
  });

  const emailHeader = Object.keys(mapping).find((h) => mapping[h] === "email");
  const email = (emailHeader ? (cells[emailHeader] ?? "") : "").toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      issue: {
        row: rowNumber,
        field: "Email",
        reason: email ? "Email address is not valid" : "Email address is missing",
        email: email || "(blank)",
      },
    };
  }

  const record: Record<string, unknown> = { email };
  const custom: Record<string, string> = {};
  let derivedFirst = "";
  let derivedLast = "";

  for (const [header, field] of Object.entries(mapping)) {
    const value = cells[header] ?? "";
    if (!value || field === MAP_IGNORE || field === "email") continue;
    if (field === MAP_CUSTOM) {
      custom[header] = value.slice(0, 200);
    } else if (field === MAP_SPLIT_NAME) {
      const parts = value.split(/\s+/);
      derivedFirst = parts[0] ?? "";
      derivedLast = parts.slice(1).join(" ");
    } else if (field === MAP_FIRST_ONLY) {
      derivedFirst = value;
    } else {
      record[field] = value;
    }
  }

  // Explicit first/last mappings always win over a split full-name column.
  if (!record["first_name"] && derivedFirst) record["first_name"] = derivedFirst;
  if (!record["last_name"] && derivedLast) record["last_name"] = derivedLast;
  if (Object.keys(custom).length) record["custom_fields"] = custom;

  const site = validateWebsite(record["website"]);
  if (!site.ok) {
    return { ok: false, issue: { row: rowNumber, field: "Website", reason: site.reason, email } };
  }
  if (site.value) record["website"] = site.value;
  else delete record["website"];

  const parsed = recordSchema.safeParse(record);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = String(issue?.path?.[0] ?? "row");
    return {
      ok: false,
      issue: {
        row: rowNumber,
        field: IMPORT_FIELD_LABELS[key] ?? key,
        reason: issue?.message ?? "Invalid value",
        email,
      },
    };
  }

  return { ok: true, email, record: parsed.data as Record<string, unknown> };
}

/** Database row for a validated lead. */
export function leadInsertRow(options: {
  record: Record<string, unknown>;
  workspaceId: string;
  listId: string | null;
  tags: string[];
}): Record<string, unknown> {
  const r = options.record;
  const text = (key: string) => (r[key] ? (r[key] as string) : null);
  return {
    workspace_id: options.workspaceId,
    list_id: options.listId,
    email: (r["email"] as string).toLowerCase(),
    first_name: text("first_name"),
    last_name: text("last_name"),
    company: text("company"),
    job_title: text("job_title"),
    phone: text("phone"),
    website: text("website"),
    linkedin_url: text("linkedin_url"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    tags: options.tags,
    custom_fields: (r["custom_fields"] as Record<string, string> | undefined) ?? {},
  };
}
