import { describe, expect, it } from "vitest";

import {
  SUPPORT_RATING_LABEL,
  isRateableStatus,
  summarizeSupportRatings,
} from "@/lib/support-rating";

describe("support satisfaction ratings", () => {
  it("labels every star value", () => {
    expect(SUPPORT_RATING_LABEL[1]).toBe("Very Poor");
    expect(SUPPORT_RATING_LABEL[3]).toBe("Okay");
    expect(SUPPORT_RATING_LABEL[5]).toBe("Excellent");
  });

  it("only invites ratings on resolved or closed tickets", () => {
    expect(isRateableStatus("resolved")).toBe(true);
    expect(isRateableStatus("closed")).toBe(true);
    expect(isRateableStatus("open")).toBe(false);
    expect(isRateableStatus(null)).toBe(false);
  });

  it("returns an empty summary with no ratings", () => {
    const summary = summarizeSupportRatings([], 4);
    expect(summary.averageRating).toBe(0);
    expect(summary.totalRated).toBe(0);
    expect(summary.responseRate).toBe(0);
    expect(summary.percentages[5]).toBe(0);
  });

  it("computes average, distribution, percentages and response rate", () => {
    const summary = summarizeSupportRatings(
      [{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 1 }],
      8,
    );
    expect(summary.totalRated).toBe(4);
    expect(summary.averageRating).toBe(3.75);
    expect(summary.distribution[5]).toBe(2);
    expect(summary.distribution[4]).toBe(1);
    expect(summary.distribution[1]).toBe(1);
    expect(summary.percentages[5]).toBe(50);
    expect(summary.percentages[4]).toBe(25);
    expect(summary.responseRate).toBe(50);
  });

  it("ignores out-of-range values", () => {
    const summary = summarizeSupportRatings([{ rating: 0 }, { rating: 6 }, { rating: 3 }]);
    expect(summary.totalRated).toBe(1);
    expect(summary.averageRating).toBe(3);
    expect(summary.responseRate).toBe(100);
  });
});
