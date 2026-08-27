/**
 * Phase 9C — automated SES domain provisioning.
 *
 * Everything here goes through the generic domain adapter, so the tests also
 * prove the customer-facing domain system never needs SES-specific code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDomainAdapter } from "@/lib/domain-providers/registry.server";
import {
  SES_CONFIGURE_FAILED_MESSAGE,
  SES_UNAVAILABLE_MESSAGE,
  provisionSesDomain,
  sesIdentityName,
} from "@/lib/email-providers/ses-provisioning.server";

const CREDS = {
  access_key_id: "AKIATEST",
  secret_access_key: "secret-value",
  region: "us-east-1",
};

const TOKENS = ["tok1", "tok2", "tok3"];

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const verifiedIdentity = {
  VerifiedForSendingStatus: true,
  VerificationStatus: "SUCCESS",
  DkimAttributes: { Status: "SUCCESS", Tokens: TOKENS, SigningEnabled: true },
};

const pendingIdentity = {
  VerifiedForSendingStatus: false,
  VerificationStatus: "PENDING",
  DkimAttributes: { Status: "PENDING", Tokens: TOKENS, SigningEnabled: true },
};

let fetchMock: ReturnType<typeof vi.fn>;

function calls() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: String((init as RequestInit | undefined)?.method ?? "GET"),
  }));
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env["AWS_SES_ACCESS_KEY_ID"];
  delete process.env["AWS_SES_SECRET_ACCESS_KEY"];
  delete process.env["AWS_SES_REGION"];
  delete process.env["SES_MAIL_FROM_SUBDOMAIN"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("identity naming", () => {
  it("normalizes whatever the customer typed", () => {
    expect(sesIdentityName("https://SmartOutreach.bond/setup")).toBe("smartoutreach.bond");
    expect(sesIdentityName("www.smartoutreach.bond.")).toBe("smartoutreach.bond");
  });
});

describe("new domain", () => {
  it("creates the SES identity and returns SES-generated DKIM records", async () => {
    fetchMock
      .mockResolvedValueOnce(response(404, { message: "NotFoundException" }))
      .mockResolvedValueOnce(response(200, { DkimAttributes: { Tokens: TOKENS } }))
      .mockResolvedValueOnce(response(200, pendingIdentity));

    const setup = await getDomainAdapter("ses").createDomain(CREDS, "smartoutreach.bond");

    expect(calls().some((c) => c.method === "POST" && c.url.endsWith("/v2/email/identities"))).toBe(
      true,
    );
    expect(setup.providerDomainId).toBe("smartoutreach.bond");
    expect(setup.state).toBe("pending");

    const dkim = setup.records.filter((r) => r.kind === "dkim");
    expect(dkim).toHaveLength(3);
    expect(dkim[0]).toMatchObject({
      type: "CNAME",
      host: "tok1._domainkey",
      value: "tok1.dkim.amazonses.com",
      required: true,
    });
  });

  it("includes the region-specific receiving MX without blocking sending", async () => {
    fetchMock.mockResolvedValue(response(200, pendingIdentity));
    const setup = await provisionSesDomain({ ...CREDS, region: "eu-west-1" }, "smartoutreach.bond");
    const mx = setup.records.find((r) => r.kind === "mx");
    expect(mx).toMatchObject({
      type: "MX",
      host: "@",
      value: "inbound-smtp.eu-west-1.amazonaws.com",
      required: false,
    });
  });
});

describe("idempotency", () => {
  it("reuses an existing identity instead of creating a duplicate", async () => {
    fetchMock.mockResolvedValue(response(200, verifiedIdentity));
    const setup = await getDomainAdapter("ses").createDomain(CREDS, "smartoutreach.bond");
    expect(calls().every((c) => c.method === "GET")).toBe(true);
    expect(setup.state).toBe("verified");
  });

  it("stays stable across repeated Check DNS clicks", async () => {
    fetchMock.mockResolvedValue(response(200, verifiedIdentity));
    const adapter = getDomainAdapter("ses");
    for (let i = 0; i < 3; i += 1) {
      const state = await adapter.authorizeDomain(CREDS, "smartoutreach.bond");
      expect(state.state).toBe("verified");
    }
    expect(calls().some((c) => c.method === "POST")).toBe(false);
  });
});

describe("verification state", () => {
  it("marks sending ready only when SES says verified", async () => {
    fetchMock.mockResolvedValue(response(200, verifiedIdentity));
    await expect(getDomainAdapter("ses").isReadyToSend(CREDS, "smartoutreach.bond")).resolves.toBe(
      true,
    );
  });

  it("stays pending while SES has not verified the identity", async () => {
    fetchMock.mockResolvedValue(response(200, pendingIdentity));
    const adapter = getDomainAdapter("ses");
    expect((await adapter.getDomainStatus(CREDS, "smartoutreach.bond")).state).toBe("pending");
    await expect(adapter.isReadyToSend(CREDS, "smartoutreach.bond")).resolves.toBe(false);
  });
});

describe("error handling", () => {
  it("converts an SES API failure into a safe application error", async () => {
    fetchMock.mockResolvedValue(
      response(400, { message: "AccessDenied: user arn:aws:iam::123:user/x is not authorized" }),
    );
    const setup = await provisionSesDomain(CREDS, "smartoutreach.bond");
    expect(setup.state).toBe("failed");
    expect(setup.detail).toBe(SES_CONFIGURE_FAILED_MESSAGE);
    expect(JSON.stringify(setup)).not.toMatch(/aws|iam|arn|AKIA|secret-value/i);
  });

  it("fails safely when platform credentials are missing", async () => {
    const setup = await provisionSesDomain({}, "smartoutreach.bond");
    expect(setup.state).toBe("failed");
    expect(setup.detail).toBe(SES_UNAVAILABLE_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks credentials into an adapter response", async () => {
    fetchMock.mockResolvedValue(response(200, verifiedIdentity));
    const setup = await getDomainAdapter("ses").createDomain(CREDS, "smartoutreach.bond");
    expect(JSON.stringify(setup)).not.toContain("AKIATEST");
    expect(JSON.stringify(setup)).not.toContain("secret-value");
  });
});

describe("multi-tenant isolation", () => {
  it("keeps each customer domain on its own identity and records", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("example.com")
        ? response(200, {
            ...verifiedIdentity,
            DkimAttributes: { Status: "SUCCESS", Tokens: ["b1", "b2", "b3"] },
          })
        : response(200, pendingIdentity),
    );
    const a = await provisionSesDomain(CREDS, "smartoutreach.bond");
    const b = await provisionSesDomain(CREDS, "example.com");

    expect(a.state).toBe("pending");
    expect(b.state).toBe("verified");
    expect(a.records.every((r) => r.fqdn.includes("smartoutreach.bond"))).toBe(true);
    expect(b.records.every((r) => r.fqdn.includes("example.com"))).toBe(true);
    expect(a.records.map((r) => r.value)).not.toEqual(b.records.map((r) => r.value));
  });
});

describe("other providers", () => {
  it("leaves Resend registered and untouched", () => {
    const resend = getDomainAdapter("resend");
    expect(resend.id).toBe("resend");
    expect(resend).not.toBe(getDomainAdapter("ses"));
    expect(resend.supportsDomainApi).toBe(true);
  });
});
