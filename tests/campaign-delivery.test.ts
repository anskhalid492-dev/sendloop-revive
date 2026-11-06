import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { applyCampaignRollup, buildCampaignOverview, accountOnline, deriveDisplayStatus } from "../src/lib/campaign-overview";
import { correlateTestSend, pickEvent } from "../src/lib/test-send-status";
import {
  renderEmailForLead,
  selectCampaignVariant,
  variableResolutionReport,
} from "../src/lib/campaign-model";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("test send pipeline uses the production sending flow", () => {
  const testSend = read("src/lib/campaigns.functions.ts");
  const production = read("src/lib/dispatch.server.ts");
  const managed = read("src/lib/managed-sending.server.ts");

  it("routes both paths through the customer's own connected mailbox", () => {
    for (const source of [testSend, production]) {
      expect(source).toContain("customer-mailbox-send.server");
      expect(source).toContain("findCustomerMailbox");
      expect(source).toContain("sendViaCustomerMailbox");
    }
  });

  it("refuses a test send instead of falling back to shared infrastructure", () => {
    expect(testSend).toContain("Connect a mailbox for this campaign's sender");
    expect(testSend).not.toContain("sendManagedEmail(");
  });

  it("resolves the provider adapter inside the managed helper", () => {
    expect(managed).toContain("providers/adapter.server");
    expect(managed).toContain("getAdapter");
    expect(managed).toContain("adapter.sendEmail");
  });

  it("never reads customer-supplied provider API keys", () => {
    for (const source of [testSend, production, managed]) {
      expect(source).not.toContain("sending_account_secrets");
    }
    expect(managed).toContain("email_provider_secrets");
  });

  it("blocks sends when the sender domain is not verified with the provider", () => {
    expect(managed).toContain("checkSenderDomainVerification");
    expect(managed).toContain("DOMAIN_NOT_VERIFIED_MESSAGE");
  });

  it("logs every test send so provider acceptance can be audited", () => {
    expect(testSend).toContain("campaign_test_sends");
    expect(testSend).toContain("X-MunchReach-Test-Request-ID");
    expect(managed).toContain("[managed-send]");
  });
});


describe("delivery status is driven by webhooks, not provider acceptance", () => {
  const base = {
    request_id: "req_1",
    provider_message_id: "msg_1",
    status: "accepted",
    error: null,
  };

  it("stays accepted until a webhook arrives", () => {
    expect(correlateTestSend(base, []).outcome).toBe("accepted");
    expect(correlateTestSend(base, []).webhookStatus).toBe("pending");
  });

  it("becomes delivered when the delivered webhook lands", () => {
    const result = correlateTestSend(base, [
      {
        id: "e1",
        message_id: "msg_1",
        event_type: "delivered",
        status: "processed",
        error: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(result.outcome).toBe("delivered");
    expect(result.webhookEventId).toBe("e1");
  });

  it("prefers a terminal bounce over an earlier delivered event", () => {
    const events = [
      { id: "e1", message_id: "msg_1", event_type: "delivered", status: "processed", error: null, created_at: "1" },
      { id: "e2", message_id: "msg_1", event_type: "bounced", status: "processed", error: "550", created_at: "2" },
    ];
    expect(correlateTestSend(base, events).outcome).toBe("bounced");
    expect(pickEvent("msg_1", events)?.id).toBe("e2");
  });

  it("never claims delivery for a provider rejection", () => {
    const rejected = { ...base, status: "rejected", error: "invalid api key" };
    expect(correlateTestSend(rejected, []).outcome).toBe("rejected");
  });

  it("ignores events belonging to another message", () => {
    expect(pickEvent("msg_1", [
      { id: "x", message_id: "msg_2", event_type: "delivered", status: "processed", error: null, created_at: "1" },
    ])).toBeNull();
  });
});

describe("campaign overview aggregation", () => {
  const account = {
    id: "a1",
    from_email: "jake@acme.com",
    from_name: "Jake",
    paused: false,
    customer_enabled: true,
    status: "verified",
    warmup_status: "active",
  };

  const rows = buildCampaignOverview({
    campaigns: [
      {
        id: "c1",
        name: "SaaS Founder Outreach",
        description: "Founders at seed stage",
        status: "active",
        tags: ["Outbound"],
        created_at: "2026-01-01",
        launched_at: "2026-01-02",
        sending_account_ids: ["a1"],
      },
    ],
    recipients: [
      { campaign_id: "c1", lead_id: "l1" },
      { campaign_id: "c1", lead_id: "l2" },
    ],
    messages: [
      { campaign_id: "c1", status: "sent", to_email: "l1@x.com", opened_at: "2026-01-03" },
      { campaign_id: "c1", status: "sent", to_email: "l2@x.com", bounced_at: "2026-01-03" },
      { campaign_id: "c1", status: "pending", to_email: "l3@x.com" },
    ],
    replies: [
      { campaign_id: "c1", lead_id: "l1", from_email: "l1@x.com", sentiment: "positive" },
      { campaign_id: "c1", lead_id: "l1", from_email: "l1@x.com", sentiment: "neutral" },
    ],
    meetings: [
      { campaign_id: "c1", lead_id: "l1", prospect_email: "l1@x.com", status: "meeting_booked" },
      { campaign_id: "c1", lead_id: "l2", prospect_email: "l2@x.com", status: "open" },
    ],
    accounts: [account],
  });

  it("counts real leads, sends, deduplicated replies and meetings", () => {
    const row = rows[0]!;
    expect(row.leads).toBe(2);
    expect(row.sent).toBe(2);
    expect(row.reached).toBe(2);
    expect(row.opened).toBe(1);
    expect(row.openRate).toBe(100);
    expect(row.replies).toBe(1);
    expect(row.positiveReplies).toBe(1);
    expect(row.meetings).toBe(1);
    // People-based: the only reachable person (l2 bounced) replied = 100%.
    expect(row.replyRate).toBeCloseTo(100);
    expect(row.account?.from_email).toBe("jake@acme.com");
  });

  it("shows a mailbox as online only when it can actually send", () => {
    expect(accountOnline(account)).toBe(true);
    expect(accountOnline({ ...account, paused: true })).toBe(false);
    expect(accountOnline({ ...account, status: "failed" })).toBe(false);
    expect(accountOnline(null)).toBe(false);
  });

  it("reports a failed campaign when every message failed", () => {
    expect(deriveDisplayStatus("active", 0, 3)).toBe("failed");
    expect(deriveDisplayStatus("active", 5, 1)).toBe("active");
    expect(deriveDisplayStatus("paused", 0, 0)).toBe("paused");
  });

  it("merges real analytics without losing today's configured send data", () => {
    const row = { ...rows[0]!, sentToday: 12, dailyCap: 700 };
    applyCampaignRollup([row], [
      {
        campaign_id: "c1",
        leads: 120,
        sent: 100,
        reached: 95,
        opened: 65,
        bounced: 5,
        failed: 0,
        replied: 8,
        positive_replied: 3,
      },
    ]);

    expect(row.sentToday).toBe(12);
    expect(row.dailyCap).toBe(700);
    expect(row.reached).toBe(95);
    expect(row.openRate).toBeCloseTo(68.4);
  });
});

describe("unresolved variable report", () => {
  const lead = {
    email: "alex@acme.io",
    first_name: "Alex",
    company: null,
    custom_fields: {},
  } as never;

  it("labels the source of each variable", () => {
    const report = variableResolutionReport(
      "Hi {{first_name}}",
      "About {{company}} and {{industry | your space}}",
      lead,
      [],
    );
    const byToken = Object.fromEntries(report.map((r) => [r.token, r]));
    expect(byToken["first_name"]!.source).toBe("lead");
    expect(byToken["company"]!.source).toBe("missing");
    expect(byToken["industry"]!.source).toBe("fallback");
    expect(byToken["first_name"]!.where).toEqual(["subject"]);
  });

  it("uses custom variable defaults when the lead has no value", () => {
    const report = variableResolutionReport("", "{{offer}}", lead, [
      { token: "offer", defaultValue: "a demo" } as never,
    ]);
    expect(report[0]!.source).toBe("custom_default");
    expect(report[0]!.value).toBe("a demo");
  });
});

describe("A/B campaign variable rendering", () => {
  const variants = [
    {
      id: "variant-b",
      subject: "For {{company}}",
      body: "Hi {{first_name | there}} — about {{offer | your outreach}}",
      weight: 50,
    },
  ];

  it("selects the same variant deterministically for the same recipient and step", () => {
    const first = selectCampaignVariant(variants, "recipient-1", "step-1");
    const second = selectCampaignVariant(variants, "recipient-1", "step-1");
    expect(second?.id ?? null).toBe(first?.id ?? null);
  });

  it("resolves lead and custom-field variables in selected variant copy", () => {
    const rendered = renderEmailForLead(variants[0]!, {
      email: "anas@example.com",
      first_name: "Anas",
      company: "MunchReach",
      custom_fields: { offer: "outbound campaigns" },
    });
    expect(rendered).toEqual({
      subject: "For MunchReach",
      body: "Hi Anas — about outbound campaigns",
    });
  });

  it("keeps the original as the remainder of a weighted split", () => {
    const selected = Array.from({ length: 200 }, (_, index) =>
      selectCampaignVariant(variants, `recipient-${index}`, "step-1"),
    );
    expect(selected.some((variant) => variant === null)).toBe(true);
    expect(selected.some((variant) => variant?.id === "variant-b")).toBe(true);
  });
});
