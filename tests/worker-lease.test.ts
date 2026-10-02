import { describe, expect, it } from "vitest";

import { acquireWorkerLease, releaseWorkerLease } from "@/lib/worker-lease.server";
import { retryJitter } from "@/lib/inbound-ops.server";

/** In-memory platform_settings honouring the conditional update + unique insert. */
function fakeSettings() {
  const rows = new Map<string, { token: string; expiresAt: string }>();
  const client = {
    rows,
    from() {
      return {
        update(patch: { value: { token: string; expiresAt: string } }) {
          let key = "";
          let token: string | null = null;
          let onlyExpiredBefore: string | null = null;
          const q: any = {
            eq(col: string, v: string) {
              if (col === "key") key = v;
              else token = v;
              return q;
            },
            or(expr: string) {
              onlyExpiredBefore = /lt\."([^"]+)"/.exec(expr)?.[1] ?? null;
              return q;
            },
            async select() {
              const cur = rows.get(key);
              if (!cur || (onlyExpiredBefore && cur.expiresAt >= onlyExpiredBefore)) return { data: [], error: null };
              rows.set(key, patch.value);
              return { data: [{ key }], error: null };
            },
            then(res: (v: unknown) => void) {
              const cur = rows.get(key);
              if (cur && (!token || cur.token === token)) rows.set(key, patch.value);
              res({ error: null });
            },
          };
          return q;
        },
        async insert(row: { key: string; value: { token: string; expiresAt: string } }) {
          if (rows.has(row.key)) return { error: { code: "23505" } };
          rows.set(row.key, row.value);
          return { error: null };
        },
      };
    },
  };
  return client;
}

describe("worker lease", () => {
  it("only one of two overlapping runs gets the lease", async () => {
    const db = fakeSettings();
    const now = new Date("2026-10-02T12:00:00Z");
    const a = await acquireWorkerLease(db, "w", 60_000, now);
    const b = await acquireWorkerLease(db, "w", 60_000, now);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("a crashed run's lease expires and is taken over", async () => {
    const db = fakeSettings();
    await acquireWorkerLease(db, "w", 60_000, new Date("2026-10-02T12:00:00Z"));
    const later = await acquireWorkerLease(db, "w", 60_000, new Date("2026-10-02T12:02:00Z"));
    expect(later).not.toBeNull();
  });

  it("release frees the lease for the next tick", async () => {
    const db = fakeSettings();
    const now = new Date("2026-10-02T12:00:00Z");
    const a = await acquireWorkerLease(db, "w", 60_000, now);
    await releaseWorkerLease(db, a);
    expect(await acquireWorkerLease(db, "w", 60_000, now)).not.toBeNull();
  });

  it("a stale holder cannot release a lease someone else took over", async () => {
    const db = fakeSettings();
    const old = await acquireWorkerLease(db, "w", 60_000, new Date("2026-10-02T12:00:00Z"));
    const fresh = await acquireWorkerLease(db, "w", 60_000, new Date("2026-10-02T12:02:00Z"));
    await releaseWorkerLease(db, old);
    expect(db.rows.get("w")?.token).toBe(fresh?.token);
  });
});

describe("inbound retry jitter", () => {
  it("is stable per event and stays within ±20%", () => {
    for (const id of ["a", "b", "4f1c-9", "zz-123"]) {
      const j = retryJitter(id);
      expect(j).toBe(retryJitter(id));
      expect(j).toBeGreaterThanOrEqual(0.8);
      expect(j).toBeLessThan(1.2);
    }
  });
});
