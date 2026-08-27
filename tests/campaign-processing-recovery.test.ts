import { describe, expect, test } from "vitest";
import { completeAcceptedProcessingMessages } from "@/lib/dispatch.server";

type Row = Record<string, unknown>;

/** Minimal PostgREST-shaped stub: enough for the recovery query chain. */
function client(tables: Record<string, Row[]>, updates: Row[]) {
  const make = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const api: any = {
      select: () => api,
      eq: (col: string, value: unknown) => {
        rows = rows.filter((r) => r[col] === value);
        return api;
      },
      is: (col: string, value: unknown) => {
        rows = rows.filter((r) => (r[col] ?? null) === value);
        return api;
      },
      in: (col: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[col]));
        return api;
      },
      lte: () => api,
      limit: () => api,
      update: (patch: Row) => {
        const chain: any = {
          eq: (col: string, value: unknown) => {
            rows = rows.filter((r) => r[col] === value);
            chain.then = undefined;
            if (col === "status") {
              for (const r of rows) updates.push({ id: r["id"], ...patch });
            }
            return chain;
          },
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return chain;
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return api;
  };
  return { from: (table: string) => make(table) } as never;
}

const old = "2026-08-25T10:00:00.000Z";
const now = new Date("2026-08-27T12:00:00.000Z");

describe("processing -> sent recovery", () => {
  test("accepted send is completed with its provider ids", async () => {
    const updates: Row[] = [];
    const db = client(
      {
        campaign_messages: [
          { id: "m1", campaign_id: "c1", status: "processing", sent_at: null, created_at: old },
        ],
      },
      updates,
    );
    const registry = client(
      {
        outbound_messages: [
          {
            ref_table: "campaign_messages",
            ref_id: "m1",
            provider_message_id: "pm-1",
            provider: "resend",
            created_at: old,
          },
        ],
      },
      [],
    );
    const repaired = await completeAcceptedProcessingMessages(db, "c1", now, registry);
    expect(repaired).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "m1",
      status: "sent",
      provider_message_id: "pm-1",
      sent_at: old,
    });
  });

  test("failed/unaccepted send is never promoted to sent", async () => {
    const updates: Row[] = [];
    const db = client(
      {
        campaign_messages: [
          { id: "m2", campaign_id: "c1", status: "processing", sent_at: null, created_at: old },
        ],
      },
      updates,
    );
    const registry = client({ outbound_messages: [] }, []);
    expect(await completeAcceptedProcessingMessages(db, "c1", now, registry)).toBe(0);
    expect(updates).toHaveLength(0);
  });

  test("already sent messages are not touched, so stats cannot double-count", async () => {
    const updates: Row[] = [];
    const db = client(
      {
        campaign_messages: [
          { id: "m3", campaign_id: "c1", status: "sent", sent_at: old, created_at: old },
        ],
      },
      updates,
    );
    const registry = client(
      {
        outbound_messages: [
          { ref_table: "campaign_messages", ref_id: "m3", provider_message_id: "pm-3", provider: "resend", created_at: old },
        ],
      },
      [],
    );
    expect(await completeAcceptedProcessingMessages(db, "c1", now, registry)).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
