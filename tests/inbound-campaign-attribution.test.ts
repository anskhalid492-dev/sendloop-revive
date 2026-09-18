import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  decideCampaignAttribution,
  evaluateSecondaryAttribution,
  evidenceForCandidate,
  isForwardedInbound,
  isReplyShaped,
  type InboundShape,
} from "../src/lib/campaign-attribution";
import { classifyInbound, replySentimentFor } from "../src/lib/inbox-model";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const replyShape = (over: Partial<InboundShape> = {}): InboundShape => ({
  subject: "Re: Quick question about your bakery",
  body: "Sure, send over the details.",
  inReplyTo: "send-1@munchreach",
  references: ["send-1@munchreach"],
  ...over,
});

const secondaryBase = {
  shape: replyShape({ inReplyTo: null, references: [] }),
  leadIsCampaignRecipient: true,
  outboundSendExists: true,
  sameSendingAccount: true,
  sentAt: "2026-01-01T10:00:00.000Z",
  receivedAt: "2026-01-02T10:00:00.000Z",
};

describe("campaign attribution — genuine replies", () => {
  it("attributes a reply matched through In-Reply-To", () => {
    const verdict = decideCampaignAttribution({
      headerMatch: { campaignId: "camp-1", via: evidenceForCandidate("send-1@munchreach", "send-1@munchreach") },
    });
    expect(verdict.attributed).toBe(true);
    expect(verdict.evidence).toBe("in_reply_to");
    expect(verdict.campaignId).toBe("camp-1");
  });

  it("attributes a reply matched through References", () => {
    const via = evidenceForCandidate("send-9@munchreach", "unknown-client-id@mail");
    expect(via).toBe("references");
    const verdict = decideCampaignAttribution({ headerMatch: { campaignId: "camp-1", via } });
    expect(verdict.attributed).toBe(true);
    expect(verdict.evidence).toBe("references");
  });

  it("attributes a reply that landed on a per-send routing address", () => {
    const verdict = decideCampaignAttribution({ routeCampaignId: "camp-2" });
    expect(verdict).toMatchObject({ attributed: true, evidence: "reply_route_token", campaignId: "camp-2" });
  });

  it("attributes a header-threaded reply through the campaign thread it landed on", () => {
    const verdict = decideCampaignAttribution({ threadCampaignId: "camp-3" });
    expect(verdict).toMatchObject({ attributed: true, evidence: "thread_message_id" });
  });

  it("attributes a header-less reply from a campaign recipient on the same mailbox", () => {
    const secondary = evaluateSecondaryAttribution({
      ...secondaryBase,
      shape: replyShape({ inReplyTo: null, references: [] }),
    });
    expect(secondary.attributed).toBe(true);
    const verdict = decideCampaignAttribution({ secondary: { campaignId: "camp-4", verdict: secondary } });
    expect(verdict).toMatchObject({ attributed: true, evidence: "campaign_recipient_thread" });
  });
});

describe("campaign attribution — unrelated mailbox email", () => {
  it("does not attribute an unrelated email from an existing CRM contact", () => {
    const secondary = evaluateSecondaryAttribution({
      ...secondaryBase,
      leadIsCampaignRecipient: false,
      outboundSendExists: false,
      shape: replyShape({ subject: "Invoice for March", inReplyTo: null, references: [] }),
    });
    expect(secondary.attributed).toBe(false);
    expect(decideCampaignAttribution({ secondary: { campaignId: null, verdict: secondary } }).attributed).toBe(
      false,
    );
  });

  it("does not attribute on subject similarity alone", () => {
    const secondary = evaluateSecondaryAttribution({
      ...secondaryBase,
      outboundSendExists: false,
      leadIsCampaignRecipient: false,
      shape: replyShape({ subject: "Re: Quick question about your bakery", inReplyTo: null, references: [] }),
    });
    expect(secondary.attributed).toBe(false);
  });

  it("does not attribute a campaign lead with no matching outbound send", () => {
    const secondary = evaluateSecondaryAttribution({ ...secondaryBase, outboundSendExists: false });
    expect(secondary.attributed).toBe(false);
    expect(secondary.reason).toMatch(/No outbound campaign email/i);
  });

  it("does not attribute a forwarded email", () => {
    expect(isForwardedInbound({ subject: "Fwd: Quick question", body: "" })).toBe(true);
    expect(
      isForwardedInbound({ subject: "See this", body: "---------- Forwarded message ---------\nFrom: x" }),
    ).toBe(true);
    const secondary = evaluateSecondaryAttribution({
      ...secondaryBase,
      shape: replyShape({ subject: "Fwd: Quick question", inReplyTo: null, references: [] }),
    });
    expect(secondary.attributed).toBe(false);
    expect(secondary.reason).toMatch(/forward/i);
  });

  it("does not attribute a brand new unrelated message with no reply relationship", () => {
    const shape = replyShape({ subject: "Partnership idea", inReplyTo: null, references: [] });
    expect(isReplyShaped(shape)).toBe(false);
    expect(evaluateSecondaryAttribution({ ...secondaryBase, shape }).attributed).toBe(false);
  });

  it("does not attribute a reply that arrived on a different mailbox, or outside the window", () => {
    expect(
      evaluateSecondaryAttribution({ ...secondaryBase, sameSendingAccount: false }).attributed,
    ).toBe(false);
    expect(
      evaluateSecondaryAttribution({
        ...secondaryBase,
        sentAt: "2025-01-01T10:00:00.000Z",
      }).attributed,
    ).toBe(false);
  });

  it("returns no campaign and a reason when nothing matched", () => {
    const verdict = decideCampaignAttribution({});
    expect(verdict).toMatchObject({ attributed: false, campaignId: null, evidence: null });
    expect(verdict.reason.length).toBeGreaterThan(0);
  });
});

describe("classification of attributed replies", () => {
  it("marks an interested campaign reply as a positive reply", () => {
    const detected = classifyInbound("Re: quick question", "Sounds interesting, let's book a call");
    expect(detected).toBe("interested");
    expect(replySentimentFor(detected)).toBe("positive");
  });

  it("counts an out-of-office campaign reply as a reply but not a positive reply", () => {
    const detected = classifyInbound("Automatic reply: Out of office", "I am out of the office until Monday");
    expect(detected).toBe("ooo");
    expect(replySentimentFor(detected)).toBe("out_of_office");
  });

  it("treats an unsubscribe campaign reply as a reply that suppresses the contact", () => {
    const detected = classifyInbound("Re: quick question", "Please unsubscribe me from this list");
    expect(detected).toBe("unsubscribed");
    expect(read("src/lib/inbox.server.ts")).toContain("email_suppressions");
  });
});

describe("inbound ingestion boundary", () => {
  const source = read("src/lib/inbox.server.ts");

  it("decides attribution once, with the shared rule", () => {
    expect(source).toContain("decideCampaignAttribution");
    expect(source).toContain("evaluateSecondaryAttribution");
  });

  it("gates CRM and campaign side effects on attribution", () => {
    expect(source).toContain("if (attribution.attributed) {\n    await applyReplyAutomation({");
    expect(source).toContain("attribution.attributed && !leadId");
  });

  it("no longer attributes on an unqualified newest-send-to-this-address fallback", () => {
    expect(source).not.toContain("const { data: anyWorkspace }");
    expect(source).toContain("findCampaignMessageByHeaders");
    expect(source).toContain("findCampaignMessageBySender");
  });

  it("keeps duplicate protection so one inbound message is processed once", () => {
    expect(source).toContain('.eq("message_id", messageId)');
    expect(source).toContain('status: "duplicate"');
  });

  it("still stores unrelated mailbox mail as a normal inbox message", () => {
    expect(source).toContain("conversation_messages");
    expect(source).toContain("Unrelated mailbox mail stays a plain inbox message");
  });
});
