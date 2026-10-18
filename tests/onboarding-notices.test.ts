import { describe, expect, it } from "vitest";
import { onboardingDecision, ONBOARDING_GAP_MS } from "@/lib/transactional/engagement";
const base = { event: "onboarding.mailbox_ready", active: true, optedOut: false, connected: 1, leads: 0, campaigns: 0, now: Date.parse("2026-10-18T20:00:00Z") };
describe("onboarding policy — isolated engagement-test fixture only", () => {
  it("requires successfully connected mailbox", () => expect(onboardingDecision({ ...base, connected: 0 })).toBe("cancel"));
  it("cancels mailbox reminder once leads exist", () => expect(onboardingDecision({ ...base, leads: 1 })).toBe("cancel"));
  it("cancels campaign prompt once campaign exists", () => expect(onboardingDecision({ ...base, event: "onboarding.leads_imported", leads: 1, campaigns: 1 })).toBe("cancel"));
  it("requires actual saved leads", () => expect(onboardingDecision({ ...base, event: "onboarding.leads_imported", leads: 0 })).toBe("cancel"));
  it("excludes suspended/deleted accounts", () => expect(onboardingDecision({ ...base, active: false })).toBe("cancel"));
  it("honors email opt-out", () => expect(onboardingDecision({ ...base, optedOut: true })).toBe("cancel"));
  it("defers notices within 24 hours of previous notice", () => expect(onboardingDecision({ ...base, lastNoticeAt: new Date(base.now - ONBOARDING_GAP_MS + 1).toISOString() })).toBe("defer"));
  it("allows relevant notice at full 24-hour boundary", () => expect(onboardingDecision({ ...base, lastNoticeAt: new Date(base.now - 86400000).toISOString() })).toBe("send"));
});