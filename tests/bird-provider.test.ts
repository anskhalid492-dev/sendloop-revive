import { describe, expect, it } from "vitest";

import {
  birdEmailProvider,
  birdEventType,
  birdInboundEvent,
} from "@/lib/email-providers/bird.server";
import {
  birdApiBase,
  birdDomainState,
  birdInboundMxRecords,
  birdInboundMxTargets,
  birdRegion,
  birdSendingDnsRecords,
  resolveBirdCredentials,
} from "@/lib/email-providers/bird-api.server";
import { getEmailProvider, isEmailProviderRegistered, listEmailProviders, identifyWebhookProvider } from "@/lib/email-providers/registry.server";
import { compareMxRecords } from "@/lib/email-providers/inbound";
import { dnsRecordPurpose, dnsRecordPurposeLabel } from "@/lib/dns-record-purpose";

const creds = { api_key: "k", workspace_id: "ws", region: "us" };

describe("bird adapter registration", () => {
  it("is registered alongside the existing provider", () => {
    expect(isEmailProviderRegistered("bird")).toBe(true);
    expect(getEmailProvider("bird").id).toBe("bird");
    const ids = listEmailProviders().map((p) => p.id);
    expect(ids).toContain("bird");
    expect(ids).toContain("resend");
  });
});

describe("bird capabilities", () => {
  it("declares every capability individually", () => {
    expect(birdEmailProvider.capabilities).toEqual({
      sending: true,
      inbound: true,
      inbound_content: false,
      delivery_tracking: true,
      open_tracking: true,
      click_tracking: true,
      bounce_tracking: true,
      webhooks: true,
      domain_api: true,
      dns_api: true,
    });
    expect(birdEmailProvider.inboundSetupMode).toBe("api");
  });

  it("does not fake unsupported capabilities: no RFC Message-ID is invented", async () => {
    // Without credentials there is no provider call and no synthesised id.
    await expect(birdEmailProvider.getRfcMessageId?.({}, "tx-1")).resolves.toBeNull();
  });
});

describe("bird credentials and region", () => {
  it("resolves workspace + region and refuses partial configuration", () => {
    expect(resolveBirdCredentials(creds)).toEqual({ key: "k", workspaceId: "ws", region: "us" });
    expect(resolveBirdCredentials({ api_key: "k" })).toBeNull();
    expect(birdRegion("eu-west-1")).toBe("eu");
    expect(birdApiBase("eu")).toContain("eu-west-1");
    expect(birdApiBase("us")).toContain("us-west-1");
  });
});

describe("bird domain status", () => {
  it("maps the provider's own verification fields", () => {
    expect(birdDomainState({ ownership_verified: true })).toBe("verified");
    expect(birdDomainState({ dkim_status: "valid" })).toBe("verified");
    expect(birdDomainState({ dkim_status: "invalid" })).toBe("failed");
    expect(birdDomainState({ dkim_status: "pending" })).toBe("pending");
    expect(birdDomainState(undefined)).toBe("unknown");
  });

  it("reports not-configured instead of throwing", async () => {
    const status = await birdEmailProvider.getDomainStatus?.({}, "customer.com");
    expect(status?.readyToSend).toBe(false);
    expect(status?.state).toBe("unknown");
  });
});

describe("bird dns records", () => {
  const sendingDomain = {
    domain: "send.customer.com",
    dkim: { selector: "brd", public: "MIIBI" },
    status: { dkim_status: "pending" },
  };

  it("builds DKIM and return-path records only from provider values", () => {
    const records = birdSendingDnsRecords({
      domain: "customer.com",
      sendingDomain,
      dns: { dkim_record: "v=DKIM1; k=rsa; p=ABC", cname_record: "sparkpostmail.com" },
    });
    const dkim = records.find((r) => r.id === "bird-dkim")!;
    expect(dkim.type).toBe("TXT");
    expect(dkim.host).toBe("brd._domainkey");
    expect(dkim.value).toBe("v=DKIM1; k=rsa; p=ABC");

    const bounce = records.find((r) => r.id === "bird-return-path")!;
    expect(bounce.type).toBe("CNAME");
    expect(bounce.host).toBe("send");
    expect(bounce.value).toBe("sparkpostmail.com");
    // Return path is never classified as SPF.
    expect(dnsRecordPurpose(bounce)).toBe("return_path");
  });

  it("invents nothing when the provider has published no values", () => {
    expect(birdSendingDnsRecords({ domain: "customer.com", sendingDomain: null })).toEqual([]);
    expect(
      birdSendingDnsRecords({ domain: "customer.com", sendingDomain: { domain: "customer.com" } }),
    ).toEqual([]);
  });
});

describe("bird inbound capability", () => {
  it("publishes root-domain inbound MX at host @ with provider targets", () => {
    const records = birdInboundMxRecords("customer.com", "us");
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.type).toBe("MX");
      expect(record.host).toBe("@");
      expect(record.fqdn).toBe("customer.com");
      expect(record.priority).toBe(10);
    }
    expect(records.map((r) => r.value)).toEqual(birdInboundMxTargets("us").map((t) => t.host));
    expect(birdInboundMxRecords("customer.com", "eu")[0]!.value).toContain("eu.");
  });

  it("reports receiving as not enabled when the provider is unconfigured", async () => {
    const status = await birdEmailProvider.getInboundStatus?.({}, "customer.com");
    expect(status?.enabled).toBe(false);
    expect(status?.records).toEqual([]);
  });
});

describe("bird send + send status", () => {
  it("returns the shared send-result contract without provider credentials", async () => {
    const result = await birdEmailProvider.send?.(
      {},
      {
        fromName: "MunchReach",
        fromEmail: "hello@customer.com",
        to: "prospect@example.com",
        subject: "Hi",
        text: "Hello",
      },
    );
    expect(result).toMatchObject({ ok: false, providerMessageId: null, rfcMessageId: null });
    expect(typeof result?.message).toBe("string");
  });

  it("reports unknown send status when the provider is unconfigured", async () => {
    const status = await birdEmailProvider.getSendStatus?.({}, "tx-1");
    expect(status).toEqual({ known: false, status: null, detail: "Bird is not configured." });
  });
});

describe("bird webhook identification + verification", () => {
  const batch = [{ msys: { message_event: { type: "delivery", event_id: "e1" } } }];

  it("identifies its own batches by header and by envelope", () => {
    expect(
      birdEmailProvider.identifyWebhookRequest?.({
        headers: { "X-MessageSystems-Batch-ID": "b1" },
        rawBody: "[]",
      }),
    ).toMatchObject({ provider: "bird", matched: true, confidence: "exact" });

    expect(
      birdEmailProvider.identifyWebhookRequest?.({
        headers: {},
        rawBody: JSON.stringify(batch),
        payload: batch,
      }),
    ).toMatchObject({ matched: true, confidence: "likely" });
  });

  it("does not claim another provider's payload", () => {
    const foreign = { type: "email.delivered", data: { email_id: "abc" } };
    expect(
      birdEmailProvider.identifyWebhookRequest?.({
        headers: {},
        rawBody: JSON.stringify(foreign),
        payload: foreign,
      })?.matched,
    ).toBe(false);
    const provider = identifyWebhookProvider({
      headers: { "svix-signature": "v1,x" },
      rawBody: "{}",
    });
    expect(provider?.id).toBe("resend");
  });

  it("verifies the batch token and rejects mismatches", async () => {
    const ok = await birdEmailProvider.verifyWebhookSignature?.(
      { headers: { "X-MessageSystems-Webhook-Token": "s3cret" }, rawBody: "[]" },
      "s3cret",
    );
    expect(ok?.valid).toBe(true);
    const bad = await birdEmailProvider.verifyWebhookSignature?.(
      { headers: { "X-MessageSystems-Webhook-Token": "nope" }, rawBody: "[]" },
      "s3cret",
    );
    expect(bad?.valid).toBe(false);
    const missing = await birdEmailProvider.verifyWebhookSignature?.(
      { headers: {}, rawBody: "[]" },
      null,
    );
    expect(missing?.valid).toBe(false);
  });
});

describe("bird event normalization", () => {
  it("maps every native event into the shared vocabulary", () => {
    expect(birdEventType("injection")).toBe("SENT");
    expect(birdEventType("delivery")).toBe("DELIVERED");
    expect(birdEventType("delay")).toBe("DELAYED");
    expect(birdEventType("bounce")).toBe("BOUNCED");
    expect(birdEventType("out_of_band")).toBe("BOUNCED");
    expect(birdEventType("spam_complaint")).toBe("COMPLAINED");
    expect(birdEventType("policy_rejection")).toBe("FAILED");
    expect(birdEventType("initial_open")).toBe("OPENED");
    expect(birdEventType("amp_click")).toBe("CLICKED");
    expect(birdEventType("link_unsubscribe")).toBe("UNSUBSCRIBED");
    expect(birdEventType("relay_message")).toBe("REPLIED");
    expect(birdEventType("something_else")).toBe("UNKNOWN");
  });

  it("normalizes a delivery batch, keeping the event id for idempotency", () => {
    const event = birdEmailProvider.parseDeliveryEvent?.([
      {
        msys: {
          message_event: {
            type: "bounce",
            event_id: "evt-1",
            transmission_id: "tx-9",
            rcpt_to: "prospect@example.com",
            bounce_class: "10",
            timestamp: "2026-08-26T00:00:00Z",
          },
        },
      },
    ]);
    expect(event).toMatchObject({
      provider: "bird",
      type: "BOUNCED",
      providerEventId: "evt-1",
      providerMessageId: "tx-9",
      recipient: "prospect@example.com",
      bounceType: "hard",
    });
  });

  it("keeps click targets and never returns an inbound message as a delivery event", () => {
    const click = birdEmailProvider.parseTrackingEvent?.([
      { msys: { track_event: { type: "click", event_id: "c1", target_link_url: "https://x.test" } } },
    ]);
    expect(click).toMatchObject({ type: "CLICKED", url: "https://x.test" });
    expect(
      birdEmailProvider.parseDeliveryEvent?.([{ msys: { relay_message: { rcpt_to: "a@b.test" } } }]),
    ).toBeNull();
  });
});

describe("bird inbound normalization", () => {
  const relay = [
    {
      msys: {
        relay_message: {
          rcpt_to: "reply+abc@customer.com",
          msg_from: "prospect@gmail.com",
          webhook_id: "rw-1",
          content: {
            subject: "Re: quick question",
            text: "Sure, let's talk.",
            html: "<p>Sure, let's talk.</p>",
            to: ["reply@customer.com"],
            headers: [
              { "Message-ID": "<reply-1@mail.gmail.com>" },
              { "In-Reply-To": "<out-1@customer.com>" },
              { References: "<out-0@customer.com> <out-1@customer.com>" },
              { "Delivered-To": "reply+abc@customer.com" },
              { "Reply-To": "prospect@gmail.com" },
            ],
            attachments: [{ name: "a.pdf", type: "application/pdf", size: 12, data: "Zm9v" }],
          },
        },
      },
    },
  ];

  it("preserves the threading headers and envelope recipient", () => {
    const event = birdInboundEvent(relay)!;
    expect(event.provider).toBe("bird");
    expect(event.from).toBe("prospect@gmail.com");
    expect(event.to[0]).toBe("reply+abc@customer.com");
    expect(event.messageId).toBe("<reply-1@mail.gmail.com>");
    expect(event.inReplyTo).toBe("<out-1@customer.com>");
    expect(event.references).toEqual(["<out-0@customer.com>", "<out-1@customer.com>"]);
    expect(event.subject).toBe("Re: quick question");
    expect(event.text).toContain("Sure");
    expect(event.html).toContain("<p>");
    expect(event.attachments?.[0]).toMatchObject({ filename: "a.pdf", contentType: "application/pdf" });
  });

  it("returns null for delivery batches and unusable payloads", () => {
    expect(birdInboundEvent([{ msys: { message_event: { type: "delivery" } } }])).toBeNull();
    expect(birdInboundEvent(null)).toBeNull();
    expect(birdInboundEvent([{ msys: { relay_message: { content: {} } } }])).toBeNull();
  });
});

describe("root-domain MX handling stays provider-neutral", () => {
  it("an existing CNAME on send.customer.com does not conflict with the root MX", () => {
    const required = birdInboundMxRecords("customer.com", "us").map((record) => ({
      host: record.value,
      priority: record.priority ?? 10,
    }));
    const result = compareMxRecords({
      current: required.map((r) => ({ host: r.host, priority: r.priority })),
      required,
    });
    expect(result.state).toBe("correct");
    // The sending CNAME lives on another hostname and is never an MX record.
    const sendingCname = birdSendingDnsRecords({
      domain: "customer.com",
      sendingDomain: { domain: "send.customer.com", dkim: { selector: "brd" } },
      dns: { cname_record: "sparkpostmail.com" },
    })[0]!;
    expect(sendingCname.type).toBe("CNAME");
    expect(sendingCname.host).toBe("send");
  });
});

describe("dns records are labelled by purpose", () => {
  it("labels each record for what it is", () => {
    expect(dnsRecordPurposeLabel({ type: "TXT", host: "brd._domainkey", value: "v=DKIM1; p=x" })).toBe("DKIM");
    expect(dnsRecordPurposeLabel({ type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none" })).toBe("DMARC");
    expect(dnsRecordPurposeLabel({ type: "TXT", host: "@", value: "v=spf1 include:x -all" })).toBe("SPF");
    expect(dnsRecordPurposeLabel({ type: "CNAME", host: "send", value: "sparkpostmail.com" })).toBe(
      "Return path / bounce",
    );
    expect(dnsRecordPurposeLabel({ type: "CNAME", host: "track", value: "t.example" })).toBe("Tracking");
    expect(dnsRecordPurposeLabel({ type: "MX", host: "@", value: "rx1.sparkpostmail.com" })).toBe(
      "Inbound MX",
    );
  });

  it("never calls a bounce/feedback MX record SPF", () => {
    const record = { type: "MX" as const, host: "send", value: "feedback-smtp.us-east-1.amazonses.com" };
    expect(dnsRecordPurpose(record)).toBe("return_path");
    expect(dnsRecordPurposeLabel(record)).toBe("Return path / bounce");
    expect(dnsRecordPurposeLabel(record)).not.toBe("SPF");
  });
});
