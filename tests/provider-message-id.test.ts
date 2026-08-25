import { describe, expect, it } from "vitest";

import { normalizeDelivery, externalIdOf } from "../src/lib/inbound-parse";
import { providerMessageIdCandidates } from "../src/lib/provider-message-id";

describe("provider message id normalization", () => {
  it("extracts the canonical Resend email id from delivery webhooks", () => {
    const payload = {
      type: "email.delivered",
      data: {
        email_id: "735c2891-3c7e-499d-849b-ef7faef2f4eb",
        from: "Michael <anus@verifiedusaleads.com>",
        to: ["prospect@example.com"],
      },
    };

    expect(normalizeDelivery(payload).providerMessageId).toBe("735c2891-3c7e-499d-849b-ef7faef2f4eb");
    expect(externalIdOf(payload, "delivered")).toContain("735c2891-3c7e-499d-849b-ef7faef2f4eb");
  });

  it("normalizes SendGrid webhook ids to the x-message-id stored at send time", () => {
    const candidates = providerMessageIdCandidates("abc123.filterdrecv-6c8f9f99d-xyz-1-65E0CE11-2D.0");

    expect(candidates).toContain("abc123.filterdrecv-6c8f9f99d-xyz-1-65E0CE11-2D.0");
    expect(candidates).toContain("abc123");
    expect(normalizeDelivery({ event: "delivered", sg_message_id: "abc123.filterdrecv-6c8f9f99d-xyz-1-65E0CE11-2D.0" }).providerMessageId).toBe(
      "abc123.filterdrecv-6c8f9f99d-xyz-1-65E0CE11-2D.0",
    );
  });

  it("extracts Mailgun nested RFC Message-ID values", () => {
    const payload = {
      signature: { token: "t" },
      "event-data": {
        event: "delivered",
        recipient: "prospect@example.com",
        message: {
          headers: {
            "message-id": "<20260825.abc123@mg.trysmartoutreach.cloud>",
          },
        },
      },
    };

    expect(normalizeDelivery(payload).providerMessageId).toBe("20260825.abc123@mg.trysmartoutreach.cloud");
    expect(externalIdOf(payload, "delivered")).toContain("20260825.abc123@mg.trysmartoutreach.cloud");
  });
});
