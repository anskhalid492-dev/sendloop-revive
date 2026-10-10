import { describe, it, expect } from "vitest";
import { classifyProspectReply, automaticLeadStatus } from "@/lib/reply-classification";
import { classifyInbound } from "@/lib/inbox-model";

describe("conservative prospect classification", () => {
  it.each(["Yes, tell me more.", "Sounds interesting.", "Please send me the details.", "Can we schedule a call?", "I'd like to learn more."])("classifies explicit interest: %s", body => expect(classifyProspectReply(body).category).toBe("positive"));
  it.each(["No thanks.", "Not interested.", "We don't need this."])("classifies clear rejection: %s", body => expect(classifyProspectReply(body).category).toBe("negative"));
  it.each(["Please remove me.", "Stop contacting me."])("compliance outranks interest: %s", body => expect(classifyProspectReply(`Sounds interesting. ${body}`).category).toBe("unsubscribe"));
  it.each(["Thanks.", "Who are you?"])("classifies neutral reply: %s", body => expect(classifyProspectReply(body).category).toBe("neutral"));
  it.each(["OK", "Sure", "Maybe interested", "Not really interested", "I'm in marketing", "What does this cost?"])("does not guess ambiguous interest: %s", body => expect(classifyProspectReply(body)).toMatchObject({ category: "unclassified", needsReview: true, confidence: null }));
  it("does not classify the outbound subject", () => expect(classifyInbound("Interested in learning more?", "Who are you?")).toBeNull());
  it("ignores HTML quoted outbound content", () => expect(classifyProspectReply('<p>Thanks.</p><blockquote>Tell me more, I am interested</blockquote>').category).toBe("neutral"));
  it("never treats automated replies as interest", () => expect(classifyProspectReply("Sounds interesting", { "Auto-Submitted": "auto-replied" }).category).toBe("out_of_office"));
  it("classifies out of office separately", () => expect(classifyProspectReply("I am out of office until Monday").category).toBe("out_of_office"));
  it.each(["completed", "meeting", "not_interested", "unsubscribed", "paused"])("preserves protected human status %s", status => expect(automaticLeadStatus(status, "interested")).toBe(status));
  it("promotes a new contact only for clear interest", () => expect(automaticLeadStatus("new", "interested")).toBe("interested"));
  it("always honors an opt-out even on a won contact", () => expect(automaticLeadStatus("completed", "unsubscribed")).toBe("unsubscribed"));
});