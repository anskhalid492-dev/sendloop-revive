import { describe, expect, it } from "vitest";
import {
  classifyWebhookStatus,
  evaluateWebhookEntries,
  INBOUND_WEBHOOK_PATH,
} from "../webhook-status.server";

const hook = (endpoint: string, status: string) => ({
  id: "wh_1",
  endpoint,
  status,
  events: ["email.received"],
});

const URL_OK = `https://munchreach.com${INBOUND_WEBHOOK_PATH}?token=abc`;

describe("provider webhook readiness", () => {
  it("classifies status strings", () => {
    expect(classifyWebhookStatus("enabled")).toBe("enabled");
    expect(classifyWebhookStatus("Disabled")).toBe("disabled");
    expect(classifyWebhookStatus("")).toBe("unknown");
    expect(classifyWebhookStatus("weird")).toBe("unknown");
  });

  it("is ready when an enabled webhook points at the inbound endpoint", () => {
    expect(evaluateWebhookEntries([hook(URL_OK, "enabled")]).state).toBe("ok");
  });

  it("ignores webhooks pointing elsewhere", () => {
    expect(evaluateWebhookEntries([hook("https://other.example/x", "enabled")]).state).toBe(
      "failed",
    );
  });

  it("is not ready when every matching webhook is disabled", () => {
    expect(evaluateWebhookEntries([hook(URL_OK, "disabled")]).state).toBe("failed");
  });

  it("is pending when the status cannot be interpreted", () => {
    expect(evaluateWebhookEntries([hook(URL_OK, "mystery")]).state).toBe("pending");
  });

  it("is ready when at least one matching webhook is enabled", () => {
    expect(
      evaluateWebhookEntries([hook(URL_OK, "disabled"), hook(URL_OK, "enabled")]).state,
    ).toBe("ok");
  });
});
