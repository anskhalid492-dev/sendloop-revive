import { describe, expect, it } from "vitest";

import { looksLikeAutomatedReport } from "@/lib/mailbox-inbound-classify";

describe("automated report detection", () => {
  it("recognises DMARC aggregate reports by recipient", () => {
    expect(
      looksLikeAutomatedReport({
        from: "noreply-dmarc-support@google.com",
        to: "dmarc@packologypro.online",
        subject: "Report domain: packologypro.online Submitter: google.com",
      }),
    ).toBe(true);
  });

  it("recognises report senders and preview subjects", () => {
    expect(
      looksLikeAutomatedReport({
        from: "dmarcreport@microsoft.com",
        to: "someone@example.com",
        subject: "[Preview] Report Domain: packologypro.shop Submitter: enterprise",
      }),
    ).toBe(true);
  });

  it("recognises auto-submitted machine mail from headers", () => {
    expect(
      looksLikeAutomatedReport({
        from: "robot@example.com",
        to: "michael@example.com",
        subject: "Status",
        headers: { "Auto-Submitted": "auto-generated" },
      }),
    ).toBe(true);
  });

  it("leaves a genuine prospect reply alone", () => {
    expect(
      looksLikeAutomatedReport({
        from: "prospect@acme.com",
        to: "michael@meetsmartoutreach.agency",
        subject: "Re: quick question about your packaging",
        headers: { "Auto-Submitted": "no" },
      }),
    ).toBe(false);
  });
});
