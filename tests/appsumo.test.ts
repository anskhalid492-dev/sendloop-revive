import { describe, expect, it } from "vitest";

import { GENERIC_CODE_ERROR, normalizeCode, publicMessageFor, toAppSumoCsv } from "@/lib/appsumo.server";
import { LIFETIME_PRICE_CENTS } from "@/lib/billing/lifetime";

describe("AppSumo codes", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeCode("  mrapp ab12 \n")).toBe("MRAPPAB12");
  });
  it("hides detailed failure reasons behind one generic message", () => {
    for (const r of ["not_found", "already_redeemed", "revoked", "bad_format"]) {
      expect(publicMessageFor(r)).toBe(GENERIC_CODE_ERROR);
    }
  });
  it("exports one code per row with no header or blank rows", () => {
    expect(toAppSumoCsv(["MRAPPA", "", " MRAPPB ", "MRAPPC"])).toBe("MRAPPA\nMRAPPB\nMRAPPC");
  });
  it("prices lifetime at $99", () => {
    expect(LIFETIME_PRICE_CENTS).toBe(9900);
  });
});
