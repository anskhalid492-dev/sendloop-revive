import { describe, expect, it } from "vitest";

import { PRICING_COMPARISON } from "@/lib/pricing-comparison";

describe("pricing comparison catalog", () => {
  it("uses customer-facing email account terminology", () => {
    const labels = PRICING_COMPARISON.flatMap((category) => category.rows.map((row) => row.label));
    expect(labels).toContain("Email accounts");
    expect(labels.some((label) => /sending domains?/i.test(label))).toBe(false);
  });

  it("covers every requested product area", () => {
    expect(PRICING_COMPARISON.map((category) => category.name)).toEqual([
      "Workspace & Account",
      "Leads & Contacts",
      "Campaigns & Sequences",
      "Email Accounts & Sending",
      "AI & Personalization",
      "Inbox & CRM",
      "Analytics",
      "Mailboxes",
      "Integrations",
      "Support & Billing",
    ]);
  });

  it("keeps pricing rows tied to existing entitlement keys and plan columns", () => {
    const labels = PRICING_COMPARISON.flatMap((category) => category.rows.map((row) => row.label));
    expect(labels).toEqual(expect.arrayContaining([
      "Workspaces",
      "Team members",
      "Stored leads",
      "Monthly email sends",
      "Email accounts",
      "AI Writer",
      "Mailbox warmup",
      "Unified inbox",
      "CRM pipeline",
      "API access",
    ]));
  });

  it("contains no duplicate rows within a category", () => {
    for (const category of PRICING_COMPARISON) {
      const labels = category.rows.map((row) => row.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});