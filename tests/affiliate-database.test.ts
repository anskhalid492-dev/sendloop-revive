import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite();
const affiliate = '00000000-0000-4000-8000-00000000a001';
const customer = '00000000-0000-4000-8000-00000000a002';
const workspace = '00000000-0000-4000-8000-00000000a003';
const profile = '00000000-0000-4000-8000-00000000a004';
const attribution = '00000000-0000-4000-8000-00000000a005';
async function payment(n: number, kind = 'monthly', action = 'payment', overrides = {}) {
  const input = { eventKey: `affiliate-test:event-${n}`, paymentKey: `stripe:live:affiliate-test-payment-${n}`, environment: 'live', paymentId: `affiliate-test-payment-${n}`, workspaceId: workspace, kind, periodKey: `affiliate-test-period-${n}`, paidCents: 12000, eligibleCents: 10000, currency: 'usd', paidAt: Math.floor(Date.now()/1000), action, ...overrides };
  return (await db.query<{result: {status:string}}>('select process_affiliate_payment($1::jsonb) result', [JSON.stringify(input)])).rows[0].result;
}
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('affiliate_test.admin',true)='true',false) $$;
    CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE TABLE workspaces(id uuid PRIMARY KEY,owner_id uuid); CREATE TABLE workspace_members(workspace_id uuid,user_id uuid);`);
  // Isolated empty schema, no network or customer fixtures.
  await db.exec(readFileSync('supabase/migrations/20260819205430_8a2bdd86-3ebc-472c-8606-872188208135.sql','utf8').replace("GRANT EXECUTE ON FUNCTION public.ensure_referral_profile() TO authenticated, service_role;", "GRANT EXECUTE ON FUNCTION public.ensure_referral_profile() TO authenticated, service_role;"));
  for (const file of readdirSync('supabase/migrations').filter((f) => f.startsWith('20261018')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`INSERT INTO workspaces VALUES('${workspace}','${customer}'); INSERT INTO referral_profiles(id,user_id,code,status) VALUES('${profile}','${affiliate}','AFFTEST001','active'); INSERT INTO referral_attributions(id,referral_profile_id,referrer_user_id,referred_user_id,code,expires_at) VALUES('${attribution}','${profile}','${affiliate}','${customer}','AFFTEST001',now()+interval '60 days'); UPDATE referral_programs SET enabled=true,operational_verified_at=now(),payout_provider_configured=true,approval_mode='auto',approval_delay_days=0,minimum_payout_cents=100;`);
}, 30000);
afterAll(() => db.close());
describe('affiliate transactional ledger — named throwaway account fixtures only', () => {
  it('creates commission from net eligible payment', async () => { expect(await payment(1)).toEqual({status:'commission_created'}); expect((await db.query('select commission_amount_cents from referral_commissions')).rows[0]).toEqual({commission_amount_cents:3000}); });
  it('deduplicates repeated event', async () => expect(await payment(1)).toEqual({status:'duplicate'}));
  it('deduplicates two event IDs for the same payment', async () => expect(await payment(1,'monthly','payment',{eventKey:'affiliate-test:invoice-payment-succeeded'})).toEqual({status:'duplicate_payment'}));
  it('creates first 12 periods but never a thirteenth', async () => { for(let n=2;n<=12;n++) expect((await payment(n)).status).toBe('commission_created'); expect((await payment(13)).status).toBe('ignored'); expect((await db.query('select count(*)::int n from referral_commissions')).rows[0]).toEqual({n:12}); });
  it('pays lifetime at 20%', async () => { expect((await payment(20,'lifetime')).status).toBe('commission_created'); expect((await db.query("select commission_amount_cents from referral_commissions where payment_id='affiliate-test-payment-20'")).rows[0]).toEqual({commission_amount_cents:2000}); });
  it('pays annual once, not renewals', async () => { expect((await payment(30,'annual')).status).toBe('commission_created'); expect((await payment(31,'annual')).status).toBe('ignored'); });
  it('adjusts exactly the refunded payment while suspended and disabled', async () => { await db.exec(`UPDATE referral_profiles SET status='suspended'; UPDATE referral_programs SET enabled=false;`); expect((await payment(1,'monthly','adjust',{eventKey:'affiliate-test:partial-refund',refundedCents:6000})).status).toBe('adjusted'); expect((await db.query("select reversed_cents from referral_commissions where payment_id='affiliate-test-payment-1'")).rows[0]).toEqual({reversed_cents:1500}); await db.exec(`UPDATE referral_profiles SET status='active'; UPDATE referral_programs SET enabled=true;`); });
  it('rejects self-owned workspaces', async () => { await db.exec(`UPDATE workspaces SET owner_id='${affiliate}';`); expect((await payment(50)).status).toBe('ignored'); await db.exec(`UPDATE workspaces SET owner_id='${customer}';`); });
  it('requires admin for payout review', async () => { await expect(db.query("select review_affiliate_payout(gen_random_uuid(),'paid','test-ref','test')")).rejects.toThrow('Forbidden'); });
  it('settles only the requested amount and records allocation', async () => { await db.exec(`SELECT set_config('request.jwt.claim.sub','${affiliate}',false);`); const p = (await db.query<{id:string}>("select (request_referral_payout(1000,'paypal','affiliate-test@example.invalid')).id")).rows[0]; await db.exec("SELECT set_config('affiliate_test.admin','true',false)"); await db.query("select review_affiliate_payout($1,'paid','affiliate-test-payment-reference','Test review')",[p.id]); expect((await db.query('select sum(settled_cents)::int n from referral_commissions')).rows[0]).toEqual({n:1000}); expect((await db.query('select sum(amount_cents)::int n from affiliate_payout_allocations')).rows[0]).toEqual({n:1000}); });
  it('denies browser payment processing and private table reads', async () => { expect((await db.query("select has_function_privilege('anon','process_affiliate_payment(jsonb)','execute') allowed")).rows[0]).toEqual({allowed:false}); expect((await db.query("select has_column_privilege('authenticated','referral_attributions','referred_user_id','select') allowed")).rows[0]).toEqual({allowed:false}); });
  it('test annual earnings do not consume live first-payment eligibility or spendable balance', async () => {
    await db.exec(`UPDATE referral_programs SET operational_verified_at=NULL,enabled=false;`);
    expect((await payment(70,'annual','payment',{environment:'test',paymentKey:'stripe:test:affiliate-test-70'})).status).toBe('commission_created');
    expect((await db.query('select sum(settled_cents)::int n from referral_commissions')).rows[0]).toEqual({n:1000});
    await db.exec(`UPDATE referral_programs SET operational_verified_at=now(),enabled=true;`);
  });
});