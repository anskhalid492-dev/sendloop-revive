import { describe, expect, it } from "vitest";

import { compareMxRecords, type MxComparison } from "@/lib/email-providers/inbound";

/**
 * Mirrors `bestMxComparison` in domain-readiness.server.ts: while an MX change
 * propagates, one recursive resolver can still serve the pre-change delegation
 * from its cache. The most advanced view must win, otherwise a live, correct
 * zone is reported to the customer as a DNS conflict.
 */
const RANK: Record<MxComparison["state"], number> = {
  correct: 6,
  incorrect: 5,
  mixed: 4,
  third_party: 3,
  no_mx: 2,
  unknown_requirements: 1,
  unresolved: 0,
};

function best(sets: Array<Array<{ priority: number | null; host: string }>>, required: Array<{ priority: number | null; host: string }>) {
  return sets
    .map((current) => compareMxRecords({ current, required }))
    .reduce((a, b) => (RANK[b.state] > RANK[a.state] ? b : a));
}

const required = [
  { priority: 10, host: "mx1.maileroo.com" },
  { priority: 20, host: "mx2.maileroo.com" },
];

describe("resolver disagreement during MX propagation", () => {
  it("prefers the resolver that already serves the live records", () => {
    const stale = [
      { priority: 5, host: "mx1.hostinger.com" },
      { priority: 10, host: "mx2.hostinger.com" },
    ];
    const fresh = [
      { priority: 10, host: "mx1.maileroo.com" },
      { priority: 20, host: "mx2.maileroo.com" },
    ];
    expect(best([stale, fresh], required).state).toBe("correct");
    expect(best([fresh, stale], required).state).toBe("correct");
  });

  it("still reports a genuine conflict when every resolver agrees", () => {
    const stale = [{ priority: 5, host: "mx1.hostinger.com" }];
    expect(best([stale, stale], required).state).toBe("third_party");
  });
});
