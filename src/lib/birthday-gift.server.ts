/**
 * Birthday gift automation (server only).
 *
 * Runs inside the EXISTING transactional email cron cycle — there is no second
 * scheduler. Every cycle:
 *   1. reads profiles that have a birthday,
 *   2. keeps the ones whose birthday is "today" in their own timezone,
 *   3. claims the gift with a unique (user_id, gift_year) ledger row, so a
 *      birthday can only ever be gifted once per year,
 *   4. grants one free month through the existing plan-grant billing layer,
 *   5. emits the Birthday Gift system email through the existing queue.
 *
 * Nothing here throws: a failed gift must never break the email runner.
 */
import { addOneMonth, giftYear, isBirthdayToday, localDate } from "@/lib/birthday-gift";

export const BIRTHDAY_GIFT_EVENT_KEY = "account.birthday_gift";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type ProfileRow = {
  id: string;
  email: string | null;
  timezone: string | null;
  birthday: string | null;
};

async function resolveGiftPlan(db: Db, workspaceId: string | null) {
  // Prefer whatever plan the workspace already runs on, so the gift is a free
  // month of their own tier rather than a downgrade or an unexpected upgrade.
  if (workspaceId) {
    const { data: sub } = await db
      .from("billing_subscriptions")
      .select("plan_id")
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planId = (sub as { plan_id?: string } | null)?.plan_id;
    if (planId) {
      const { data: plan } = await db.from("plans").select("id, name, slug").eq("id", planId).maybeSingle();
      if (plan) return plan as { id: string; name: string; slug: string };
    }
  }
  // Fall back to the cheapest paid plan (free trial plan excluded).
  const { data: plans } = await db
    .from("plans")
    .select("id, name, slug, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const list = (plans ?? []) as { id: string; name: string; slug: string }[];
  return list.find((p) => p.slug !== "free" && p.slug !== "lifetime") ?? list[0] ?? null;
}

/** Grants (or extends) one free month using the existing plan_grants layer. */
async function grantFreeMonth(db: Db, workspaceId: string, now: Date) {
  const { data: existing } = await db
    .from("plan_grants")
    .select("id, plan_id, expires_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = existing as { id: string; plan_id: string; expires_at: string | null } | null;

  if (current) {
    // Never create a second subscription/grant — extend the live one instead.
    if (current.expires_at === null) {
      const { data: plan } = await db.from("plans").select("name").eq("id", current.plan_id).maybeSingle();
      return {
        grantId: current.id,
        planId: current.plan_id,
        planName: (plan as { name?: string } | null)?.name ?? "your plan",
        expiresAt: null as string | null,
      };
    }
    const base = new Date(Math.max(Date.parse(current.expires_at), now.getTime()));
    const expiresAt = addOneMonth(base).toISOString();
    const { error } = await db
      .from("plan_grants")
      .update({ expires_at: expiresAt, reason: `Birthday gift — 1 month free (${giftYear(now)})` })
      .eq("id", current.id);
    if (error) throw new Error(error.message);
    const { data: plan } = await db.from("plans").select("name").eq("id", current.plan_id).maybeSingle();
    return {
      grantId: current.id,
      planId: current.plan_id,
      planName: (plan as { name?: string } | null)?.name ?? "your plan",
      expiresAt,
    };
  }

  const plan = await resolveGiftPlan(db, workspaceId);
  if (!plan) throw new Error("No plan available to grant");
  const expiresAt = addOneMonth(now).toISOString();
  const { data: created, error } = await db
    .from("plan_grants")
    .insert({
      workspace_id: workspaceId,
      plan_id: plan.id,
      status: "active",
      starts_at: now.toISOString(),
      expires_at: expiresAt,
      reason: `Birthday gift — 1 month free (${giftYear(now)})`,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { grantId: (created as { id: string }).id, planId: plan.id, planName: plan.name, expiresAt };
}

export type BirthdayCycleResult = {
  checked: number;
  matched: number;
  gifted: number;
  skipped: number;
  errors: number;
};

/**
 * When the optional birthday schema is absent the cycle disables itself for the
 * life of this worker, so it cannot log the same "column does not exist"
 * database error on every scheduler tick.
 */
let birthdaySchemaMissing = false;

export async function runBirthdayGiftCycle(limit = 200): Promise<BirthdayCycleResult> {
  const result: BirthdayCycleResult = { checked: 0, matched: 0, gifted: 0, skipped: 0, errors: 0 };
  if (birthdaySchemaMissing) return result;
  const now = new Date();

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  // `birthday_gifts` and `profiles.birthday` are created by
  // supabase/manual/birthday-gift.sql, which is applied outside the generated
  // type file; this ledger client is intentionally untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ledger = (db as any).from.bind(db) as (table: string) => any;

  const { data, error } = await ledger("profiles")
    .select("id, email, timezone, birthday")
    .not("birthday", "is", null)
    .limit(5000);

  // The birthday column is added by supabase/manual/birthday-gift.sql; until it
  // exists the automation simply does nothing.
  if (error) {
    // 42703 = undefined_column: the optional schema is not installed.
    if ((error as { code?: string }).code === "42703") birthdaySchemaMissing = true;
    return result;
  }


  const profiles = (data ?? []) as unknown as ProfileRow[];
  result.checked = profiles.length;

  for (const profile of profiles) {
    if (result.gifted >= limit) break;
    if (!isBirthdayToday(profile.birthday, now, profile.timezone)) continue;
    result.matched += 1;

    const tz = profile.timezone ?? "UTC";
    const year = giftYear(now, tz);
    const today = localDate(now, tz);
    const giftDate = `${String(today.year).padStart(4, "0")}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

    // Workspace owned by the customer, if any.
    const { data: workspace } = await db
      .from("workspaces")
      .select("id")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const workspaceId = (workspace as unknown as { id?: string } | null)?.id ?? null;

    // Claim the gift first: the unique (user_id, gift_year) index makes this
    // the single source of truth against duplicates and concurrent runs.
    const { data: claimed, error: claimError } = await ledger("birthday_gifts")
      .insert({
        user_id: profile.id,
        workspace_id: workspaceId,
        gift_year: year,
        gift_date: giftDate,
        timezone: tz,
        email_to: profile.email,
      })
      .select("id")
      .single();

    if (claimError || !claimed) {
      result.skipped += 1;
      continue;
    }
    const giftId = (claimed as { id: string }).id;

    let planName = "your plan";
    let expiresAt: string | null = null;
    try {
      if (!workspaceId) throw new Error("No workspace to grant");
      const grant = await grantFreeMonth(db, workspaceId, now);
      planName = grant.planName;
      expiresAt = grant.expiresAt;
      await ledger("birthday_gifts")
        .update({
          granted: true,
          plan_id: grant.planId,
          plan_grant_id: grant.grantId,
          grant_expires_at: grant.expiresAt,
        })
        .eq("id", giftId);
    } catch (grantError) {
      result.errors += 1;
      await ledger("birthday_gifts")
        .update({ granted: false, grant_error: String((grantError as Error)?.message ?? grantError) })
        .eq("id", giftId);
    }

    try {
      const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
      await emitTransactionalEvent({
        eventKey: BIRTHDAY_GIFT_EVENT_KEY,
        userId: profile.id,
        to: profile.email,
        workspaceId,
        idempotencyKey: `${BIRTHDAY_GIFT_EVENT_KEY}:${profile.id}:${year}`,
        variables: {
          "plan.name": planName,
          "gift.expires_at": expiresAt ? expiresAt.slice(0, 10) : "your renewal date",
        },
        immediate: true,
      });
      await ledger("birthday_gifts").update({ email_status: "queued" }).eq("id", giftId);
    } catch {
      await ledger("birthday_gifts").update({ email_status: "failed" }).eq("id", giftId);
    }

    result.gifted += 1;
  }

  return result;
}
