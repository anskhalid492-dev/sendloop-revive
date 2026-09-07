import { describe, expect, it } from "vitest";

import {
  NOT_SUPPORTED_MESSAGE,
  buildTrackingConfig,
  reconcileTracking,
  sendingBlockedByTracking,
  sesTrackingTarget,
  trackingFingerprint,
  trackingStatusFromRecords,
  type TrackingConfig,
} from "@/lib/domain-tracking";
import { normalizedEventType } from "@/lib/email-providers/normalize";
import { buildDnsRecords } from "@/lib/dns.server";

const DOMAIN = "outreach.company.com";

function resend(records?: Parameters<typeof buildTrackingConfig>[0]["providerReportedRecords"]) {
  return buildTrackingConfig({
    domain: DOMAIN,
    providerType: "resend",
    providerId: "prov-resend",
    ...(records ? { providerReportedRecords: records } : {}),
  });
}

function ses(region: string | null, configurationSet: string | null = "munchreach-events") {
  return buildTrackingConfig({
    domain: DOMAIN,
    providerType: "ses",
    providerId: "prov-ses",
    region,
    configurationSet,
  });
}

describe("provider-aware tracking configuration", () => {
  it("1. shows the provider's own tracking record for a Resend domain", () => {
    const config = resend([
      {
        id: "tracking:track.outreach.company.com:CNAME",
        type: "CNAME",
        host: "track",
        fqdn: "track.outreach.company.com",
        value: "custom.tracking.provider.example",
        ttl: 3600,
        purpose: "Provider tracking record.",
      },
    ]);
    expect(config.providerType).toBe("resend");
    expect(config.records.map((r) => r.value)).toEqual(["custom.tracking.provider.example"]);
    expect(config.status).toBe("pending");
  });

  it("2. shows the SES tracking configuration for an SES domain", () => {
    const config = ses("us-east-1");
    expect(config.trackingType).toBe("custom_domain");
    expect(config.records).toHaveLength(1);
    expect(config.records[0]?.type).toBe("CNAME");
    expect(config.trackingHostname).toBe("track.outreach.company.com");
  });

  it("3. uses the us-east-1 redirect host for a us-east-1 account", () => {
    expect(ses("us-east-1").records[0]?.value).toBe("r.us-east-1.awstrack.me");
    expect(sesTrackingTarget("us-east-1")).toBe("r.us-east-1.awstrack.me");
  });

  it("4. uses the correct host for a different region", () => {
    const config = ses("eu-west-2");
    expect(config.providerRegion).toBe("eu-west-2");
    expect(config.records[0]?.value).toBe("r.eu-west-2.awstrack.me");
    expect(config.records[0]?.value).not.toBe(sesTrackingTarget("us-east-1"));
  });

  it("5. resets tracking to pending when the provider changes Resend -> SES", () => {
    const before = resend();
    const stored = {
      fingerprint: trackingFingerprint(before),
      status: "verified" as const,
      verified_at: "2026-01-01T00:00:00.000Z",
      records: before.records,
    };
    const { config, providerChanged } = reconcileTracking(ses("us-east-1"), stored);
    expect(providerChanged).toBe(true);
    expect(config.status).toBe("pending");
    expect(config.verifiedAt).toBeNull();
  });

  it("6. resets tracking when the provider changes SES -> Resend", () => {
    const before = ses("us-east-1");
    const verified: TrackingConfig = {
      ...before,
      records: before.records.map((r) => ({ ...r, status: "verified" as const })),
      status: "verified",
      verifiedAt: "2026-01-01T00:00:00.000Z",
    };
    const stored = {
      fingerprint: trackingFingerprint(before),
      status: verified.status,
      verified_at: verified.verifiedAt,
      records: verified.records,
    };
    const { config, providerChanged } = reconcileTracking(resend(), stored);
    expect(providerChanged).toBe(true);
    expect(config.providerType).toBe("resend");
    expect(config.records).toHaveLength(0);
  });

  it("7. never carries a previous verification onto a different region", () => {
    const east = ses("us-east-1");
    const stored = {
      fingerprint: trackingFingerprint(east),
      status: "verified" as const,
      verified_at: "2026-01-01T00:00:00.000Z",
      records: east.records.map((r) => ({ ...r, status: "verified" as const })),
    };
    const { config } = reconcileTracking(ses("eu-central-1"), stored);
    expect(config.status).toBe("pending");
    expect(config.records[0]?.status).toBe("pending");
  });

  it("8. reports providers without custom tracking instead of inventing records", () => {
    const config = buildTrackingConfig({ domain: DOMAIN, providerType: "smtp", providerId: null });
    expect(config.status).toBe("not_supported");
    expect(config.records).toHaveLength(0);
    expect(config.instructions).toContain(NOT_SUPPORTED_MESSAGE);
  });

  it("9. marks tracking verified once every required record resolves", () => {
    const config = ses("us-east-1");
    const checked = config.records.map((r) => ({ ...r, status: "verified" as const }));
    expect(trackingStatusFromRecords(config, checked)).toBe("verified");
  });

  it("10. stays pending when DNS verification fails", () => {
    const config = ses("us-east-1");
    const checked = config.records.map((r) => ({ ...r, status: "failed" as const }));
    expect(trackingStatusFromRecords(config, checked)).toBe("pending");
  });

  it("11. never blocks sending while tracking is pending", () => {
    expect(sendingBlockedByTracking()).toBe(false);
  });

  it("12. maps provider open and click events into the common event model", () => {
    expect(normalizedEventType("email.opened")).toBe("OPENED");
    expect(normalizedEventType("email.clicked")).toBe("CLICKED");
    expect(normalizedEventType("Open")).toBe("OPENED");
    expect(normalizedEventType("Click")).toBe("CLICKED");
  });

  it("13. never mixes one provider's tracking configuration into another", () => {
    const sesConfig = ses("us-east-1");
    const resendConfig = resend();
    expect(resendConfig.records).toHaveLength(0);
    expect(trackingFingerprint(sesConfig)).not.toBe(trackingFingerprint(resendConfig));
  });

  it("14. keys the configuration to one domain so it cannot leak across workspaces", () => {
    const a = buildTrackingConfig({ domain: "a.com", providerType: "ses", providerId: "p", region: "us-east-1" });
    const b = buildTrackingConfig({ domain: "b.com", providerType: "ses", providerId: "p", region: "us-east-1" });
    expect(a.records[0]?.fqdn).toBe("track.a.com");
    expect(b.records[0]?.fqdn).toBe("track.b.com");
    expect(trackingFingerprint(a)).not.toBe(trackingFingerprint(b));
  });

  it("15. no longer emits a hardcoded MunchReach tracking DNS record", () => {
    const records = buildDnsRecords(DOMAIN, "sl1234");
    expect(records.some((r) => r.kind === "tracking")).toBe(false);
    expect(JSON.stringify(records)).not.toMatch(/track\.(munchreach|sendloop)/i);
  });

  it("errors instead of guessing when an SES region is unknown", () => {
    const config = ses(null);
    expect(config.status).toBe("error");
    expect(config.records).toHaveLength(0);
  });
});
