import { describe, expect, it, vi } from "vitest";

import { buildOpenToken, classifyOpenRequest, parseOpenToken } from "@/lib/open-tracking";
import { readPixelToken } from "@/routes/api/public/open";

const target = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  messageKind: "campaign" as const,
  messageId: "22222222-2222-2222-2222-222222222222",
};

describe("pixel token reading", () => {
  const token = buildOpenToken(target);
  it("reads a normal token", () => {
    expect(readPixelToken(new URL(`https://x.test/api/public/open?t=${encodeURIComponent(token)}`))).toBe(token);
  });
  it("tolerates a mangled parameter name and stray characters", () => {
    expect(readPixelToken(new URL(`https://x.test/api/public/open?t+=${token}`))).toBe(token);
    expect(parseOpenToken(readPixelToken(new URL(`https://x.test/o?t=${token}%20`)))).not.toBeNull();
  });
  it("still rejects a forged or missing token", () => {
    expect(parseOpenToken(readPixelToken(new URL(`https://x.test/o?t=${token.slice(0, -2)}xx`)))).toBeNull();
    expect(readPixelToken(new URL("https://x.test/o"))).toBe("");
  });
});

describe("Google automated scanner", () => {
  it("flags Google-range fetches with a spoofed browser agent as machine opens", () => {
    expect(
      classifyOpenRequest({
        ip: "66.249.89.10",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246",
      }),
    ).toEqual({ isPrefetch: true, source: "google_automated_scan" });
  });
  it("keeps Gmail's image proxy (a reader opening) as a real open", () => {
    expect(classifyOpenRequest({ ip: "66.249.84.1", userAgent: "Mozilla/5.0 (via ggpht.com GoogleImageProxy)" }).isPrefetch).toBe(false);
  });
});

describe("recording surfaces write failures", () => {
  it("reports write_failed instead of pretending the open was stored", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client.server", () => {
      const row = { id: target.messageId, workspace_id: target.workspaceId, campaign_id: null, lead_id: null, sending_account_id: null, to_email: "a@x.test", opened_at: null, open_count: 0 };
      const from = (table: string) => {
        const b: any = {
          select: () => b, eq: () => b, update: () => b, upsert: async () => ({ error: null }),
          maybeSingle: async () => ({ data: row, error: null }),
          insert: async () => (table === "email_open_events" ? { error: { message: "timeout" } } : { error: null }),
          then: (r: any) => Promise.resolve({ error: null }).then(r),
        };
        return b;
      };
      return { supabaseAdmin: { from } };
    });
    const { recordOpenHit } = await import("@/lib/open-tracking.server");
    const res = await recordOpenHit({ target, ip: "84.1.1.1", userAgent: "Mozilla/5.0" });
    expect(res).toMatchObject({ recorded: false, reason: "write_failed" });
    vi.doUnmock("@/integrations/supabase/client.server");
  });
});
