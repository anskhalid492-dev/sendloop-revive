import { describe, expect, it } from "vitest";

import { openRatePercent, replyRatePercent, reachablePeople } from "@/lib/engagement-rates";
import { openRate } from "@/lib/analytics-model";

/**
 * Regression: a multi-step campaign sent 2,872 emails to 1,656 people and 708
 * unique people opened. The open rate must be people-based
 * (708 / (1656 - 10 bounced) ≈ 43%), never emails-based (708 / 2872 ≈ 24.7%).
 */
describe("people-based engagement rates", () => {
  it("divides unique openers by reachable people, not total emails", () => {
    const base = { contacted: 1656, bounced: 10 };
    expect(reachablePeople(base)).toBe(1646);
    expect(openRatePercent(708, base)).toBe(43);
    // The old emails-based bug would have produced 24.7%.
    expect(openRatePercent(708, base)).not.toBe(24.7);
  });

  it("analytics model rows use contacted when present and sent otherwise", () => {
    expect(openRate({ sent: 2872, contacted: 1656, bounced: 10, delivered: 0, opens: 708 })).toBe(43);
    expect(openRate({ sent: 100, delivered: 0, opens: 25 })).toBe(25);
  });

  it("reply rate follows the same people-based rule", () => {
    expect(replyRatePercent(42, { contacted: 1656, bounced: 10 })).toBe(2.6);
  });
});
