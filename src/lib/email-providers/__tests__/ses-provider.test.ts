import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider, isEmailProviderRegistered } from "../registry.server";
import {
  getSesSendingQuota,
  hasSesCredentials,
  mapSesIdentityState,
  sesDkimRecords,
  sesDnsRequirements,
  sesEmailProvider,
  sesMailFromRecords,
} from "../ses.server";

const CREDS = {
  access_key_id: "AKIATEST",
  secret_access_key: "secret",
  region: "eu-west-1",
};

function mockJson(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env["AWS_SES_ACCESS_KEY_ID"];
  delete process.env["AWS_SES_SECRET_ACCESS_KEY"];
  delete process.env["AWS_SES_REGION"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SES adapter registration", () => {
  it("registers ses alongside resend", () => {
    expect(isEmailProviderRegistered("ses")).toBe(true);
    expect(isEmailProviderRegistered("resend")).toBe(true);
    expect(getEmailProvider("ses")).toBe(sesEmailProvider);
  });

  it("is a real adapter, not a resend wrapper", () => {
    expect(sesEmailProvider.id).toBe("ses");
    expect(getEmailProvider("ses")).not.toBe(getEmailProvider("resend"));
  });
});

describe("SES capabilities", () => {
  it("declares domain, dns, sending and inbound support", () => {
    const caps = sesEmailProvider.capabilities;
    expect(caps.domain_api).toBe(true);
    expect(caps.dns_api).toBe(true);
    expect(caps.sending).toBe(true);
    expect(caps.inbound).toBe(true);
    expect(caps.webhooks).toBe(true);
    expect(caps.delivery_tracking).toBe(true);
    expect(sesEmailProvider.inboundSetupMode).toBe("dns_only");
  });

  it("implements sending and inbound processing", () => {
    expect(typeof sesEmailProvider.send).toBe("function");
    expect(typeof sesEmailProvider.parseInboundEvent).toBe("function");
  });
});

describe("missing credentials", () => {
  it("reports no credentials and makes no provider call", async () => {
    expect(hasSesCredentials({})).toBe(false);
    const status = await sesEmailProvider.getDomainStatus?.({}, "customer.com");
    expect(status?.state).toBe("unknown");
    expect(status?.readyToSend).toBe(false);
    expect(await sesEmailProvider.getDnsRequirements?.({}, "customer.com")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to server-side environment secrets", () => {
    process.env["AWS_SES_ACCESS_KEY_ID"] = "AKIAENV";
    process.env["AWS_SES_SECRET_ACCESS_KEY"] = "envsecret";
    expect(hasSesCredentials({})).toBe(true);
  });
});

describe("domain identity creation mapping", () => {
  it("creates the identity when SES has none", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJson(404, { message: "Not found" }))
      .mockResolvedValueOnce(
        mockJson(200, { DkimAttributes: { Status: "PENDING", Tokens: ["t1"] } }),
      );
    const result = await sesEmailProvider.verifyDomain?.(CREDS, "Customer.com");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(result?.state).toBe("pending");
    expect(result?.providerDomainId).toBe("customer.com");
    expect(result?.readyToSend).toBe(false);
  });
});

describe("domain verification status mapping", () => {
  it("maps a verified identity", async () => {
    fetchMock.mockResolvedValue(
      mockJson(200, {
        VerifiedForSendingStatus: true,
        DkimAttributes: { Status: "SUCCESS", Tokens: ["t1"] },
      }),
    );
    const status = await sesEmailProvider.getDomainStatus?.(CREDS, "customer.com");
    expect(status?.state).toBe("verified");
    expect(status?.readyToSend).toBe(true);
  });

  it("maps failures and unknown identities", () => {
    expect(mapSesIdentityState(null).state).toBe("unknown");
    expect(mapSesIdentityState({ DkimAttributes: { Status: "FAILED" } }).state).toBe("failed");
    expect(mapSesIdentityState({ DkimAttributes: { Status: "PENDING" } }).state).toBe("pending");
  });
});

describe("DNS record mapping", () => {
  it("maps DKIM tokens into ProviderDnsRecord CNAMEs", () => {
    const records = sesDkimRecords("customer.com", ["abc", "def", ""]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      kind: "dkim",
      type: "CNAME",
      host: "abc._domainkey",
      fqdn: "abc._domainkey.customer.com",
      value: "abc.dkim.amazonses.com",
      required: true,
    });
  });

  it("maps MAIL FROM records using the configured region", () => {
    const records = sesMailFromRecords("customer.com", "bounce.customer.com", "eu-west-1");
    expect(records.map((r) => r.type)).toEqual(["MX", "TXT"]);
    expect(records[0]).toMatchObject({
      kind: "feedback",
      host: "bounce",
      value: "feedback-smtp.eu-west-1.amazonses.com",
      priority: 10,
    });
    expect(records[1]).toMatchObject({ kind: "spf", value: "v=spf1 include:amazonses.com ~all" });
  });

  it("omits MAIL FROM records when SES reports none", () => {
    expect(sesMailFromRecords("customer.com", null, "us-east-1")).toEqual([]);
    expect(sesDnsRequirements("customer.com", null, "us-east-1")).toEqual([]);
  });

  it("returns SES-reported requirements through the adapter", async () => {
    fetchMock.mockResolvedValue(
      mockJson(200, {
        DkimAttributes: { Status: "PENDING", Tokens: ["abc"] },
        MailFromAttributes: { MailFromDomain: "bounce.customer.com" },
      }),
    );
    const records = await sesEmailProvider.getDnsRequirements?.(CREDS, "Customer.com");
    expect(records?.map((r) => r.kind)).toEqual(["dkim", "feedback", "spf"]);
  });
});

describe("SES API errors", () => {
  it("maps a server error to a failed status", async () => {
    fetchMock.mockResolvedValue(mockJson(500, { message: "boom" }));
    const status = await sesEmailProvider.getDomainStatus?.(CREDS, "customer.com");
    expect(status?.state).toBe("failed");
    expect(status?.readyToSend).toBe(false);
  });

  it("maps a 404 to unknown and never throws on network failure", async () => {
    fetchMock.mockResolvedValueOnce(mockJson(404, {}));
    expect((await sesEmailProvider.getDomainStatus?.(CREDS, "customer.com"))?.state).toBe("unknown");

    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await sesEmailProvider.getDnsRequirements?.(CREDS, "customer.com")).toEqual([]);
  });
});

describe("quota retrieval", () => {
  it("reads the SES account sending quota", async () => {
    fetchMock.mockResolvedValue(
      mockJson(200, {
        SendingEnabled: true,
        ProductionAccessEnabled: true,
        EnforcementStatus: "HEALTHY",
        SendQuota: { Max24HourSend: 50000, MaxSendRate: 14, SentLast24Hours: 120 },
      }),
    );
    const quota = await getSesSendingQuota(CREDS);
    expect(quota).toMatchObject({
      known: true,
      sendingEnabled: true,
      productionAccess: true,
      max24HourSend: 50000,
      maxSendRate: 14,
      sentLast24Hours: 120,
    });
  });

  it("reports unknown quota when credentials are missing", async () => {
    const quota = await getSesSendingQuota({});
    expect(quota.known).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
