import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Entire database exists in local memory; no customer accounts/network.
const db = new PGlite();
const accountA = "00000000-0000-4000-8000-000000000001";
const accountB = "00000000-0000-4000-8000-000000000002";
const job = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE sending_accounts(id uuid PRIMARY KEY, paused boolean DEFAULT false, customer_enabled boolean DEFAULT true, status text DEFAULT 'verified');
    CREATE TABLE warmup_settings(id uuid PRIMARY KEY, sending_account_id uuid UNIQUE, enabled boolean DEFAULT true, paused_by_system boolean DEFAULT false);
    CREATE TABLE warmup_jobs(id uuid PRIMARY KEY, sending_account_id uuid, status text DEFAULT 'processing', processed_at timestamptz);
    INSERT INTO sending_accounts(id) VALUES ('${accountA}'),('${accountB}');
    INSERT INTO warmup_settings(id,sending_account_id) VALUES ('${accountA}','${accountA}');`);
  await db.exec(readFileSync("supabase/manual/automatic-mailbox-warmup.sql", "utf8"));
  await db.exec(`INSERT INTO warmup_settings(id,sending_account_id) VALUES ('${accountB}','${accountB}');`);
}, 30000);
afterAll(() => db.close());
async function create(n: number, account = accountB) { await db.query("INSERT INTO warmup_jobs(id,sending_account_id) VALUES ($1,$2)", [job(n), account]); }
async function reserve(n: number, limit = 1) { const result = await db.query<{ allowed: boolean }>("SELECT reserve_mailbox_warmup_send($1,$2) AS allowed", [job(n), limit]); return result.rows[0]?.allowed; }
describe("atomic per-mailbox warmup reservations", () => {
  it("retains existing settings in legacy mode and makes only new settings automatic", async () => {
    const result = await db.query<{ progression_mode: string }>("SELECT progression_mode FROM warmup_settings ORDER BY id");
    expect(result.rows.map(r => r.progression_mode)).toEqual(["legacy", "automatic"]);
  });
  it("duplicate execution of a job reserves exactly once", async () => { await create(1); expect(await Promise.all([reserve(1), reserve(1)])).toEqual([true, false]); });
  it("concurrent worker jobs cannot exceed the daily limit", async () => { await create(2); await create(3); expect(await Promise.all([reserve(2), reserve(3)])).toEqual([false, false]); });
  it("keeps each mailbox allowance independent", async () => { await create(4, accountA); expect(await reserve(4)).toBe(true); });
  it("unknown/failed attempts retain a slot and never count as successes", async () => {
    await db.exec(`UPDATE warmup_jobs SET status='failed' WHERE id='${job(1)}';`);
    expect(await reserve(2)).toBe(false);
    const result = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM warmup_jobs WHERE status='sent'"); expect(result.rows[0]?.count).toBe(0);
  });
  it("new UTC day ignores yesterday's slots without resetting history", async () => {
    await db.exec(`UPDATE warmup_jobs SET send_reserved_at=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 second' WHERE id='${job(1)}';`);
    expect(await reserve(2)).toBe(true);
    const result = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM warmup_jobs"); expect(result.rows[0]?.count).toBe(4);
  });
  it("rechecks a manually lowered limit at the atomic boundary", async () => {
    await db.exec(`UPDATE warmup_settings SET progression_mode='manual',manual_daily_limit=1 WHERE id='${accountB}';`);
    expect(await reserve(3, 30)).toBe(false);
  });
  it("paused mailbox cannot reserve regardless of requested limit", async () => {
    await create(5, accountA); await db.exec(`UPDATE warmup_settings SET paused_by_system=true WHERE id='${accountA}';`);
    expect(await reserve(5, 400)).toBe(false);
  });
});