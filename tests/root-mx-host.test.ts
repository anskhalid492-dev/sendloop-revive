import { describe, expect, it } from "vitest";
import {
  ROOT_DOMAIN_RECEIVING,
  ROOT_MX_INSTRUCTION,
  buildRootInboundMxRecord,
  inboundMxHost,
  isRootInboundMxRecord,
  normalizeDomain,
  rootMxCompatibility,
} from "@/lib/email-providers/mx-host";
import { compareMxRecords, requiredMxFromRecords } from "@/lib/email-providers/inbound";
import type { ProviderDnsRecord } from "@/lib/domain-providers/types";

const DOMAIN = "smartoutreach.agency";

describe("root-domain MX host", () => {
  it("1. root domain MX host is @ and the FQDN is the root domain", () => {
    const record = buildRootInboundMxRecord({
      domain: DOMAIN,
      target: "inbound-smtp.us-east-1.amazonaws.com",
      priority: 4,
    });
    expect(record.host).toBe("@");
    expect(record.fqdn).toBe(DOMAIN);
    expect(record.value).toBe("inbound-smtp.us-east-1.amazonaws.com");
    expect(record.priority).toBe(4);
  });

  it("2. an existing send.<domain> CNAME does not cause an MX conflict", () => {
    expect(rootMxCompatibility({ domain: DOMAIN, cnameHosts: [`send.${DOMAIN}`] })).toEqual({
      compatible: true,
      reason: ROOT_MX_INSTRUCTION,
    });
    // and it is never mistaken for a root MX record
    expect(
      isRootInboundMxRecord(
        {
          type: "CNAME",
          host: "send",
          fqdn: `send.${DOMAIN}`,
        } as ProviderDnsRecord,
        DOMAIN,
      ),
    ).toBe(false);
  });

  it("3. an existing correct root MX is detected", () => {
    const required = requiredMxFromRecords([
      buildRootInboundMxRecord({ domain: DOMAIN, target: "inbound.provider.example", priority: 10 }),
    ]);
    const result = compareMxRecords({
      current: [{ host: "inbound.provider.example", priority: 10 }],
      required,
    });
    expect(result.state).toBe("correct");
  });

  it("4. a CNAME on the root name is reported as incompatible with MX", () => {
    const result = rootMxCompatibility({ domain: DOMAIN, cnameHosts: [DOMAIN] });
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("CNAME");
    expect(result.reason).toContain("MX");
  });

  it("5. multiple existing MX records are compared, not overwritten", () => {
    const required = [{ host: "inbound.provider.example", priority: 10 }];
    const result = compareMxRecords({
      current: [
        { host: "inbound.provider.example", priority: 10 },
        { host: "mx2.hostinger.com", priority: 20 },
      ],
      required,
    });
    expect(result.state).toBe("mixed");
    expect(result.foreign).toEqual(["mx2.hostinger.com"]);
  });

  const dnsHosts: Array<[string, string]> = [
    ["6. Cloudflare-style DNS", "@"],
    ["7. Hostinger-style DNS", "@"],
    ["8. GoDaddy-style DNS", "@"],
    ["9. Porkbun-style DNS", "@"],
  ];

  it.each(dnsHosts)("%s uses the same root host %s", (_label, host) => {
    // DNS-provider independent: MunchReach shows one record, no provider rules.
    const record = buildRootInboundMxRecord({ domain: DOMAIN, target: "inbound.provider.example" });
    expect(record.host).toBe(host);
    expect(record.fqdn).toBe(DOMAIN);
  });

  it("10. the MX target still comes from the EmailProvider adapter", () => {
    const fromProvider = buildRootInboundMxRecord({
      domain: DOMAIN,
      target: "10 feedback-smtp.eu-west-1.amazonses.com.",
      ttl: 900,
    });
    expect(fromProvider.value).toBe("feedback-smtp.eu-west-1.amazonses.com");
    expect(fromProvider.priority).toBe(10);
    expect(fromProvider.ttl).toBe(900);
  });

  it("11. the MX host is always @ for root-domain mode, whatever the provider names it", () => {
    expect(inboundMxHost(ROOT_DOMAIN_RECEIVING)).toBe("@");
    for (const label of ["send", "mail", "smtp", "inbound"]) {
      const record = buildRootInboundMxRecord({
        domain: `https://${DOMAIN}/`,
        target: `${label}.provider.example`,
      });
      expect(record.host).toBe("@");
      expect(record.fqdn).toBe(DOMAIN);
    }
    expect(normalizeDomain(" .SmartOutreach.Agency. ")).toBe(DOMAIN);
  });
});
