import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { cleanReplyAddress, tokenFromAddress } from "../src/lib/inbound-routing.server";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("clean Reply-To routing", () => {
  it("strips internal plus tokens from visible reply addresses", () => {
    expect(cleanReplyAddress("michaeltuckman+abc123@trysmartoutreach.cloud")).toBe(
      "michaeltuckman@trysmartoutreach.cloud",
    );
    expect(tokenFromAddress("michaeltuckman@trysmartoutreach.cloud")).toBeNull();
  });

  it("does not pass tokenized routing addresses into campaign or inbox sends", () => {
    const dispatch = read("src/lib/dispatch.server.ts");
    const compose = read("src/lib/inbox-compose.server.ts");
    const reply = read("src/lib/inbox-send.server.ts");
    const testSend = read("src/lib/campaigns.functions.ts");
    const providers = read("src/lib/provider-credentials.server.ts");

    for (const source of [dispatch, compose, reply, testSend]) {
      expect(source).not.toContain("replyTo = await mintRequiredReplyAddress");
      expect(source).not.toContain("Routed reply address:");
      // Providers stamp Message-ID themselves and refuse a supplied one.
      expect(source).not.toContain('"Message-ID": messageIdHeader');
    }
    // Threading still rides on the RFC reply headers.
    expect(reply).toContain('"In-Reply-To"');
    expect(providers).toContain("isReservedOutboundHeader");
    expect(dispatch).toContain("mintCleanReplyAddress(account.from_email");
    expect(reply).toContain("mintCleanReplyAddress(account.from_email");
    expect(compose).toContain("replyRoute.visibleAddress");
    expect(providers).toContain("sanitizeHeaders");
    expect(providers).toContain("Headers: postmarkHeaders");
    expect(providers).toContain("h:${name}");
  });
});