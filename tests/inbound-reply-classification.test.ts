import { describe, expect, it } from "vitest";

import { classifyInbound, isAutoReplyHeaders, replySentimentFor } from "@/lib/inbox-model";
import { computeCampaignStats } from "@/lib/campaign-stats";

/**
 * Reply != positive reply. Every genuine inbound response has to count as a
 * reply; only real interest counts as a positive one.
 */
describe("inbound reply classification", () => {
  it("treats a real away message as an out-of-office reply, never as interest", () => {
    const detected = classifyInbound(
      "Re: quick question",
      "I am away from my email during the day. I will respond to you as soon as possible. Thank you! Pat",
    );
    expect(detected).toBe("ooo");
    expect(replySentimentFor(detected)).toBe("out_of_office");
  });

  it("detects auto replies from headers even when the wording is unusual", () => {
    expect(isAutoReplyHeaders({ "Auto-Submitted": "auto-replied" })).toBe(true);
    expect(isAutoReplyHeaders({ Precedence: "bulk" })).toBe(true);
    expect(isAutoReplyHeaders({ "Auto-Submitted": "no" })).toBe(false);
    expect(classifyInbound("Re: hi", "Back Monday.", { "Auto-Submitted": "auto-generated" })).toBe(
      "ooo",
    );
  });

  it.each([
    "Interested",
    "I want to know more",
    "Yes, send me more information",
    "Sounds good",
    "Tell me more",
    "Let's discuss this",
    "Can you send me more information?",
    "I'd be interested in learning more",
  ])("classifies %s as positive", (body) => {
    expect(classifyInbound("Re: intro", body)).toBe("interested");
    expect(replySentimentFor(classifyInbound("Re: intro", body))).toBe("positive");
  });

  it.each(["Not interested, thanks", "No thanks", "We're all set", "Please don't contact me again"])(
    "classifies %s as not a positive reply",
    (body) => {
      const detected = classifyInbound("Re: intro", body);
      expect(detected === "not_interested" || detected === "unsubscribed").toBe(true);
      expect(replySentimentFor(detected)).toBe("negative");
    },
  );

  it.each([
    "Please remove me from your list",
    "Unsubscribe",
    "Stop emailing me",
    "Remove me",
  ])("treats %s as an opt-out", (body) => {
    expect(classifyInbound("Re: intro", body)).toBe("unsubscribed");
  });

  it("does not mistake a bounce for a reply intent", () => {
    expect(classifyInbound("Undeliverable: intro", "Address not found")).toBe("bounced");
  });
});

describe("campaign reply metrics", () => {
  const sent = (id: string, recipient: string) => ({
    id,
    campaign_id: "c1",
    recipient_id: recipient,
    lead_id: recipient,
    step_order: 1,
    status: "sent",
    sent_at: "2026-09-10T09:00:00.000Z",
    updated_at: "2026-09-10T09:00:00.000Z",
  });

  it("counts a stored reply even when the send row was never flagged", () => {
    const stats = computeCampaignStats({
      campaignId: "c1",
      leads: 2,
      messages: [sent("m1", "r1"), sent("m2", "r2")],
      replyLeadKeys: ["r1"],
      outOfOfficeReplied: 1,
    });
    expect(stats.sent).toBe(2);
    expect(stats.replied).toBe(1);
    expect(stats.positiveReplied).toBe(0);
    expect(stats.outOfOfficeReplied).toBe(1);
  });

  it("never counts the same contact twice across message and reply rows", () => {
    const flagged = { ...sent("m1", "r1"), replied_at: "2026-09-10T10:00:00.000Z" };
    const stats = computeCampaignStats({
      campaignId: "c1",
      leads: 1,
      messages: [flagged],
      replyLeadKeys: ["r1"],
      positiveReplied: 1,
    });
    expect(stats.replied).toBe(1);
    expect(stats.positiveReplied).toBe(1);
  });
});

describe("quoted campaign footer", () => {
  const quoted = [
    "Yes, let's talk. How about Tuesday?",
    "",
    "On Tue, Sep 9, 2026 at 10:00 AM Sam <sam@munchreach.com> wrote:",
    "> Hi there, quick question about your packaging needs.",
    "> Unsubscribe: https://munchreach.com/api/public/unsubscribe?t=abc",
  ].join("\n");

  it("a positive reply quoting our unsubscribe footer stays interested", () => {
    expect(classifyInbound("Re: Packaging", quoted)).toBe("interested");
  });

  it("a real opt-out is still detected", () => {
    expect(classifyInbound("Re: Packaging", "Please unsubscribe me from this list.")).toBe(
      "unsubscribed",
    );
    expect(classifyInbound("Re: Packaging", "Unsubscribe")).toBe("unsubscribed");
  });
});

describe("unsubscribe phrasings", () => {
  it.each([
    "Please unsubscribe.",
    "Unsubscribe please",
    "unsubscribe from your list",
    "Please unsubscribe this address from this mailing",
    "I would like to unsubscribe",
  ])("treats %s as an opt-out", (body) => {
    expect(classifyInbound("Re: intro", body)).toBe("unsubscribed");
  });

  it("still ignores our own quoted footer", () => {
    const body = [
      "Yes, sounds great — let's talk Tuesday.",
      "",
      "On Tue, Sep 9, 2026 at 10:00 AM Sam <sam@munchreach.com> wrote:",
      "> Unsubscribe: https://munchreach.com/api/public/unsubscribe?t=abc",
    ].join("\n");
    expect(classifyInbound("Re: Packaging", body)).toBe("interested");
  });
});
