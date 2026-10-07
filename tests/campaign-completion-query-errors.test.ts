import { describe, expect, it } from "vitest";
import { finalizeCampaignIfDrained } from "@/lib/dispatch.server";

/** Every query fails like a statement timeout: no count, no rows, an error. */
function failingClient() {
  const updates: unknown[] = [];
  const chain = (): any =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then")
            return (resolve: (v: unknown) => void) =>
              resolve({ data: null, count: null, error: { message: "canceling statement due to statement timeout" } });
          if (prop === "update") return (v: unknown) => (updates.push(v), chain());
          return () => chain();
        },
      },
    );
  return { client: { from: () => chain() }, updates };
}

describe("campaign completion never trusts a failed check", () => {
  it("does not complete a campaign when the queue counts time out", async () => {
    const { client, updates } = failingClient();
    expect(await finalizeCampaignIfDrained(client as never, "c1")).toBe(false);
    expect(updates).toEqual([]);
  });
});
