import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import {
  getEmailProvider,
  isEmailProviderRegistered,
  listEmailProviders,
} from "@/lib/email-providers/registry.server";
import { getDomainAdapter, DOMAIN_CAPABLE_PROVIDERS } from "@/lib/domain-providers/registry.server";
import { PROVIDER_DEFINITIONS, PROVIDER_IDS } from "@/lib/providers/registry";
import { PROVIDER_GUIDES } from "@/lib/provider-guides";
import {
  PROVIDER_CAPABILITY_KEYS,
  providerCapabilityProfile,
} from "@/lib/email-providers/capability-matrix";
import { mapNuntlyRecords, mapNuntlyState } from "@/lib/domain-providers/nuntly.server";
import {
  mapElasticRecords,
  mapElasticState,
} from "@/lib/domain-providers/elasticemail.server";
import {
  mapMailerooRecords,
  mapMailerooState,
} from "@/lib/domain-providers/maileroo.server";
import { nuntlyEvent, nuntlyEmailProvider } from "@/lib/email-providers/nuntly.server";
import { elasticEmailEvent } from "@/lib/email-providers/elasticemail.server";
import { mailerooEvent } from "@/lib/email-providers/maileroo.server";
import { courierEvent, courierEmailProvider } from "@/lib/email-providers/courier.server";
import { uspeedoEvent, uspeedoAuthHeader } from "@/lib/email-providers/uspeedo.server";

const NEW_PROVIDERS = ["nuntly", "elasticemail", "maileroo", "courier", "uspeedo"] as const;

describe("provider registration", () => {
  it("registers every new provider in the id registry, guides and adapters", () => {
    for (const id of NEW_PROVIDERS) {
      expect(PROVIDER_IDS).toContain(id);
      expect(PROVIDER_DEFINITIONS.some((d) => d.id === id)).toBe(true);
      expect(PROVIDER_GUIDES[id].id).toBe(id);
      expect(isEmailProviderRegistered(id)).toBe(true);
      expect(getEmailProvider(id).id).toBe(id);
    }
    const ids = listEmailProviders().map((p) => p.id);
    expect(ids).toContain("resend");
    expect(ids).toContain("ses");
  });

  it("keeps existing providers untouched", () => {
    for (const id of ["ses", "resend", "mailgun", "brevo", "sendgrid", "smtp"]) {
      expect(PROVIDER_IDS).toContain(id);
    }
  });

  it("only registers domain adapters for providers that publish a domain API", () => {
    expect(DOMAIN_CAPABLE_PROVIDERS).toEqual(
      expect.arrayContaining(["nuntly", "elasticemail", "maileroo"]),
    );
    // Courier and uSpeedo document no domain API — they must fall back to the
    // unsupported adapter rather than pretending to manage domains.
    expect(getDomainAdapter("courier").supportsDomainApi).toBe(false);
    expect(getDomainAdapter("uspeedo").supportsDomainApi).toBe(false);
  });
});

describe("capability matrix", () => {
  it("declares every capability for every new provider", () => {
    for (const id of NEW_PROVIDERS) {
      const profile = providerCapabilityProfile(id);
      expect(profile).not.toBeNull();
      for (const key of PROVIDER_CAPABILITY_KEYS) {
        expect(["supported", "manual_required", "not_supported"]).toContain(
          profile!.capabilities[key],
        );
      }
      expect(profile!.note.length).toBeGreaterThan(10);
    }
  });

  it("marks undocumented provider features as unsupported or manual", () => {
    const courier = providerCapabilityProfile("courier")!.capabilities;
    expect(courier.domain_management).toBe("not_supported");
    expect(courier.dns_record_retrieval).toBe("not_supported");
    expect(courier.inbound).toBe("not_supported");
    expect(courier.webhooks).toBe("manual_required");

    const uspeedo = providerCapabilityProfile("uspeedo")!.capabilities;
    expect(uspeedo.domain_management).toBe("manual_required");
    expect(uspeedo.dns_record_retrieval).toBe("manual_required");
    expect(uspeedo.inbound).toBe("not_supported");

    // Elastic Email returns only the DKIM record through its API.
    expect(providerCapabilityProfile("elasticemail")!.capabilities.dns_record_retrieval).toBe(
      "manual_required",
    );
  });
});

describe("dns records come only from the provider", () => {
  it("maps Nuntly records without inventing any", () => {
    const records = mapNuntlyRecords("example.com", [
      {
        name: "nuntly._domainkey",
        fullname: "nuntly._domainkey.example.com",
        recordType: "TXT",
        group: "DKIM",
        ttl: 3600,
        value: "v=DKIM1; k=rsa; p=abc",
        status: "pending",
      },
      {
        name: "@",
        fullname: "example.com",
        recordType: "MX",
        group: "MX_RECEIVING",
        priority: 10,
        ttl: 3600,
        value: "mx.nuntly.com",
        status: "pending",
      },
      { name: "empty", recordType: "TXT", group: "SPF", value: "" },
    ]);
    expect(records).toHaveLength(2);
    expect(records[0]!.kind).toBe("dkim");
    expect(records[0]!.value).toBe("v=DKIM1; k=rsa; p=abc");
    expect(records[1]!.kind).toBe("mx");
    expect(records[1]!.host).toBe("@");
    expect(records[1]!.priority).toBe(10);
  });

  it("returns only the DKIM record Elastic Email actually publishes", () => {
    const records = mapElasticRecords("example.com", {
      Domain: "example.com",
      Spf: false,
      Dkim: false,
      DKIMRecord: {
        HostName: "api._domainkey.example.com",
        RecordValue: "k=rsa;p=xyz",
        Selector: "api",
      },
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("dkim");
    expect(records[0]!.host).toBe("api._domainkey");
    expect(mapElasticRecords("example.com", { Domain: "example.com" })).toEqual([]);
  });

  it("maps Maileroo dns_records verbatim", () => {
    const records = mapMailerooRecords("example.com", {
      domain_name: "example.com",
      dns_records: {
        dkim_record: {
          host: "smtp._domainkey.example.com",
          record: "v=DKIM1; p=k",
          created: true,
        },
        spf_record: {
          host: "example.com",
          record: "v=spf1 include:spf.maileroo.com ~all",
          created: true,
        },
        dmarc_record: { host: "_dmarc.example.com", record: "", created: false },
      },
    });
    expect(records.map((r) => r.kind)).toEqual(["dkim", "spf"]);
    expect(records[1]!.host).toBe("@");
  });

  it("derives verification state from provider verdicts only", () => {
    expect(mapNuntlyState("verified")).toBe("verified");
    expect(mapNuntlyState(undefined)).toBe("unknown");
    expect(mapElasticState({ Verify: true, Spf: true, Dkim: true })).toBe("verified");
    expect(mapElasticState({ Verify: true, Spf: false, Dkim: true })).toBe("pending");
    expect(mapElasticState(null)).toBe("unknown");
    expect(
      mapMailerooState({
        dns_records: { spf_record: { created: true }, dkim_record: { created: true } },
      }),
    ).toBe("verified");
    expect(mapMailerooState(null)).toBe("unknown");
  });
});

describe("event normalization", () => {
  it("normalizes Nuntly events", () => {
    const event = nuntlyEvent({
      type: "email.opened",
      data: { id: "em_1", to: ["a@b.com"], messageId: "<x@y>" },
    });
    expect(event?.type).toBe("OPENED");
    expect(event?.providerMessageId).toBe("em_1");
    expect(event?.recipient).toBe("a@b.com");
    expect(nuntlyEvent({ data: {} })).toBeNull();
    expect(nuntlyEvent({ type: "email.somethingNew" })?.type).toBe("UNKNOWN");
  });

  it("normalizes Elastic Email events", () => {
    const event = elasticEmailEvent({
      status: "Clicked",
      transactionid: "t1",
      messageid: "m1",
      to: "a@b.com",
      targeturl: "https://example.com",
    });
    expect(event?.type).toBe("CLICKED");
    expect(event?.providerMessageId).toBe("m1");
    expect(event?.url).toBe("https://example.com");
  });

  it("normalizes Maileroo events using the reference id", () => {
    const event = mailerooEvent({
      event_type: "delivered",
      event_id: "e1",
      message_id: "<m@mail.maileroo.com>",
      message_reference_id: "ref1",
      event_time: 1710545542,
      event_data: { to: "a@b.com" },
    });
    expect(event?.type).toBe("DELIVERED");
    expect(event?.providerMessageId).toBe("ref1");
    expect(event?.rfcMessageId).toBe("<m@mail.maileroo.com>");
    expect(event?.occurredAt).toBe("2024-03-15T23:32:22.000Z");
  });

  it("normalizes Courier message status events", () => {
    const event = courierEvent({
      type: "message:updated",
      data: { id: "1-abc", status: "UNDELIVERABLE", recipient: "u1", error: "hard bounce" },
    });
    expect(event?.type).toBe("BOUNCED");
    expect(event?.providerMessageId).toBe("1-abc");
    expect(event?.reason).toBe("hard bounce");
  });

  it("normalizes uSpeedo webhook envelopes", () => {
    const event = uspeedoEvent({
      MsgType: 2,
      Data: [
        {
          Event: "click",
          MsgId: "msg1",
          SessionNo: "s1",
          RecipientEmail: "a@b.com",
          ClickedURL: "https://example.com",
        },
      ],
    });
    expect(event?.type).toBe("CLICKED");
    expect(event?.providerMessageId).toBe("msg1");
    expect(uspeedoEvent({ MsgType: 2, Data: [] })).toBeNull();
  });
});

describe("webhook identification and signatures", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { id: "em_1" } });

  it("verifies a Nuntly signature and rejects a bad one", () => {
    const t = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "abc").update(`${t}.${body}`).digest("hex");
    const good = nuntlyEmailProvider.verifyWebhookSignature!(
      {
        headers: { "webhook-timestamp": String(t * 1000), "webhook-signature": `t=${t},v0=${signature}` },
        rawBody: body,
      },
      "whsec_abc",
    ) as { valid: boolean };
    expect(good.valid).toBe(true);

    const bad = nuntlyEmailProvider.verifyWebhookSignature!(
      {
        headers: { "webhook-signature": `t=${t},v0=${"0".repeat(64)}` },
        rawBody: body,
      },
      "whsec_abc",
    ) as { valid: boolean };
    expect(bad.valid).toBe(false);
  });

  it("rejects a stale Nuntly signature", () => {
    const t = Math.floor(Date.now() / 1000) - 3600;
    const signature = createHmac("sha256", "abc").update(`${t}.${body}`).digest("hex");
    const result = nuntlyEmailProvider.verifyWebhookSignature!(
      { headers: { "webhook-signature": `t=${t},v0=${signature}` }, rawBody: body },
      "whsec_abc",
    ) as { valid: boolean };
    expect(result.valid).toBe(false);
  });

  it("verifies a Courier signature", () => {
    const payload = JSON.stringify({ type: "message:updated", data: { id: "1" } });
    const t = Date.now();
    const signature = createHmac("sha256", "s3cret").update(`${t}.${payload}`).digest("hex");
    const result = courierEmailProvider.verifyWebhookSignature!(
      { headers: { "courier-signature": `t=${t},signature=${signature}` }, rawBody: payload },
      "s3cret",
    ) as { valid: boolean };
    expect(result.valid).toBe(true);
  });

  it("identifies each provider from its own payload shape", () => {
    expect(
      nuntlyEmailProvider.identifyWebhookRequest!({
        headers: {},
        rawBody: body,
        payload: { type: "email.delivered" },
      }).matched,
    ).toBe(true);
    expect(
      courierEmailProvider.identifyWebhookRequest!({
        headers: {},
        rawBody: "{}",
        payload: { type: "message:updated" },
      }).matched,
    ).toBe(true);
    expect(
      nuntlyEmailProvider.identifyWebhookRequest!({
        headers: {},
        rawBody: "{}",
        payload: { type: "message:updated" },
      }).matched,
    ).toBe(false);
  });
});

describe("uspeedo credentials", () => {
  it("builds HTTP Basic auth from the console key pair", () => {
    const header = uspeedoAuthHeader({ access_key_id: "id", access_key_secret: "secret" });
    expect(header).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
  });
});
