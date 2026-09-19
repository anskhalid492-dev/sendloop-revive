import { describe, expect, it } from "vitest";

import {
  detectMailHost,
  dkimSelectorsFor,
  evaluateDkim,
  evaluateDmarc,
  evaluateSpf,
  isFreeMailboxDomain,
  mailboxDomainOf,
  overallAuthVerdict,
} from "@/lib/mailbox-auth-check";
import { mailboxAuthGuide } from "@/lib/mailbox-auth-guides";
import {
  effectiveDailyLimit,
  effectiveWarmupCeiling,
  providerSendingLimit,
} from "@/lib/mailbox-provider-limits";
import { mailboxHealth } from "@/lib/mailbox-health";

describe("mailbox domain extraction", () => {
  it("takes the domain from the address", () => {
    expect(mailboxDomainOf("Sales@TheirDomain.com")).toBe("theirdomain.com");
    expect(mailboxDomainOf("not-an-address")).toBeNull();
    expect(mailboxDomainOf(null)).toBeNull();
  });

  it("knows free mailbox domains", () => {
    expect(isFreeMailboxDomain("gmail.com")).toBe(true);
    expect(isFreeMailboxDomain("theirdomain.com")).toBe(false);
  });
});

describe("mail host detection", () => {
  it("detects hosts from MX records", () => {
    expect(detectMailHost("x.com", ["aspmx.l.google.com"])).toBe("google_workspace");
    expect(detectMailHost("x.com", ["x-com.mail.protection.outlook.com"])).toBe("microsoft365");
    expect(detectMailHost("x.com", ["mx1.hostinger.com"])).toBe("hostinger");
    expect(detectMailHost("x.com", ["mx.zoho.com"])).toBe("zoho");
    expect(detectMailHost("x.com", ["mail.theirserver.io"])).toBe("custom");
    expect(detectMailHost("x.com", [])).toBe("unknown");
  });

  it("treats a free mailbox as a free mailbox whatever its MX says", () => {
    expect(detectMailHost("gmail.com", ["aspmx.l.google.com"])).toBe("free_mailbox");
  });

  it("probes host-specific selectors first, then common ones", () => {
    const selectors = dkimSelectorsFor("microsoft365");
    expect(selectors[0]).toBe("selector1");
    expect(selectors).toContain("default");
    expect(new Set(selectors).size).toBe(selectors.length);
  });
});

describe("SPF evaluation", () => {
  it("passes a single valid record", () => {
    expect(evaluateSpf(["v=spf1 include:_spf.google.com ~all"]).state).toBe("pass");
  });

  it("fails when missing", () => {
    expect(evaluateSpf(["some-other-txt"]).state).toBe("fail");
  });

  it("fails on duplicates", () => {
    const result = evaluateSpf(["v=spf1 include:a ~all", "v=spf1 include:b ~all"]);
    expect(result.state).toBe("fail");
    expect(result.summary).toContain("2 SPF records");
  });

  it("warns over the ten-lookup limit", () => {
    const record = `v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:h${i}.example`).join(" ")} ~all`;
    expect(evaluateSpf([record]).state).toBe("warn");
  });

  it("reports a failed lookup as unchecked, never as missing", () => {
    expect(evaluateSpf(null).state).toBe("unchecked");
  });
});

describe("DKIM evaluation", () => {
  it("passes a key record", () => {
    const result = evaluateDkim({ selector: "google", value: "v=DKIM1; k=rsa; p=MIGf" }, true);
    expect(result.state).toBe("pass");
    expect(result.selector).toBe("google");
  });

  it("passes a CNAME delegation", () => {
    expect(
      evaluateDkim({ selector: "selector1", value: "selector1-x._domainkey.x.onmicrosoft.com" }, true)
        .state,
    ).toBe("pass");
  });

  it("fails an empty key", () => {
    expect(evaluateDkim({ selector: "default", value: "v=DKIM1; p=" }, true).state).toBe("fail");
  });

  it("warns rather than fails when no selector is detectable", () => {
    expect(evaluateDkim(null, true).state).toBe("warn");
  });

  it("is unchecked when lookups did not complete", () => {
    expect(evaluateDkim(null, false).state).toBe("unchecked");
  });
});

describe("DMARC evaluation", () => {
  it("passes with a policy", () => {
    const result = evaluateDmarc(["v=DMARC1; p=none; rua=mailto:x@y.com"]);
    expect(result.state).toBe("pass");
    expect(result.policy).toBe("none");
  });

  it("warns on duplicate records", () => {
    const result = evaluateDmarc(["v=DMARC1; p=none", "v=DMARC1; p=reject"]);
    expect(result.state).toBe("warn");
    expect(result.summary).toContain("2 DMARC records");
  });

  it("warns when missing", () => {
    expect(evaluateDmarc([]).state).toBe("warn");
  });
});

describe("overall verdict", () => {
  const pass = { state: "pass" as const, summary: "ok", observed: null };
  const warn = { state: "warn" as const, summary: "needs work", observed: null };
  const fail = { state: "fail" as const, summary: "broken", observed: null };
  const unchecked = { state: "unchecked" as const, summary: "unknown", observed: null };

  it("passes when all three pass", () => {
    const result = overallAuthVerdict({ freeMailbox: false, spf: pass, dkim: pass, dmarc: pass });
    expect(result.overall).toBe("pass");
    expect(result.canSend).toBe(true);
  });

  it("blocks sending on a hard failure", () => {
    const result = overallAuthVerdict({ freeMailbox: false, spf: fail, dkim: pass, dmarc: pass });
    expect(result.overall).toBe("fail");
    expect(result.canSend).toBe(false);
  });

  it("warns without blocking", () => {
    const result = overallAuthVerdict({ freeMailbox: false, spf: pass, dkim: warn, dmarc: warn });
    expect(result.overall).toBe("warn");
    expect(result.canSend).toBe(true);
  });

  it("never blocks because a lookup failed", () => {
    const result = overallAuthVerdict({
      freeMailbox: false,
      spf: unchecked,
      dkim: unchecked,
      dmarc: unchecked,
    });
    expect(result.overall).toBe("unchecked");
    expect(result.canSend).toBe(true);
  });

  it("blocks a free personal mailbox", () => {
    const result = overallAuthVerdict({ freeMailbox: true, spf: pass, dkim: pass, dmarc: pass });
    expect(result.overall).toBe("fail");
    expect(result.canSend).toBe(false);
  });
});

describe("provider sending ceilings", () => {
  it("only ever lowers the customer's own limit", () => {
    expect(effectiveDailyLimit(500, "hostinger")).toBe(
      providerSendingLimit("hostinger").dailyCeiling,
    );
    expect(effectiveDailyLimit(10, "google_workspace")).toBe(10);
    expect(effectiveDailyLimit(500, null)).toBe(500);
  });

  it("caps warm-up below the daily ceiling", () => {
    const limit = providerSendingLimit("google_workspace");
    expect(limit.warmupCeiling).toBeLessThan(limit.dailyCeiling);
    expect(effectiveWarmupCeiling(200, "google_workspace")).toBe(limit.warmupCeiling);
    expect(effectiveWarmupCeiling(5, "google_workspace")).toBe(5);
  });
});

describe("mailbox health indicator", () => {
  it("is red for a failing domain", () => {
    expect(mailboxHealth({ status: "connected", authStatus: "fail" }).colour).toBe("red");
  });

  it("is yellow for a warning and for an unchecked domain", () => {
    expect(mailboxHealth({ status: "connected", authStatus: "warn" }).colour).toBe("yellow");
    expect(mailboxHealth({ status: "connected", authStatus: null }).colour).toBe("yellow");
  });

  it("is green when connected, active and passing", () => {
    expect(
      mailboxHealth({ status: "connected", isActive: true, authStatus: "pass" }).colour,
    ).toBe("green");
  });

  it("is red when the mailbox is not connected", () => {
    expect(mailboxHealth({ status: "pending", authStatus: "pass" }).colour).toBe("red");
  });
});

describe("fix instructions", () => {
  it("gives host-specific steps for every host", () => {
    for (const host of [
      "google_workspace",
      "microsoft365",
      "hostinger",
      "godaddy",
      "zoho",
      "titan",
      "custom",
      "unknown",
      "free_mailbox",
    ] as const) {
      const guide = mailboxAuthGuide(host);
      expect(guide.steps.length).toBeGreaterThan(1);
      expect(guide.note.length).toBeGreaterThan(10);
    }
  });
});
