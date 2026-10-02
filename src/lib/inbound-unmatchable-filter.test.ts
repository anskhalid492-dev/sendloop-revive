import { describe, expect, it } from "vitest";
import { isUnfiltered, needsLeadJoin } from "./campaign-leads-page";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { vi } from "vitest";
const { unmatchableExclusionFilter } = await import("./inbound-ops.server");

describe("unmatchableExclusionFilter", () => {
  it("keeps recent unmatched sends and drops aged-out ones", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    const f = unmatchableExclusionFilter(now);
    expect(f).toContain("failure_code.is.null");
    expect(f).toContain("created_at.gte.2026-09-25T12:00:00.000Z");
    expect(f).toContain("failure_code.eq.unknown_mailbox,created_at.gte.2026-09-30T12:00:00.000Z");
  });
});

describe("campaign lead page helpers", () => {
  it("only joins leads for lead-column filters", () => {
    expect(needsLeadJoin({})).toBe(false);
    expect(needsLeadJoin({ status: "pending" })).toBe(false);
    expect(needsLeadJoin({ search: "a" })).toBe(true);
    expect(needsLeadJoin({ mailboxType: "google" })).toBe(true);
  });
  it("detects the unfiltered audience", () => {
    expect(isUnfiltered({}, false)).toBe(true);
    expect(isUnfiltered({ step: 0 }, false)).toBe(false);
    expect(isUnfiltered({}, true)).toBe(false);
  });
});
