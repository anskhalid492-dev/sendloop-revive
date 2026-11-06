import { describe, expect, it } from "vitest";
import { classifyReplySource, countsAsCampaignReply, dedupeNotifications } from "./reply-source";

describe("reply source", () => {
  it("warmup reply via threading header, never counted as campaign reply", () => {
    const s = classifyReplySource({ campaignMessageId: null, warmupMatched: true, isAutoReply: true });
    expect(s).toBe("warmup_reply");
    expect(countsAsCampaignReply(s)).toBe(false);
  });
  it("warmup evidence wins even if a campaign link exists", () => {
    expect(classifyReplySource({ campaignMessageId: "m1", warmupMatched: true, isAutoReply: false })).toBe("warmup_reply");
  });
  it("campaign reply counts toward metrics", () => {
    const s = classifyReplySource({ campaignMessageId: "m1", warmupMatched: false, isAutoReply: false });
    expect(s).toBe("campaign_reply");
    expect(countsAsCampaignReply(s)).toBe(true);
  });
  it("attributed OOO is still a campaign reply", () => {
    expect(classifyReplySource({ campaignMessageId: "m1", warmupMatched: false, isAutoReply: true })).toBe("campaign_reply");
  });
  it("unlinked auto reply is Auto Reply, not campaign", () => {
    const s = classifyReplySource({ campaignMessageId: null, warmupMatched: false, isAutoReply: true });
    expect(s).toBe("auto_reply");
    expect(countsAsCampaignReply(s)).toBe(false);
  });
  it("unknown source is Other Incoming Email", () => {
    expect(classifyReplySource({ campaignMessageId: null, warmupMatched: false, isAutoReply: false })).toBe("other");
  });
  it("duplicate notifications for the same event collapse", () => {
    const base = { title: "New reply from a@x.com", message: "Hi", entity_id: "c1" };
    const out = dedupeNotifications([
      { ...base, id: "1", created_at: "2026-11-06T10:00:30Z" },
      { ...base, id: "2", created_at: "2026-11-06T10:00:00Z" },
      { ...base, id: "3", created_at: "2026-11-06T12:00:00Z" },
    ]);
    expect(out.map((n) => n.id)).toEqual(["1", "3"]);
  });
});
