import { describe, expect, it } from "vitest";
import { buildFunnelSteps } from "@/components/analytics/ConversionFunnel";

describe("buildFunnelSteps", () => {
  it("measures opens and replies against sent when delivery is unconfirmed", () => {
    const steps = buildFunnelSteps({ sent: 200, delivered: null, opens: 5, replies: 2 });
    const opens = steps.find((s) => s.key === "opens");
    const replies = steps.find((s) => s.key === "replies");
    expect(steps.some((s) => s.key === "delivered")).toBe(false);
    expect(opens?.prev).toBe(200);
    expect(replies?.prev).toBe(200);
  });

  it("measures opens and replies against delivered when confirmed", () => {
    const steps = buildFunnelSteps({ sent: 200, delivered: 180, opens: 5, replies: 2 });
    expect(steps.find((s) => s.key === "opens")?.prev).toBe(180);
    expect(steps.find((s) => s.key === "replies")?.prev).toBe(180);
  });
});
