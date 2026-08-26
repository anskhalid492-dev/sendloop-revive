import { describe, expect, it } from "vitest";
import {
  dedupeDnsRequirements,
  dnsRequirementKey,
} from "@/lib/email-providers/dns-requirements";
import {
  buildRootInboundMxRecord,
  isRootInboundMxRecord,
} from "@/lib/email-providers/mx-host";
import { compareMxRecords, requiredMxFromRecords } from "@/lib/email-providers/inbound";
import { mxPillarState } from "@/lib/domain-readiness-view";
import { dnsRecordPurpose } from "@/lib/dns-record-purpose";
import type { ProviderDnsRecord } from "@/lib/domain-providers/types";

const DOMAIN = "smartoutreach.digital";

const inboundMx = buildRootInboundMxRecord({
  domain: DOMAIN,
  target: "inbound-smtp.us-east-1.amazonaws.com",
  priority: 4,
});

const feedbackMx: ProviderDnsRecord = {
  id: "feedback:send.smartoutreach.digital:MX",
  kind: "feedback",
  type: "MX",
  host: "send",
  fqdn: `send.${DOMAIN}`,
  value: "feedback-smtp.us-east-1.amazonses.com",
  ttl: 3600,
  priority: 10,
  required: true,
  purpose: "Handles bounce and complaint feedback for your sending subdomain.",
};

describe("Phase 6.1 — DNS requirement generation", () => {
  it("1. root inbound MX uses @", () => {
    expect(inboundMx.host).toBe("@");
    expect(inboundMx.fqdn).toBe(DOMAIN);
  });

  it("2. sending/feedback MX keeps its provider-defined sending hostname", () => {
    expect(feedbackMx.host).toBe("send");
    expect(feedbackMx.fqdn).toBe(`send.${DOMAIN}`);
  });

  it("3. receiving and sending MX are not merged", () => {
    const records = dedupeDnsRequirements([inboundMx, feedbackMx]);
    expect(records).toHaveLength(2);
    expect(records.filter((r) => isRootInboundMxRecord(r, DOMAIN))).toEqual([inboundMx]);
    expect(dnsRecordPurpose(feedbackMx)).toBe("return_path");
    expect(dnsRecordPurpose(inboundMx)).toBe("inbound_mx");
  });

  it("4. duplicate MX records are removed", () => {
    const dupe = { ...inboundMx, id: "other-id" };
    expect(dedupeDnsRequirements([inboundMx, dupe, feedbackMx])).toHaveLength(2);
  });

  it("5. Hostinger root MX is a conflict", () => {
    const result = compareMxRecords({
      current: [
        { host: "mx1.hostinger.com", priority: 5 },
        { host: "mx2.hostinger.com", priority: 10 },
      ],
      required: requiredMxFromRecords([inboundMx]),
    });
    // Existing vocabulary: foreign root MX ownership is reported as third_party.
    expect(result.state).toBe("third_party");
    expect(mxPillarState(result.state)).toBe("failed");
  });

  it("6. Google Workspace root MX is a conflict", () => {
    const result = compareMxRecords({
      current: [{ host: "smtp.google.com", priority: 1 }],
      required: requiredMxFromRecords([inboundMx]),
    });
    expect(result.state).toBe("third_party");
    expect(mxPillarState(result.state)).toBe("failed");
  });

  it("7. a correct provider receiving MX is ready", () => {
    const result = compareMxRecords({
      current: [{ host: "inbound-smtp.us-east-1.amazonaws.com", priority: 4 }],
      required: requiredMxFromRecords([inboundMx]),
    });
    expect(result.state).toBe("correct");
  });

  it("8. a provider with no inbound records invents no inbound MX", () => {
    expect(requiredMxFromRecords([feedbackMx].filter((r) => isRootInboundMxRecord(r, DOMAIN)))).toEqual(
      [],
    );
  });

  it("9. subdomain-based receiving stays supported when a provider requires it", () => {
    const subdomainReceiving: ProviderDnsRecord = {
      ...feedbackMx,
      id: "mx:inbound.smartoutreach.digital:MX",
      kind: "mx",
      host: "inbound",
      fqdn: `inbound.${DOMAIN}`,
      value: "mx.otherprovider.example",
    };
    const kept = dedupeDnsRequirements([subdomainReceiving]);
    expect(kept[0]!.host).toBe("inbound");
    expect(isRootInboundMxRecord(subdomainReceiving, DOMAIN)).toBe(false);
  });

  it("10. future providers do not inherit provider-specific hostnames", () => {
    const other = buildRootInboundMxRecord({ domain: DOMAIN, target: "mx.futureprovider.example" });
    expect(other.value).toBe("mx.futureprovider.example");
    expect(other.value).not.toContain("amazonaws");
  });

  it("11. dedupe key is normalized type + host + target + priority", () => {
    const messy: ProviderDnsRecord = {
      ...inboundMx,
      host: "@",
      value: "INBOUND-SMTP.us-east-1.amazonaws.com.",
    };
    expect(dnsRequirementKey(messy)).toBe(dnsRequirementKey(inboundMx));
    expect(dnsRequirementKey(feedbackMx)).not.toBe(dnsRequirementKey(inboundMx));
  });

  it("12. the requirement layer is pure — it never mutates the input records", () => {
    const input = [inboundMx, { ...inboundMx }, feedbackMx];
    const snapshot = JSON.stringify(input);
    dedupeDnsRequirements(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
