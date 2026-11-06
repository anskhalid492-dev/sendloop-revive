import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSesQuotaCache, sendSesEmail } from "../ses-send.server";
import { sesEmailProvider } from "../ses.server";
import { getEmailProvider } from "../registry.server";
import { sendProviderEmail } from "@/lib/provider-credentials.server";
import { applySentPatch } from "@/lib/dispatch.server";

const CREDS = {
  access_key_id: "AKIATEST",
  secret_access_key: "secret",
  region: "eu-west-1",
};

const MESSAGE = {
  fromName: "Ana",
  fromEmail: "ana@customer.com",
  replyTo: "reply-abc@customer.com",
  to: "lead@example.com",
  subject: "Hello",
  text: "Body",
  html: "<p>Body</p>",
  headers: { "X-Campaign": "c1", "Reply-To": "spoof@evil.com" },
};

const QUOTA_OK = {
  SendingEnabled: true,
  ProductionAccessEnabled: true,
  EnforcementStatus: "HEALTHY",
  SendQuota: { Max24HourSend: 50000, MaxSendRate: 1000, SentLast24Hours: 10 },
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
  resetSesQuotaCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env["AWS_SES_ACCESS_KEY_ID"];
  delete process.env["AWS_SES_SECRET_ACCESS_KEY"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** account quota read, then the send call. */
function mockQuotaThenSend(sendResponse: Response, quota: unknown = QUOTA_OK) {
  fetchMock.mockResolvedValueOnce(mockJson(200, quota)).mockResolvedValueOnce(sendResponse);
}

function sendBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("outbound-emails"));
  return JSON.parse(String(call?.[1]?.body ?? "{}")) as Record<string, unknown>;
}

describe("SES successful send", () => {
  it("accepts a send and returns normalized fields", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "0100018c-ses-id" }));
    const result = await sendSesEmail(CREDS, MESSAGE);

    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("0100018c-ses-id");
    expect(result.rfcMessageId).toBe("<0100018c-ses-id@eu-west-1.amazonses.com>");
    expect(result.statusCode).toBe(200);
    expect(result.requestId).toBe("0100018c-ses-id");
    expect(result.providerResponse).toContain("0100018c-ses-id");
  });

  it("uses the SESv2 SendEmail endpoint with From, Reply-To and content", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "m1" }));
    await sendSesEmail(CREDS, MESSAGE);

    const url = String(fetchMock.mock.calls[1]?.[0]);
    expect(url).toBe("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    const body = sendBody();
    expect(body["FromEmailAddress"]).toBe("Ana <ana@customer.com>");
    expect(body["ReplyToAddresses"]).toEqual(["reply-abc@customer.com"]);
    expect(body["Destination"]).toMatchObject({ ToAddresses: ["lead@example.com"] });
  });

  it("passes safe custom headers and drops SES-reserved ones", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "m1" }));
    await sendSesEmail(CREDS, MESSAGE);
    const simple = (sendBody()["Content"] as { Simple: Record<string, unknown> }).Simple;
    expect(simple["Headers"]).toEqual([{ Name: "X-Campaign", Value: "c1" }]);
  });
});

describe("Message-ID header stripping (SES rejects it)", () => {
  it("sends successfully when the original email carries a Message-ID header", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "ses-own-id" }));
    const result = await sendSesEmail(CREDS, {
      ...MESSAGE,
      headers: { "Message-ID": "<internal-123@munchreach.local>", "X-Campaign": "c1" },
    });
    expect(result.ok).toBe(true);
    // SES generates its own ID, which becomes providerMessageId
    expect(result.providerMessageId).toBe("ses-own-id");
  });

  it("strips Message-ID case-insensitively from the SES API request", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "m1" }));
    await sendSesEmail(CREDS, {
      ...MESSAGE,
      headers: {
        "Message-ID": "<a@x>",
        "message-id": "<b@x>",
        "MESSAGE-ID": "<c@x>",
        "MeSsAgE-Id": "<d@x>",
        "X-Custom": "kept",
      },
    });
    const simple = (sendBody()["Content"] as { Simple: { Headers?: { Name: string; Value: string }[] } }).Simple;
    const names = (simple.Headers ?? []).map((h) => h.Name.toLowerCase());
    expect(names).not.toContain("message-id");
    // other custom headers remain unchanged
    expect(simple.Headers).toContainEqual({ Name: "X-Custom", Value: "kept" });
  });

  it("omits Headers entirely when Message-ID was the only one", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "m1" }));
    await sendSesEmail(CREDS, { ...MESSAGE, headers: { "Message-ID": "<only@x>" } });
    const simple = (sendBody()["Content"] as { Simple: Record<string, unknown> }).Simple;
    expect(simple["Headers"]).toBeUndefined();
  });

  it("a Message-ID send is a single request, never retried/resplit", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "m1" }));
    await sendSesEmail(CREDS, { ...MESSAGE, headers: { "Message-ID": "<once@x>" } });
    const sends = fetchMock.mock.calls.filter((c) => String(c[0]).includes("outbound-emails"));
    expect(sends).toHaveLength(1);
  });
});

describe("SES failures", () => {
  it("fails cleanly on an SES API error and never reports success", async () => {
    mockQuotaThenSend(mockJson(400, { message: "Email address not verified" }));
    const result = await sendSesEmail(CREDS, MESSAGE);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.providerMessageId).toBeUndefined();
  });

  it("treats an accepted response without a message id as a rejection", async () => {
    mockQuotaThenSend(mockJson(200, {}));
    const result = await sendSesEmail(CREDS, MESSAGE);
    expect(result.ok).toBe(false);
  });

  it("fails without credentials and calls no SES API", async () => {
    const result = await sendSesEmail({}, MESSAGE);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw on a network error", async () => {
    fetchMock.mockResolvedValueOnce(mockJson(200, QUOTA_OK)).mockRejectedValueOnce(new Error("down"));
    const result = await sendSesEmail(CREDS, MESSAGE);
    expect(result.ok).toBe(false);
  });
});

describe("SES quota handling", () => {
  it("refuses to send when the 24 hour quota is exhausted", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJson(200, {
        SendingEnabled: true,
        SendQuota: { Max24HourSend: 100, MaxSendRate: 14, SentLast24Hours: 100 },
      }),
    );
    const result = await sendSesEmail(CREDS, MESSAGE);
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // quota read only, no send
  });

  it("refuses to send when SES sending is disabled", async () => {
    fetchMock.mockResolvedValueOnce(mockJson(200, { SendingEnabled: false, SendQuota: {} }));
    const result = await sendSesEmail(CREDS, MESSAGE);
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches the quota read across sends", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJson(200, QUOTA_OK))
      .mockResolvedValueOnce(mockJson(200, { MessageId: "m1" }))
      .mockResolvedValueOnce(mockJson(200, { MessageId: "m2" }));
    await sendSesEmail(CREDS, MESSAGE);
    await sendSesEmail(CREDS, MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("provider selection", () => {
  it("routes ses sends through the SES provider adapter", async () => {
    const spy = vi.spyOn(sesEmailProvider, "send");
    mockQuotaThenSend(mockJson(200, { MessageId: "m-routed" }));
    const result = await sendProviderEmail("ses", CREDS, {
      fromName: "Ana",
      fromEmail: "ana@customer.com",
      replyTo: "reply-abc@customer.com",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("m-routed");
    expect(result.rfcMessageId).toBe("<m-routed@eu-west-1.amazonaws.com>".replace("amazonaws", "amazonses"));
    spy.mockRestore();
  });

  it("keeps Resend on its own adapter (regression)", async () => {
    const sesSpy = vi.spyOn(sesEmailProvider, "send");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ id: "resend-id" }),
    } as unknown as Response);

    const result = await sendProviderEmail("resend", { api_key: "re_test" }, {
      fromName: "Ana",
      fromEmail: "ana@customer.com",
      to: "lead@example.com",
      subject: "Hello",
      text: "Body",
    });

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("resend-id");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.resend.com/emails");
    expect(sesSpy).not.toHaveBeenCalled();
    sesSpy.mockRestore();
  });

  it("both providers stay registered", () => {
    expect(getEmailProvider("ses").capabilities.sending).toBe(true);
    expect(getEmailProvider("resend").capabilities.sending).toBe(true);
  });
});

describe("accepted → sent transition", () => {
  it("writes the terminal sent state with SES ids through applySentPatch", async () => {
    mockQuotaThenSend(mockJson(200, { MessageId: "ses-accepted" }));
    const send = await sendSesEmail(CREDS, MESSAGE);
    expect(send.ok).toBe(true);

    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: () => ({
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          const chain: any = { eq: () => chain, is: () => chain, select: async () => ({ data: [{ id: "msg-1" }], error: null }) };
          return chain;
        },
      }),
    };

    const ok = await applySentPatch(supabase as never, "msg-1", {
      status: "sent",
      sent_at: new Date().toISOString(),
      provider: "ses",
      provider_message_id: send.providerMessageId ?? null,
      message_id: send.rfcMessageId ?? null,
    });

    expect(ok).toBe(true);
    expect(updates[0]).toMatchObject({
      status: "sent",
      provider: "ses",
      provider_message_id: "ses-accepted",
      message_id: "<ses-accepted@eu-west-1.amazonses.com>",
    });
  });

  it("never produces a sent patch for a rejected SES send", async () => {
    mockQuotaThenSend(mockJson(422, { message: "rejected" }));
    const send = await sendSesEmail(CREDS, MESSAGE);
    expect(send.ok).toBe(false);
    expect(send.providerMessageId).toBeUndefined();
  });
});
