import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ops = readFileSync("src/lib/inbound-ops.server.ts", "utf8");
const route = readFileSync("src/routes/api/public/inbound/email.ts", "utf8");

describe("stalled inbound replies", () => {
  it("sweeps events recorded but never processed", () => {
    expect(ops).toContain(`.in("status", ["failed", "retrying", "pending"])`);
    expect(ops).toContain("STALLED_GRACE_MS");
  });

  it("keeps filing alive after the webhook is acknowledged", () => {
    expect(route).toContain("keepAlive");
    expect(route).toContain("settleWithin");
    // Filing must never be fire-and-forget without a platform keep-alive.
    expect(route).toContain("if (!detached)");
  });
});
