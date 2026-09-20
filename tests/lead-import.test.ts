import { describe, expect, it } from "vitest";

import {
  IMPORT_CHUNK_BYTES,
  MAP_CUSTOM,
  MAP_FIRST_ONLY,
  MAP_IGNORE,
  MAP_SPLIT_NAME,
  importProgressLabel,
  importProgressPercent,
  isLeadImportActive,
  leadInsertRow,
  mapCsvRow,
  parseCsvChunk,
  parseCsvHeader,
  utf8Length,
  type LeadImportJob,
} from "@/lib/lead-import";

const job = (over: Partial<LeadImportJob>): LeadImportJob =>
  ({
    id: "job",
    workspace_id: "ws",
    file_name: "leads.csv",
    file_size: 1000,
    status: "processing",
    total_rows: null,
    processed_rows: 0,
    imported_rows: 0,
    skipped_rows: 0,
    duplicate_rows: 0,
    invalid_rows: 0,
    failed_rows: 0,
    byte_offset: 0,
    errors: [],
    error_message: null,
    finished_at: null,
    created_at: new Date().toISOString(),
    ...over,
  }) as LeadImportJob;

describe("csv chunk parsing", () => {
  it("leaves a partial trailing row unconsumed so the next chunk resumes cleanly", () => {
    const chunk = "a@x.com,Ann\nb@x.com,Bo\nc@x.com,Par";
    const result = parseCsvChunk(chunk, false);
    expect(result.rows).toHaveLength(2);
    expect(result.consumedBytes).toBe(utf8Length("a@x.com,Ann\nb@x.com,Bo\n"));
  });

  it("consumes the final row when the file has ended", () => {
    const chunk = "a@x.com,Ann\nb@x.com,Bo";
    const result = parseCsvChunk(chunk, true);
    expect(result.rows).toHaveLength(2);
    expect(result.consumedBytes).toBe(utf8Length(chunk));
  });

  it("keeps quoted commas and newlines inside one field", () => {
    const chunk = '"Smith, Ann","line1\nline2"\n';
    const result = parseCsvChunk(chunk, true);
    expect(result.rows[0]).toEqual(["Smith, Ann", "line1\nline2"]);
  });

  it("reads the header row and reports its byte length", () => {
    const header = parseCsvHeader("email,first name,company\nrow\n");
    expect(header?.headers).toEqual(["email", "first name", "company"]);
    expect(header?.consumedBytes).toBe(utf8Length("email,first name,company\n"));
  });

  it("uses a chunk size that never loads the whole file", () => {
    expect(IMPORT_CHUNK_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});

describe("row mapping", () => {
  const headers = ["Email", "Name", "Website", "Notes"];
  const mapping = {
    Email: "email",
    Name: MAP_SPLIT_NAME,
    Website: "website",
    Notes: MAP_IGNORE,
  };

  it("maps a valid row and normalises the email", () => {
    const result = mapCsvRow(["  ANN@X.com ", "Ann Smith", "example.com", "ignored"], headers, mapping);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.email).toBe("ann@x.com");
    expect(result.lead.first_name).toBe("Ann");
    expect(result.lead.last_name).toBe("Smith");
    expect(result.lead.website).toBeTruthy();
  });

  it("rejects a missing or malformed email", () => {
    expect(mapCsvRow(["", "Ann", "", ""], headers, mapping).ok).toBe(false);
    expect(mapCsvRow(["nope", "Ann", "", ""], headers, mapping).ok).toBe(false);
  });

  it("rejects an invalid website rather than silently dropping it", () => {
    const result = mapCsvRow(["a@x.com", "Ann", "javascript:alert(1)", ""], headers, mapping);
    expect(result.ok).toBe(false);
  });

  it("takes only the first word for first-name-only mapping", () => {
    const result = mapCsvRow(["a@x.com", "Ann Smith"], ["Email", "Name"], {
      Email: "email",
      Name: MAP_FIRST_ONLY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.first_name).toBe("Ann Smith");
    expect(result.lead.last_name).toBeUndefined();
  });

  it("stores custom columns as custom fields", () => {
    const result = mapCsvRow(["a@x.com", "gold"], ["Email", "Tier"], {
      Email: "email",
      Tier: MAP_CUSTOM,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.custom?.["Tier"]).toBe("gold");
  });

  it("always scopes the inserted row to the importing workspace", () => {
    const row = leadInsertRow({ email: "a@x.com" }, {
      workspaceId: "ws-1",
      listId: null,
      tags: ["q1"],
    });
    expect(row["workspace_id"]).toBe("ws-1");
    expect(row["email"]).toBe("a@x.com");
    expect(row["tags"]).toEqual(["q1"]);
  });
});

describe("progress reporting", () => {
  it("counts only uploading, uploaded and processing as active", () => {
    expect(isLeadImportActive("processing")).toBe(true);
    expect(isLeadImportActive("uploaded")).toBe(true);
    expect(isLeadImportActive("completed")).toBe(false);
    expect(isLeadImportActive("failed")).toBe(false);
    expect(isLeadImportActive("cancelled")).toBe(false);
  });

  it("falls back to bytes read before the row count is known", () => {
    expect(importProgressPercent(job({ byte_offset: 500, file_size: 1000 }))).toBe(50);
  });

  it("uses rows once a total is known", () => {
    const label = importProgressLabel(
      job({ total_rows: 100000, processed_rows: 43250, byte_offset: 10 }),
    );
    expect(label).toContain("43,250");
    expect(label).toContain("100,000");
  });

  it("reports a completed job as finished", () => {
    expect(importProgressPercent(job({ status: "completed", byte_offset: 10 }))).toBe(100);
  });
});
