import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal in-memory stand-in for the manual_send_claims table. */
type Row = { id: string; workspace_id: string; send_key: string; status: string; result: unknown; updated_at: string };
const rows: Row[] = [];
let insertError: { message: string } | null = null;

function table() {
  const filters: Record<string, string> = {};
  const api: Record<string, unknown> = {
    insert: (row: Partial<Row>) => {
      if (insertError) return Promise.resolve({ error: insertError });
      const clash = rows.some(
        (r) => r.workspace_id === row.workspace_id && r.send_key === row.send_key,
      );
      if (clash) return Promise.resolve({ error: { message: "duplicate key value" } });
      rows.push({
        id: crypto.randomUUID(),
        workspace_id: row.workspace_id!,
        send_key: row.send_key!,
        status: row.status ?? "in_progress",
        result: null,
        updated_at: new Date().toISOString(),
      });
      return Promise.resolve({ error: null });
    },
    select: () => api,
    eq: (column: string, value: string) => {
      filters[column] = value;
      return api;
    },
    maybeSingle: () => {
      const found = rows.find((r) =>
        Object.entries(filters).every(([key, value]) => (r as never as Record<string, string>)[key] === value),
      );
      return Promise.resolve({ data: found ?? null, error: null });
    },
    update: (patch: Partial<Row>) => ({
      eq: (column: string, value: string) => {
        filters[column] = value;
        const target = {
          eq: (c2: string, v2: string) => {
            filters[c2] = v2;
            for (const row of rows) {
              if (
                Object.entries(filters).every(
                  ([key, val]) => (row as never as Record<string, string>)[key] === val,
                )
              )
                Object.assign(row, patch, { updated_at: new Date().toISOString() });
            }
            return Promise.resolve({ error: null });
          },
        };
        // Support both `.eq().eq()` and a single `.eq()` (by id).
        for (const row of rows) {
          if (
            Object.entries(filters).every(
              ([key, val]) => (row as never as Record<string, string>)[key] === val,
            )
          )
            Object.assign(row, patch, { updated_at: new Date().toISOString() });
        }
        return Object.assign(Promise.resolve({ error: null }), target);
      },
    }),
    delete: () => ({
      eq: (column: string, value: string) => {
        filters[column] = value;
        const target = {
          eq: (c2: string, v2: string) => {
            filters[c2] = v2;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              const row = rows[index]!;
              if (
                Object.entries(filters).every(
                  ([key, val]) => (row as never as Record<string, string>)[key] === val,
                )
              )
                rows.splice(index, 1);
            }
            return Promise.resolve({ error: null });
          },
        };
        return Object.assign(Promise.resolve({ error: null }), target);
      },
    }),
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => table() },
}));

const { claimManualSend } = await import("@/lib/manual-send-idempotency.server");

describe("manual send exactly-once guard", () => {
  beforeEach(() => {
    rows.length = 0;
    insertError = null;
  });

  it("lets the first request send", async () => {
    const claim = await claimManualSend<{ id: string }>("ws-1", "key-1", "compose");
    expect(claim.proceed).toBe(true);
  });

  it("returns the first result to a replayed request instead of sending again", async () => {
    const first = await claimManualSend<{ id: string }>("ws-1", "key-1", "compose");
    if (!first.proceed) throw new Error("expected to proceed");
    await first.finish({ id: "message-1" });

    const replay = await claimManualSend<{ id: string }>("ws-1", "key-1", "compose");
    expect(replay.proceed).toBe(false);
    if (replay.proceed) throw new Error("unreachable");
    expect(replay.result).toEqual({ id: "message-1" });
  });

  it("allows a genuine retry after a failed attempt", async () => {
    const first = await claimManualSend<{ id: string }>("ws-1", "key-1", "compose");
    if (!first.proceed) throw new Error("expected to proceed");
    await first.release();

    const retry = await claimManualSend<{ id: string }>("ws-1", "key-1", "compose");
    expect(retry.proceed).toBe(true);
  });

  it("keeps different attempts and workspaces independent", async () => {
    const a = await claimManualSend<{ id: string }>("ws-1", "key-1", "compose");
    const b = await claimManualSend<{ id: string }>("ws-1", "key-2", "compose");
    const c = await claimManualSend<{ id: string }>("ws-2", "key-1", "reply");
    expect([a.proceed, b.proceed, c.proceed]).toEqual([true, true, true]);
  });

  it("never blocks a send when the claim store itself is unavailable", async () => {
    insertError = { message: "relation \"manual_send_claims\" does not exist" };
    const claim = await claimManualSend<{ id: string }>("ws-1", "key-9", "compose");
    expect(claim.proceed).toBe(true);
  });
});
