import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const db = new PGlite();
const originalId = "00000000-0000-4000-8000-000000000029";
let before: Record<string, unknown>;
beforeAll(async () => {
  await db.exec(`CREATE TABLE plans(id uuid PRIMARY KEY, slug text UNIQUE, name text, billing_type text, one_time_price int, max_leads int, max_emails_monthly int, compare_at_price int, description text, tagline text, created_at timestamptz, updated_at timestamptz, max_users int, max_sending_accounts int, api_access boolean, max_warmup_daily int, future_limit int);
    CREATE TABLE plan_features(id uuid DEFAULT gen_random_uuid(), plan_id uuid, category text, name text, included boolean, value text, sort_order int, feature_key text);
    CREATE TABLE billing_plan_prices(plan_id uuid, external_price_id text);
    INSERT INTO plans VALUES('${originalId}','lifetime','Original','lifetime',9900,20000,15000,56400,'existing','existing',now(),now(),2,10,true,50,77);
    INSERT INTO plan_features(plan_id,category,name,included,value,sort_order,feature_key) VALUES('${originalId}','core','Campaigns',true,NULL,1,'campaigns'),('${originalId}','core','SSO',false,NULL,2,'sso');
    INSERT INTO billing_plan_prices VALUES('${originalId}','price_test_original_unchanged');`);
  before = (await db.query<Record<string, unknown>>("SELECT * FROM plans WHERE slug='lifetime'")).rows[0];
  await db.exec(readFileSync("supabase/manual/lifetime-starter.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
describe("isolated additive Lifetime Starter data", () => {
  it("sets 4,000 contacts", async () => { expect((await db.query("SELECT max_leads FROM plans WHERE slug='lifetime-starter'")).rows[0]).toEqual({ max_leads: 4000 }); });
  it("sets 10,000 emails/month", async () => { expect((await db.query("SELECT max_emails_monthly FROM plans WHERE slug='lifetime-starter'")).rows[0]).toEqual({ max_emails_monthly: 10000 }); });
  it("sets $29 one-time", async () => { expect((await db.query("SELECT one_time_price,billing_type FROM plans WHERE slug='lifetime-starter'")).rows[0]).toEqual({ one_time_price: 2900, billing_type: "lifetime" }); });
  it("preserves all other limits including future columns", async () => { const rows = await db.query("SELECT max_users,max_sending_accounts,api_access,max_warmup_daily,future_limit FROM plans ORDER BY slug"); expect(rows.rows[0]).toEqual(rows.rows[1]); expect(rows.rows[1]).toEqual({ max_users: 2, max_sending_accounts: 10, api_access: true, max_warmup_daily: 50, future_limit: 77 }); });
  it("preserves original plan byte-for-byte", async () => { expect((await db.query("SELECT * FROM plans WHERE slug='lifetime'")).rows[0]).toEqual(before); });
  it("does not copy or change Stripe mappings", async () => { expect((await db.query("SELECT * FROM billing_plan_prices")).rows).toEqual([{ plan_id: originalId, external_price_id: "price_test_original_unchanged" }]); });
  it("copies feature inclusions and exclusions", async () => { const rows = await db.query("SELECT included,feature_key FROM plan_features WHERE plan_id <> $1 ORDER BY sort_order", [originalId]); expect(rows.rows).toEqual([{ included: true, feature_key: "campaigns" }, { included: false, feature_key: "sso" }]); });
});