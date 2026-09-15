import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PLACEMENT_LABEL } from "@/lib/warmup-model";

const engine = readFileSync("src/lib/warmup-engine.server.ts", "utf8");

describe("warmup placement observability", () => {
  it("only treats a recipient as measurable when its domain receives through us", () => {
    expect(engine).toContain("observableRecipientDomains");
    expect(engine).toContain('.eq("mx_status", "verified")');
  });

  it("records unmeasurable recipients without scoring them as a miss", () => {
    const sweep = engine.slice(engine.indexOf("async function sweepPlacement"));
    const unobservable = sweep.indexOf('placement: "unobservable"');
    const miss = sweep.indexOf("not_received: 1");
    expect(unobservable).toBeGreaterThan(-1);
    expect(unobservable).toBeLessThan(miss);
    expect(sweep).toContain("continue;");
  });

  it("still scores a genuine miss on a measurable recipient", () => {
    expect(engine).toContain('type: "not_received"');
    expect(engine).toContain("warmup:notreceived:");
  });

  it("exposes a label for the new placement", () => {
    expect(PLACEMENT_LABEL.unobservable).toBe("Sent, not measurable");
  });
});
