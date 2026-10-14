import { describe, expect, it } from "vitest";
import { leadLinkedInHref, leadProvider } from "@/lib/lead-presentation";
import { leadInsertRow, mapCsvRow } from "@/lib/lead-import";

describe("lead provider presentation", () => {
  it("labels existing Gmail leads Google Workspace, including case and whitespace", () => {
    expect(leadProvider("  Existing@GMAIL.COM ")).toEqual({ type: "google", label: "Google Workspace" });
  });
  it("labels identifiable Microsoft addresses Microsoft 365", () => {
    for (const domain of ["outlook.com", "hotmail.com", "live.com", "msn.com"]) {
      expect(leadProvider(`throwaway@${domain}`)).toEqual({ type: "outlook", label: "Microsoft 365" });
    }
  });
  it("keeps unknown and custom-domain IMAP/SMTP addresses Other without hosting guesses", () => {
    for (const email of ["throwaway@example.com", "throwaway@imap.example.com", "throwaway@smtp.example.com", "invalid", null]) {
      expect(leadProvider(email)).toEqual({ type: "other", label: "Other" });
    }
  });
  it("classifies newly mapped CSV rows without changing imported fields or profile URLs", () => {
    for (const [email, label] of [["imported@gmail.com", "Google Workspace"], ["imported@outlook.com", "Microsoft 365"], ["imported@example.com", "Other"]]) {
      const profile = "https://www.linkedin.com/in/throwaway-leads-ui-test/";
      const mapped = mapCsvRow({ headers: ["Email", "LinkedIn"], values: [email, profile], mapping: { Email: "email", LinkedIn: "linkedin_url" }, rowNumber: 1 });
      expect(mapped.ok).toBe(true);
      if (!mapped.ok) throw new Error("Fake CSV fixture failed mapping");
      const row = leadInsertRow({ record: mapped.record, workspaceId: "throwaway-leads-ui-test", listId: null, tags: [] });
      const before = structuredClone(row);
      expect(leadProvider(String(row.email)).label).toBe(label);
      expect(leadLinkedInHref(String(row.linkedin_url))).toBe(profile);
      expect(row).toEqual(before);
      expect(row).not.toHaveProperty("provider");
    }
  });
});

describe("stored LinkedIn profiles", () => {
  it("preserves an existing complete profile URL exactly", () => {
    const profile = "https://www.linkedin.com/in/throwaway-leads-ui-test/?source=csv";
    expect(leadLinkedInHref(profile)).toBe(profile);
  });
  it("only adds a scheme to an existing bare LinkedIn URL", () => {
    expect(leadLinkedInHref("linkedin.com/in/throwaway-leads-ui-test")).toBe("https://linkedin.com/in/throwaway-leads-ui-test");
  });
  it("does not invent profiles for missing values", () => {
    for (const value of [null, undefined, "", "   "]) expect(leadLinkedInHref(value)).toBeNull();
  });
  it("does not link unsafe or non-LinkedIn values", () => {
    for (const value of ["javascript:alert(1)", "https://linkedin.com.evil.example/in/test", "https://example.com", "Ada Lovelace"]) expect(leadLinkedInHref(value)).toBeNull();
  });
});