import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  runTransactionalQueue, recoverStaleSending, isUnknownOutcome, retryDelayMs, transactionalJobKey,
  shouldRecheckProvider, MARK_CLAIMED, MARK_PROVIDER_CALL, OUTCOME_UNKNOWN_STATUS, STALE_SENDING_MS,
  PROVIDER_RECHECK_MS, TX_SEND_CONCURRENCY, TRANSACTIONAL_WORKER,
  type TransactionalEngine, type DeliverOutcome,
} from "@/lib/transactional-queue.server";
import { sendResendEmail } from "@/lib/email-providers/resend-send.server";
import { parseWorkerMode } from "@/lib/worker-mode.server";

/* ------------------------------------------------------------ fake DB */
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, opts: { failUpdatesFor?: (patch: Row) => boolean } = {}) {
  let clock = 1_800_000_000_000;
  const bg = (tables["background_jobs"] ??= []);
  tables["worker_health"] ??= [];
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: { kind: "select" | "update" | "insert" | "upsert"; patch?: Row } = { kind: "select" };
    let lim = Infinity;
    let orderKey: string | null = null;
    const exec = () => {
      if (op.kind === "insert") {
        const row = op.patch!;
        if (table === "background_jobs" && bg.some((j) => j["worker"] === row["worker"] && j["idempotency_key"] === row["idempotency_key"]))
          return { data: null, error: { code: "23505", message: "dup" } };
        rows.push({ id: `${table}-${rows.length}`, status: "queued", attempts: 0, next_at: 0, ...row });
        return { data: null, error: null };
      }
      if (op.kind === "upsert") {
        const i = rows.findIndex((r) => r["worker"] === op.patch!["worker"]);
        if (i >= 0) rows[i] = { ...rows[i], ...op.patch }; else rows.push({ ...op.patch });
        return { data: null, error: null };
      }
      let hit = rows.filter((r) => filters.every((f) => f(r)));
      if (orderKey) hit = [...hit].sort((a, b) => String(a[orderKey!]).localeCompare(String(b[orderKey!])));
      hit = hit.slice(0, lim);
      if (op.kind === "update") {
        if (opts.failUpdatesFor?.(op.patch!)) return { data: null, error: { message: "db down" } };
        hit.forEach((r) => Object.assign(r, op.patch));
      }
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      update: (patch: Row) => { op = { kind: "update", patch }; return b; },
      insert: (patch: Row) => { op = { kind: "insert", patch }; return b; },
      upsert: (patch: Row) => { op = { kind: "upsert", patch }; return Promise.resolve(exec()); },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
      lt: (k: string, v: string) => { filters.push((r) => String(r[k]) < v); return b; },
      lte: (k: string, v: string) => { filters.push((r) => String(r[k]) <= v); return b; },
      order: (k: string) => { orderKey = k; return b; },
      limit: (n: number) => { lim = n; return b; },
      maybeSingle: () => { const r = exec(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }); },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    };
    return b;
  };
  const client = {
    from,
    async rpc(name: string, args: Row) {
      if (name === "claim_background_jobs") {
        const due = bg.filter((j) => j["worker"] === args["_worker"] &&
          ((j["status"] === "queued" && (j["next_at"] as number) <= clock) || (j["status"] === "running" && (j["lease_until"] as number) < clock)))
          .slice(0, args["_limit"] as number);
        due.forEach((j) => { j["status"] = "running"; j["attempts"] = (j["attempts"] as number) + 1; j["lease_until"] = clock + (args["_lease_seconds"] as number) * 1000; });
        return { data: due, error: null };
      }
      if (name === "finish_background_job") {
        const j = bg.find((x) => x["id"] === args["_id"])!;
        if (args["_ok"]) j["status"] = "succeeded";
        else if ((j["attempts"] as number) >= (j["max_attempts"] as number)) j["status"] = "dead";
        else { j["status"] = "queued"; j["next_at"] = clock + 2 ** (j["attempts"] as number) * 30_000; }
        return { error: null };
      }
      throw new Error(name);
    },
  };
  return { client, tables, now: () => clock, advance: (ms: number) => { clock += ms; } };
}

const iso = (ms: number) => new Date(ms).toISOString();
function email(id: string, over: Row = {}): Row {
  return {
    id, to_email: `${id}@example.com`, from_email: "notifications@munchreach.com", reply_to: null,
    subject: `S ${id}`, html: "<p>x</p>", text_body: "x", status: "queued", attempts: 0, max_attempts: 3,
    next_attempt_at: iso(0), queued_at: iso(Number(id.replace(/\D/g, "") || 0)), updated_at: iso(0), error: null, ...over,
  };
}

const settings = {
  enabled: true, paused: false, test_mode: false, from_name: "MunchReach", from_email: "notifications@munchreach.com",
  reply_to: "support@munchreach.com", retry_count: 3, retry_delay_seconds: 300, batch_size: 25,
};

function engine(over: Partial<TransactionalEngine> & { send?: (row: Row) => Promise<DeliverOutcome> } = {}) {
  const calls: string[] = [];
  let leaseHeld = false;
  const e: TransactionalEngine = {
    getSettings: async () => settings as never,
    deliver: async (_a, row, _s, hooks) => {
      await hooks.beforeProviderCall?.();
      calls.push(row.id);
      return over.send ? over.send(row as never) : { ok: true, provider: "resend", messageId: `re_${row.id}`, statusCode: 200 };
    },
    acquireLease: async () => { if (leaseHeld) return null; leaseHeld = true; return { t: 1 }; },
    releaseLease: async () => { leaseHeld = false; },
    registerOutbound: async () => {},
    recoverProviders: async () => 0,
    ...over,
  };
  return { e, calls, holdLease: () => { leaseHeld = true; } };
}

afterEach(() => vi.restoreAllMocks());

/* ------------------------------------------------------------ tests */
describe("transactional queue — scheduling & claims", () => {
  it("AA/AB: uses background_jobs, one tick per minute, no duplicate scheduler jobs", async () => {
    const db = fakeDb({ transactional_emails: [] });
    const { e } = engine();
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now }); // same minute
    const bg = db.tables["background_jobs"]!;
    expect(bg).toHaveLength(1);
    expect(bg[0]!["worker"]).toBe(TRANSACTIONAL_WORKER);
    expect(bg[0]!["idempotency_key"]).toBe(transactionalJobKey(new Date(db.now())));
    expect(bg[0]!["status"]).toBe("succeeded");
    db.advance(60_000);
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(db.tables["background_jobs"]).toHaveLength(2);
  });

  it("AC: reports worker health", async () => {
    const db = fakeDb({ transactional_emails: [email("e1")] });
    await runTransactionalQueue({ client: db.client, engine: engine().e, now: db.now });
    const h = db.tables["worker_health"]!.find((r) => r["worker"] === "transactional")!;
    expect(h["status"]).toBe("healthy");
    expect(typeof h["last_duration_ms"]).toBe("number");
  });

  it("H/M/Y: sends several emails, each claimed (sending + marker) before the provider call", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2")] });
    const seen: Row[] = [];
    const { e } = engine({
      send: async (row) => {
        seen.push({ ...db.tables["transactional_emails"]!.find((r) => r["id"] === row["id"])! });
        return { ok: true, provider: "resend", messageId: `re_${row["id"]}`, statusCode: 200 };
      },
    });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(s.sent).toBe(2);
    for (const r of seen) { expect(r["status"]).toBe("sending"); expect(r["error"]).toBe(MARK_PROVIDER_CALL); }
    for (const r of db.tables["transactional_emails"]!) {
      expect(r["status"]).toBe("sent");
      expect(r["provider"]).toBe("resend");
      expect(r["provider_message_id"]).toBe(`re_${r["id"]}`);
      expect(r["provider_status_code"]).toBe(200);
      expect(r["error"]).toBeNull();
    }
  });

  it("N: two overlapping workers cannot claim/send the same email", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2"), email("e3")] });
    const shared = engine(); // one lease store → second run is refused
    const [a, b] = await Promise.all([
      runTransactionalQueue({ client: db.client, engine: shared.e, now: db.now }),
      runTransactionalQueue({ client: db.client, engine: shared.e, now: db.now }),
    ]);
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1);
    expect(shared.calls.sort()).toEqual(["e1", "e2", "e3"]);
    // Even without the lease, the per-row conditional claim rejects a second claimant.
    const db2 = fakeDb({ transactional_emails: [email("x1")] });
    const e1 = engine(); const e2 = engine();
    await Promise.all([
      runTransactionalQueue({ client: db2.client, engine: e1.e, now: db2.now }),
      runTransactionalQueue({ client: db2.client, engine: e2.e, now: db2.now }),
    ]);
    expect(e1.calls.length + e2.calls.length).toBe(1);
  });

  it("Z: paused/disabled and lease-held runs do nothing", async () => {
    const db = fakeDb({ transactional_emails: [email("e1")] });
    const held = engine(); held.holdLease();
    const s = await runTransactionalQueue({ client: db.client, engine: held.e, now: db.now });
    expect(s.skipped).toMatch(/in progress/);
    const paused = engine({ getSettings: async () => ({ ...settings, paused: true }) as never });
    expect((await runTransactionalQueue({ client: db.client, engine: paused.e, now: db.now })).skipped).toMatch(/Paused/);
    expect(db.tables["transactional_emails"]![0]!["status"]).toBe("queued");
  });
});

describe("transactional queue — failures, retries, dead", () => {
  it("I/J: one failing email does not block later emails; retry with backoff", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2"), email("e3")] });
    const { e } = engine({
      send: async (row) => row["id"] === "e1"
        ? { ok: false, provider: "resend", statusCode: 422, error: "Provider refused the send [422]" }
        : { ok: true, provider: "resend", messageId: "m", statusCode: 200 },
    });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now, random: () => 0.5 });
    expect(s.sent).toBe(2); expect(s.retried).toBe(1);
    const e1 = db.tables["transactional_emails"]!.find((r) => r["id"] === "e1")!;
    expect(e1["status"]).toBe("retrying");
    expect(Date.parse(e1["next_attempt_at"] as string) - db.now()).toBe(300_000);
    expect(retryDelayMs(300, 2, () => 0.5)).toBe(600_000);
    expect(retryDelayMs(300, 3, () => 0)).toBe(1_200_000 * 0.8);
  });

  it("K: max attempts → failed and stays visible, never resent", async () => {
    const db = fakeDb({ transactional_emails: [email("e1", { attempts: 2, status: "retrying" })] });
    const { e, calls } = engine({ send: async () => ({ ok: false, provider: "resend", statusCode: 403, error: "403 domain" }) });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(s.failed).toBe(1);
    expect(db.tables["transactional_emails"]![0]!["status"]).toBe("failed");
    db.advance(3_600_000);
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(calls).toHaveLength(1);
  });

  it("L: a tick that keeps crashing goes dead after max attempts", async () => {
    const db = fakeDb({ transactional_emails: [] });
    const realFrom = db.client.from;
    (db.client as { from: unknown }).from = (t: string) => {
      if (t === "transactional_emails") throw new Error("boom");
      return realFrom(t);
    };
    const { e } = engine();
    for (let i = 0; i < 3; i += 1) {
      await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
      db.advance(10 * 60_000);
    }
    const tick = db.tables["background_jobs"]![0]!;
    expect(tick["status"]).toBe("dead");
    expect(db.tables["worker_health"]!.find((r) => r["worker"] === "transactional")!["status"]).toBe("degraded");
  });

  it("historical failed rows are never touched", async () => {
    const db = fakeDb({ transactional_emails: [email("old", { status: "failed", error: "Sending infrastructure is not configured." })] });
    const { e, calls } = engine();
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(calls).toHaveLength(0);
    expect(db.tables["transactional_emails"]![0]!["status"]).toBe("failed");
  });
});

describe("transactional queue — crash / timeout safety", () => {
  it("O: crash before the provider call (claimed only) is safely requeued", async () => {
    const db = fakeDb({ transactional_emails: [email("e1", { status: "sending", error: MARK_CLAIMED, updated_at: iso(0) })] });
    const r = await recoverStaleSending(db.client, db.now());
    expect(r).toEqual({ requeued: 1, held: 0 });
    expect(db.tables["transactional_emails"]![0]!["status"]).toBe("retrying");
  });

  it("P/U/V: crash during the send (or legacy stuck row) → outcome_unknown, never resent", async () => {
    const db = fakeDb({ transactional_emails: [
      email("e1", { status: "sending", error: MARK_PROVIDER_CALL, updated_at: iso(0) }),
      email("e2", { status: "sending", error: null, updated_at: iso(0) }), // legacy row
    ] });
    const { e, calls } = engine();
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(s.heldStale).toBe(2);
    expect(calls).toHaveLength(0);
    for (const r of db.tables["transactional_emails"]!) expect(r["status"]).toBe(OUTCOME_UNKNOWN_STATUS);
  });

  it("recent sending rows (live run) are left alone", async () => {
    const db = fakeDb({ transactional_emails: [] });
    db.tables["transactional_emails"]!.push(email("e1", { status: "sending", error: MARK_PROVIDER_CALL, updated_at: iso(db.now() - STALE_SENDING_MS + 1000) }));
    expect(await recoverStaleSending(db.client, db.now())).toEqual({ requeued: 0, held: 0 });
  });

  it("R/F: provider timeout after the request → outcome_unknown, not retried", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2")] });
    const { e, calls } = engine({
      send: async (row) => row["id"] === "e1"
        ? { ok: false, provider: "resend", error: "Could not reach the provider: The operation was aborted due to timeout" }
        : { ok: true, provider: "resend", messageId: "m", statusCode: 200 },
    });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(s.unknown).toBe(1); expect(s.sent).toBe(1);
    expect(db.tables["transactional_emails"]!.find((r) => r["id"] === "e1")!["status"]).toBe(OUTCOME_UNKNOWN_STATUS);
    db.advance(3_600_000);
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(calls.filter((c) => c === "e1")).toHaveLength(1);
  });

  it("C: a definite provider rejection (HTTP status) is a known failure and retries", () => {
    expect(isUnknownOutcome({ ok: false, provider: "resend", statusCode: 403, error: "403" }, true)).toBe(false);
    expect(isUnknownOutcome({ ok: false, provider: null, error: "Resend is currently unavailable" }, false)).toBe(false);
    expect(isUnknownOutcome({ ok: false, provider: "resend", error: "Could not reach the provider: fetch failed" }, true)).toBe(true);
  });

  it("deliver throwing after the provider call → unknown; before it → retry", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2")] });
    const { e } = engine({
      deliver: async (_a, row, _s, hooks) => {
        if (row.id === "e1") throw new Error("lookup failed"); // before call
        await hooks.beforeProviderCall?.();
        throw new Error("socket hang up"); // after call
      },
    });
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    const by = (id: string) => db.tables["transactional_emails"]!.find((r) => r["id"] === id)!;
    expect(by("e1")["status"]).toBe("retrying");
    expect(by("e2")["status"]).toBe(OUTCOME_UNKNOWN_STATUS);
  });

  it("D/E/Q: Resend accepted but the DB update fails → never requeued or resent", async () => {
    const db = fakeDb(
      { transactional_emails: [email("e1")] },
      { failUpdatesFor: (p) => p["status"] === "sent" },
    );
    const { e, calls } = engine();
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(s.sent).toBe(1);
    const row = db.tables["transactional_emails"]![0]!;
    expect(row["status"]).toBe("sending");
    expect(row["error"]).toBe(MARK_PROVIDER_CALL);
    db.advance(STALE_SENDING_MS + 60_000);
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(row["status"]).toBe(OUTCOME_UNKNOWN_STATUS);
    expect(calls).toHaveLength(1);
  });

  it("marker write failure → provider never called, row released for retry", async () => {
    const db = fakeDb({ transactional_emails: [email("e1")] }, { failUpdatesFor: (p) => p["error"] === MARK_PROVIDER_CALL });
    const { e, calls } = engine();
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(calls).toHaveLength(0);
    expect(db.tables["transactional_emails"]![0]!["status"]).toBe("retrying");
  });

  it("G/S/T: budget stops new sends, never interrupts in-flight, leftover stays queued", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => email(`e${i}`));
    const db = fakeDb({ transactional_emails: rows });
    let inFlight = 0; let peak = 0;
    const { e } = engine({
      send: async () => {
        inFlight += 1; peak = Math.max(peak, inFlight);
        db.advance(2_500); await Promise.resolve();
        inFlight -= 1;
        return { ok: true, provider: "resend", messageId: "m", statusCode: 200 };
      },
    });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now, budgetMs: 6_000 });
    expect(s.budgetStop).toBe(true);
    expect(peak).toBeLessThanOrEqual(TX_SEND_CONCURRENCY);
    const queued = db.tables["transactional_emails"]!.filter((r) => r["status"] === "queued");
    expect(queued.length).toBeGreaterThan(0);
    expect(s.sent + queued.length).toBe(10);
    expect(db.tables["transactional_emails"]!.some((r) => r["status"] === "failed")).toBe(false);
    // Subsequent minute runs drain the rest (provider-call cutoff still applies).
    for (let i = 0; i < 5; i += 1) {
      db.advance(60_000);
      await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    }
    expect(db.tables["transactional_emails"]!.every((r) => r["status"] === "sent")).toBe(true);
  });

  it("H: a lease-expired (killed) tick is reclaimed by a later run", async () => {
    const db = fakeDb({ transactional_emails: [] });
    db.tables["background_jobs"]!.push({ id: "bg-x", worker: "transactional", idempotency_key: "transactional:old", status: "running", attempts: 1, max_attempts: 3, lease_until: db.now() - 1 });
    await runTransactionalQueue({ client: db.client, engine: engine().e, now: db.now });
    expect(db.tables["background_jobs"]![0]!["status"]).toBe("succeeded");
    expect(db.tables["background_jobs"]).toHaveLength(1);
  });
});

describe("provider health recovery", () => {
  const enabled = () => true;
  it("W/X: re-checks a down provider only after the cooldown", () => {
    const now = 1_800_000_000_000;
    expect(shouldRecheckProvider({ health_status: "down", last_tested_at: iso(now - 60_000) }, now, enabled)).toBe(false);
    expect(shouldRecheckProvider({ health_status: "down", last_tested_at: iso(now - PROVIDER_RECHECK_MS) }, now, enabled)).toBe(true);
    expect(shouldRecheckProvider({ health_status: "healthy", last_tested_at: null }, now, enabled)).toBe(false);
    expect(shouldRecheckProvider({ health_status: "down", last_tested_at: null }, now, () => false)).toBe(false);
  });

  it("runs the recovery each tick before sending", async () => {
    const db = fakeDb({ transactional_emails: [email("e1")] });
    const order: string[] = [];
    const { e } = engine({
      recoverProviders: async () => { order.push("recheck"); return 1; },
      send: async () => { order.push("send"); return { ok: true, provider: "resend", messageId: "m", statusCode: 200 }; },
    });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(order).toEqual(["recheck", "send"]);
    expect(s.providersRechecked).toBe(1);
  });
});

describe("Resend boundary (real sender, mocked fetch only)", () => {
  const creds = { api_key: "re_test" };
  const msg = { fromName: "MunchReach", fromEmail: "notifications@munchreach.com", replyTo: null, to: "a@example.com", subject: "s", text: "t" };

  it("accepted → provider message id; classified as sent", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "re_123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const r = await sendResendEmail(creds, msg);
    expect(r.ok).toBe(true); expect(r.providerMessageId).toBe("re_123");
    expect(String(f.mock.calls[0]![0])).toBe("https://api.resend.com/emails");
  });

  it("403 rejection → known failure (retry), not unknown", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response('{"message":"not verified"}', { status: 403 }));
    const r = await sendResendEmail(creds, msg);
    expect(r.ok).toBe(false);
    expect(isUnknownOutcome({ ok: false, provider: "resend", statusCode: r.statusCode ?? null, error: r.message }, true)).toBe(false);
  });

  it("network timeout → unknown outcome (no blind resend)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const r = await sendResendEmail(creds, msg);
    expect(r.ok).toBe(false);
    expect(isUnknownOutcome({ ok: false, provider: "resend", statusCode: r.statusCode ?? null, error: r.message }, true)).toBe(true);
  });
});

describe("worker mode selection", () => {
  it("Z: anything but explicit queue stays legacy", () => {
    expect(parseWorkerMode({ transactional: "legacy", campaign: "queue" }, "transactional")).toBe("legacy");
    expect(parseWorkerMode(null, "transactional")).toBe("legacy");
    expect(parseWorkerMode({ transactional: "Queue" }, "transactional")).toBe("legacy");
    expect(parseWorkerMode({ transactional: "queue" }, "transactional")).toBe("queue");
  });
});

/* ------------------------------------------------------------ deadline safety */
import {
  TX_PROVIDER_CALL_CUTOFF_MS, TX_PLATFORM_LIMIT_MS, RESEND_MAX_SEND_MS, TX_POST_SEND_RESERVE_MS,
} from "@/lib/transactional-queue.server";

describe("transactional queue — deadline safety", () => {
  it("cutoff leaves room for a full worst-case Resend send plus bookkeeping", () => {
    expect(TX_PROVIDER_CALL_CUTOFF_MS + RESEND_MAX_SEND_MS + TX_POST_SEND_RESERVE_MS).toBeLessThanOrEqual(TX_PLATFORM_LIMIT_MS);
    expect(TX_PROVIDER_CALL_CUTOFF_MS).toBe(6_000);
  });

  it("slow send near the cutoff finishes normally; later rows stay queued untouched", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2"), email("e3"), email("e4"), email("e5")] });
    const { e, calls } = engine({
      send: async (row) => {
        if (row["id"] === "e1") db.advance(5_900); // pushes clock to near the cutoff
        else db.advance(RESEND_MAX_SEND_MS); // slow send, never interrupted
        return { ok: true, provider: "resend", messageId: `re_${row["id"]}`, statusCode: 200 };
      },
    });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    const rows = db.tables["transactional_emails"]!;
    const sent = rows.filter((r) => r["status"] === "sent").map((r) => r["id"]);
    expect(sent.length).toBe(calls.length);
    expect(new Set(calls).size).toBe(calls.length); // no duplicate send
    expect(calls.length).toBeLessThanOrEqual(TX_SEND_CONCURRENCY);
    const left = rows.filter((r) => r["status"] !== "sent");
    expect(left.length).toBeGreaterThan(0);
    for (const r of left) { expect(r["status"]).toBe("queued"); expect(r["attempts"]).toBe(0); }
    expect(s.budgetStop).toBe(true);
    expect(s.unknown).toBe(0);
  });

  it("a row reaching the provider step after the cutoff is handed back, provider never called", async () => {
    const db = fakeDb({ transactional_emails: [email("e1", { status: "retrying", attempts: 1, error: "prev" })] });
    const { e, calls } = engine();
    // Pre-call setup (provider resolution) is slow and crosses the cutoff.
    const slowSetup: TransactionalEngine = { ...e, deliver: async (a, row, st, hooks) => { db.advance(TX_PROVIDER_CALL_CUTOFF_MS + 1); return e.deliver(a, row, st, hooks); } };
    const s = await runTransactionalQueue({ client: db.client, engine: slowSetup, now: db.now, budgetMs: 60_000 });
    const r = db.tables["transactional_emails"]![0]!;
    expect(calls).toHaveLength(0);
    expect(r["status"]).toBe("retrying");
    expect(r["attempts"]).toBe(1);
    expect(r["error"]).toBe("prev");
    expect(s.deferred).toBe(1);
    expect(s.claimed).toBe(0);
  });

  it("no new work after the safe start window", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2")] });
    const { e, calls } = engine({ recoverProviders: async () => { db.advance(TX_PROVIDER_CALL_CUTOFF_MS); return 0; } });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(calls).toHaveLength(0);
    expect(s.deferred).toBe(2);
    expect(db.tables["transactional_emails"]!.every((r) => r["status"] === "queued" && r["attempts"] === 0)).toBe(true);
  });

  it("deferred rows are sent on the next run exactly once", async () => {
    const db = fakeDb({ transactional_emails: [email("e1"), email("e2"), email("e3"), email("e4")] });
    let slow = true;
    const { e, calls } = engine({ send: async (row) => { if (slow) db.advance(RESEND_MAX_SEND_MS); return { ok: true, provider: "resend", messageId: `re_${row["id"]}`, statusCode: 200 }; } });
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now, budgetMs: 1 });
    slow = false;
    db.advance(60_000);
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(db.tables["transactional_emails"]!.every((r) => r["status"] === "sent")).toBe(true);
    expect([...calls].sort()).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("genuine unknown outcome after the provider was contacted stays outcome_unknown", async () => {
    const db = fakeDb({ transactional_emails: [email("e1")] });
    const { e } = engine({ send: async () => ({ ok: false, provider: "resend", error: "The operation timed out", statusCode: null }) });
    const s = await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(db.tables["transactional_emails"]![0]!["status"]).toBe(OUTCOME_UNKNOWN_STATUS);
    expect(s.unknown).toBe(1);
  });

  it("fast sends still process the full 25-row batch", async () => {
    const db = fakeDb({ transactional_emails: Array.from({ length: 30 }, (_, i) => email(`e${String(i).padStart(2, "0")}`)) });
    const { e, calls } = engine();
    await runTransactionalQueue({ client: db.client, engine: e, now: db.now });
    expect(calls).toHaveLength(25);
  });
});

describe("resend adapter — optional RFC Message-ID read", () => {
  it("system email skips the follow-up read; default still reads", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const base = { fromName: "M", fromEmail: "a@munchreach.com", to: "b@example.com", subject: "s", text: "t" };
    await sendResendEmail({ api_key: "re_x" } as never, { ...base, skipRfcMessageIdLookup: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await sendResendEmail({ api_key: "re_x" } as never, base);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    vi.unstubAllGlobals();
  });
});
