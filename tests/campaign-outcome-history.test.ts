import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("isolated throwaway campaign history migration", () => {
  it("is rerunnable, logs changed states once, preserves original rows and refuses history rewrites", async () => {
    const db = new PGlite();
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE TYPE public.app_role AS ENUM ('admin','user');
      CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE FUNCTION public.is_workspace_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE TABLE public.campaign_messages(id uuid primary key,workspace_id uuid,campaign_id uuid,status text,delivery_status text,last_error text,sent_at timestamptz,delivered_at timestamptz,bounced_at timestamptz,failed_at timestamptz);
      INSERT INTO public.campaign_messages(id,workspace_id,campaign_id,status) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','scheduled');`);
    const sql = readFileSync("supabase/manual/campaign-outcome-history.sql", "utf8");
    await db.exec(sql); await db.exec(sql);
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.campaign_message_status_history")).rows[0]?.count).toBe(0);
    await db.exec("UPDATE public.campaign_messages SET status='processing'; UPDATE public.campaign_messages SET status='processing'; UPDATE public.campaign_messages SET status='failed',last_error='send_outcome_unknown_after_interrupt';");
    const history = await db.query<{ old_status: string; new_status: string }>("SELECT old_status,new_status FROM public.campaign_message_status_history ORDER BY id");
    expect(history.rows).toEqual([{ old_status: "scheduled", new_status: "processing" }, { old_status: "processing", new_status: "failed" }]);
    await expect(db.exec("UPDATE public.campaign_message_status_history SET new_status='sent'")).rejects.toThrow("append-only");
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.campaign_messages")).rows[0]?.count).toBe(1);
    await db.close();
  });
});