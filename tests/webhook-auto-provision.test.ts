import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INBOUND_WEBHOOK_EVENTS } from "@/lib/email-providers/webhook-provision.server";

const verification = readFileSync("src/lib/domain-verification.server.ts", "utf8");
const card = readFileSync("src/lib/domain-readiness-customer.server.ts", "utf8");

describe("automatic reply-delivery webhook", () => {
  it("covers delivery, bounce, open, click and inbound reply events", () => {
    expect([...INBOUND_WEBHOOK_EVENTS]).toEqual([
      "email.received",
      "email.delivered",
      "email.bounced",
      "email.opened",
      "email.clicked",
      "email.complained",
    ]);
  });

  it("is provisioned from the single flow that makes a domain ready", () => {
    expect(verification).toContain("ensureInboundWebhook");
    expect(verification).toContain('if (stage === "ready")');
    // The stored infrastructure credential must be used, never a bare call.
    expect(verification).toContain("credentials: provider.credentials");
  });

  it("surfaces a failed registration on the Webhooks card", () => {
    expect(card).toContain("getWebhookProvisionState");
    expect(card).toContain('webhook = { state: "failed", detail: provisioned.detail }');
  });
});
