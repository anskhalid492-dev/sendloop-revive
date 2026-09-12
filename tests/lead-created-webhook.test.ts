import { describe, expect, it } from "vitest";

import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_DESCRIPTIONS,
  type WebhookEvent,
} from "@/lib/api/v1/webhooks";
import { OUTBOUND_EVENTS } from "@/lib/api-reference";

describe("lead.created webhook contract", () => {
  it("is a first-class webhook event with a description", () => {
    expect(WEBHOOK_EVENTS).toContain("lead.created");
    expect(WEBHOOK_EVENT_DESCRIPTIONS["lead.created"]).toBeTruthy();
  });

  it("keeps the pre-existing reply events untouched", () => {
    for (const event of ["reply.received", "contact.replied"] as WebhookEvent[]) {
      expect(WEBHOOK_EVENTS).toContain(event);
      expect(WEBHOOK_EVENT_DESCRIPTIONS[event]).toBeTruthy();
    }
  });

  it("documents lead.created as live with the full lead payload", () => {
    const entry = OUTBOUND_EVENTS.find((event) => event.name === "lead.created");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("live");
    const payload = JSON.stringify(entry?.payload ?? {});
    for (const field of [
      "id",
      "email",
      "first_name",
      "last_name",
      "company",
      "job_title",
      "status",
      "lead_source",
      "created_at",
    ]) {
      expect(payload).toContain(field);
    }
  });

  it("every declared event has a description (no drift)", () => {
    for (const event of WEBHOOK_EVENTS) {
      expect(WEBHOOK_EVENT_DESCRIPTIONS[event]).toBeTruthy();
    }
  });
});
