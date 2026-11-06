import { describe, expect, it } from "vitest";
import { applySentPatch } from "@/lib/dispatch.server";

type Call = { patch: Record<string, unknown>; id: string };

function client(failMissingColumn: boolean) {
  const calls: Call[] = [];
  const supabase = { from() { return { update(patch: Record<string, unknown>) {
    let id = "";
    const chain: any = {
      eq: (col: string, value: string) => { if (col === "id") id = value; return chain; },
      is: () => chain,
      select: async () => {
        calls.push({ patch, id });
        if (failMissingColumn && "message_id" in patch) return { data: null, error: { code: "42703", message: "column campaign_messages.message_id does not exist" } };
        return { data: [{ id }], error: null };
      },
    };
    return chain;
  } }; } } as never;
  return { supabase, calls };
}

const patch = {
  status: "sent",
  sent_at: "2026-01-01T00:00:00.000Z",
  provider: "resend",
  provider_message_id: "prov-1",
  message_id: "<rfc@munchreach.com>",
  message_type: "campaign",
  last_error: null,
  attempts: 1,
};

describe("applySentPatch", () => {
  it("marks the message sent in a single write when all columns exist", async () => {
    const { supabase, calls } = client(false);
    await expect(applySentPatch(supabase, "msg-1", { ...patch })).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.patch.status).toBe("sent");
    expect(calls[0]?.patch.provider_message_id).toBe("prov-1");
  });

  it("retries without optional columns so acceptance is never lost", async () => {
    const { supabase, calls } = client(true);
    await expect(applySentPatch(supabase, "msg-2", { ...patch })).resolves.toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.patch).not.toHaveProperty("message_id");
    expect(calls[1]?.patch.status).toBe("sent");
    expect(calls[1]?.patch.sent_at).toBe(patch.sent_at);
    expect(calls[1]?.patch.provider_message_id).toBe("prov-1");
  });
});
