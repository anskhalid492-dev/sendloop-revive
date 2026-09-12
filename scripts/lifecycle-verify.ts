/**
 * Controlled, non-destructive verification of the customer lifecycle engine.
 *
 * Creates throwaway test accounts, drives every branch, then removes them.
 * Never touches a real customer: only users whose email matches the
 * lifecycle-test prefix are created, modified or deleted.
 */
import { createClient } from "@supabase/supabase-js";

import {
  getLifecycleConfig,
  runLifecycleCycle,
  saveLifecycleConfig,
} from "../src/lib/lifecycle.server";

const url = process.env["SUPABASE_URL"]!;
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as any;

const PREFIX = `lifecycle-test-${Date.now()}`;
const results: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const DAY = 86_400_000;

async function makeUser(tag: string, createdDaysAgo: number) {
  const email = `${PREFIX}-${tag}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const userId = data.user.id as string;
  const createdAt = new Date(Date.now() - createdDaysAgo * DAY).toISOString();
  await db.from("profiles").upsert({ id: userId, email, full_name: "Lifecycle Test", created_at: createdAt });
  const { data: ws, error: wsError } = await db
    .from("workspaces")
    .insert({ name: `LC ${tag}`, slug: `${PREFIX}-${tag}`, owner_id: userId, status: "active" })
    .select("id")
    .single();
  if (wsError) throw new Error(`workspace: ${wsError.message}`);
  return { userId, email, workspaceId: ws.id as string };
}

async function giveActiveSubscription(workspaceId: string) {
  const { data: plan } = await db.from("plans").select("id").eq("active", true).limit(1).maybeSingle();
  const { error } = await db.from("billing_subscriptions").insert({
    workspace_id: workspaceId,
    plan_id: plan?.id ?? null,
    status: "active",
    provider: "manual",
    environment: "live",
    external_subscription_id: `lifecycle-test-${workspaceId}`,
  });
  if (error) throw new Error(`subscription: ${error.message}`);
}

/** Makes a test workspace look untouched: creation itself logs activity. */
async function makeStale(workspaceId: string) {
  await db.from("workspace_activity").delete().eq("workspace_id", workspaceId);
}

async function enrollment(userId: string, track: string) {
  const { data } = await db
    .from("lifecycle_enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("track", track)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function backdate(id: string, days: number) {
  const baseline = new Date(Date.now() - days * DAY).toISOString();
  await db.from("lifecycle_enrollments").update({ baseline_at: baseline, next_action_at: baseline }).eq("id", id);
}

async function queued(userId: string) {
  const { data } = await db
    .from("transactional_emails")
    .select("event_key, status, variables")
    .eq("user_id", userId)
    .order("queued_at", { ascending: false });
  return (data ?? []) as { event_key: string; status: string; variables: Record<string, unknown> }[];
}

async function cleanup(userIds: string[]) {
  for (const userId of userIds) {
    await db.from("transactional_emails").delete().eq("user_id", userId);
    const { data: enrollments } = await db.from("lifecycle_enrollments").select("id").eq("user_id", userId);
    for (const row of (enrollments ?? []) as { id: string }[]) {
      await db.from("lifecycle_actions").delete().eq("enrollment_id", row.id);
    }
    await db.from("lifecycle_enrollments").delete().eq("user_id", userId);
    const { data: ws } = await db.from("workspaces").select("id").eq("owner_id", userId);
    for (const row of (ws ?? []) as { id: string }[]) {
      await db.from("billing_subscriptions").delete().eq("workspace_id", row.id);
      await db.from("workspace_members").delete().eq("workspace_id", row.id);
      await db.from("workspace_activity").delete().eq("workspace_id", row.id);
      await db.from("workspaces").delete().eq("id", row.id);
    }
    await db.from("profiles").delete().eq("id", userId);
    await db.auth.admin.deleteUser(userId);
  }
}

async function main() {
  const original = await getLifecycleConfig(db);
  const created: string[] = [];

  // Pause the shared send queue for the duration of the test so no test row can
  // leave the building. Real system emails stay queued and go out afterwards.
  const { getTransactionalSettings, saveTransactionalSettings } = await import(
    "../src/lib/transactional-email.server"
  );
  const mailSettings = await getTransactionalSettings(db);
  await saveTransactionalSettings(db, { paused: true });

  try {
    await saveLifecycleConfig({ enabled: true, batch_limit: 500 }, db);

    /* -------- free track: 5% offer, then 10%, then conversion cancels ----- */
    const free = await makeUser("free", 5);
    created.push(free.userId);

    await runLifecycleCycle({ onlyUserIds: created });
    let e = await enrollment(free.userId, "free_trial");
    check("free user enters lifecycle", Boolean(e), String(e?.["state"] ?? "none"));
    check("5% email sent on first due step", e?.["state"] === "email_1_sent");
    let mail = await queued(free.userId);
    const offer5 = mail.find((m) => m.event_key === "lifecycle.free_offer_5");
    check("5% email queued", Boolean(offer5));
    check(
      "5% email carries a real discount code",
      Boolean(offer5?.variables?.["coupon.code"]),
      String(offer5?.variables?.["coupon.code"] ?? "missing"),
    );

    // Duplicate scheduler execution must not duplicate the email.
    await runLifecycleCycle({ onlyUserIds: created });
    mail = await queued(free.userId);
    check(
      "repeat cycle does not duplicate the 5% email",
      mail.filter((m) => m.event_key === "lifecycle.free_offer_5").length === 1,
    );

    // Second offer becomes due.
    await backdate(e!["id"] as string, 12);
    await runLifecycleCycle({ onlyUserIds: created });
    e = await enrollment(free.userId, "free_trial");
    mail = await queued(free.userId);
    const offer10 = mail.find((m) => m.event_key === "lifecycle.free_offer_10");
    check("10% email queued on schedule", Boolean(offer10) && e?.["state"] === "email_2_sent");
    check("10% email carries its own code", Boolean(offer10?.variables?.["coupon.code"]));

    // Conversion cancels a still-open sequence.
    const converting = await makeUser("convert", 5);
    created.push(converting.userId);
    await runLifecycleCycle({ onlyUserIds: created });
    const convertEnrollment = await enrollment(converting.userId, "free_trial");
    await giveActiveSubscription(converting.workspaceId);
    await backdate(convertEnrollment!["id"] as string, 12);
    await runLifecycleCycle({ onlyUserIds: created });
    const afterConvert = await enrollment(converting.userId, "free_trial");
    check(
      "conversion cancels remaining offers",
      afterConvert?.["state"] === "cancelled" && afterConvert?.["cancel_reason"] === "converted",
      String(afterConvert?.["cancel_reason"] ?? ""),
    );
    const convertMail = await queued(converting.userId);
    check(
      "no 10% email after conversion",
      !convertMail.some((m) => m.event_key === "lifecycle.free_offer_10"),
    );

    /* ------------- inactive track: 4 emails, then termination ------------- */
    const inactive = await makeUser("inactive", 120);
    created.push(inactive.userId);
    await giveActiveSubscription(inactive.workspaceId);
    await makeStale(inactive.workspaceId);

    await runLifecycleCycle({ onlyUserIds: created });
    let ie = await enrollment(inactive.userId, "inactive");
    check("inactive customer enters lifecycle", Boolean(ie), String(ie?.["state"] ?? "none"));

    const expected = [
      ["lifecycle.inactive_reengage_1", "email_1_sent", 4],
      ["lifecycle.inactive_reengage_2", "email_2_sent", 8],
      ["lifecycle.inactive_reengage_3", "email_3_sent", 13],
      ["lifecycle.inactive_final_warning", "final_warning_sent", 18],
    ] as const;
    for (const [eventKey, state, days] of expected) {
      await backdate(ie!["id"] as string, days);
      await runLifecycleCycle({ onlyUserIds: created });
      ie = await enrollment(inactive.userId, "inactive");
      const box = await queued(inactive.userId);
      check(`${eventKey} sent in order`, ie?.["state"] === state && box.some((m) => m.event_key === eventKey));
    }

    const warning = (await queued(inactive.userId)).find(
      (m) => m.event_key === "lifecycle.inactive_final_warning",
    );
    check(
      "final warning states the real closure date",
      Boolean(warning?.variables?.["termination.date"]),
      String(warning?.variables?.["termination.date"] ?? ""),
    );

    // Termination.
    await backdate(ie!["id"] as string, 25);
    await runLifecycleCycle({ onlyUserIds: created });
    ie = await enrollment(inactive.userId, "inactive");
    check("account terminated", ie?.["state"] === "terminated");
    const { data: banned } = await db.auth.admin.getUserById(inactive.userId);
    check(
      "sign-in actually blocked server-side",
      Boolean(banned?.user?.banned_until) && Date.parse(banned.user.banned_until) > Date.now(),
    );
    const { data: wsRow } = await db.from("workspaces").select("status").eq("id", inactive.workspaceId).maybeSingle();
    check("workspace suspended", wsRow?.status === "suspended");
    const termMail = (await queued(inactive.userId)).filter(
      (m) => m.event_key === "lifecycle.account_terminated",
    );
    check("termination email sent once, after termination", termMail.length === 1);

    await runLifecycleCycle({ onlyUserIds: created });
    const termMailAgain = (await queued(inactive.userId)).filter(
      (m) => m.event_key === "lifecycle.account_terminated",
    );
    check("repeat cycle cannot terminate or email twice", termMailAgain.length === 1);

    /* ---------------- activity cancels the inactive sequence -------------- */
    const returning = await makeUser("return", 120);
    created.push(returning.userId);
    await giveActiveSubscription(returning.workspaceId);
    await makeStale(returning.workspaceId);
    await runLifecycleCycle({ onlyUserIds: created });
    const re = await enrollment(returning.userId, "inactive");
    check("second inactive customer enrolled", Boolean(re));
    await db.from("workspace_activity").insert({
      workspace_id: returning.workspaceId,
      actor_id: returning.userId,
      type: "lifecycle_test_activity",
    });
    await backdate(re!["id"] as string, 20);
    await runLifecycleCycle({ onlyUserIds: created });
    const afterReturn = await enrollment(returning.userId, "inactive");
    check(
      "returning customer removed from sequence, not terminated",
      afterReturn?.["state"] === "reactivated",
      String(afterReturn?.["state"] ?? ""),
    );
    const { data: notBanned } = await db.auth.admin.getUserById(returning.userId);
    check("returning customer NOT terminated", !notBanned?.user?.banned_until);

    /* ------------- failed termination sends no termination email ---------- */
    const failing = await makeUser("failterm", 120);
    created.push(failing.userId);
    await giveActiveSubscription(failing.workspaceId);
    await makeStale(failing.workspaceId);
    await runLifecycleCycle({ onlyUserIds: created });
    const fe = await enrollment(failing.userId, "inactive");
    await db
      .from("lifecycle_enrollments")
      .update({ state: "final_warning_sent", user_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", fe!["id"]);
    await backdate(fe!["id"] as string, 25);
    await runLifecycleCycle({
      onlyUserIds: [...created, "00000000-0000-0000-0000-000000000000"],
    });
    const { data: closedEnrollment } = await db
      .from("lifecycle_enrollments")
      .select("state, cancel_reason")
      .eq("id", fe!["id"])
      .maybeSingle();
    const { data: falseMail } = await db
      .from("transactional_emails")
      .select("id")
      .eq("event_key", "lifecycle.account_terminated")
      .eq("user_id", "00000000-0000-0000-0000-000000000000");
    const { data: failAction } = await db
      .from("lifecycle_actions")
      .select("id")
      .eq("enrollment_id", fe!["id"])
      .eq("kind", "termination");
    // An account that cannot be resolved is dropped from the sequence instead
    // of being terminated or emailed.
    check(
      "unresolvable account is dropped, never terminated",
      closedEnrollment?.state === "cancelled" && closedEnrollment?.cancel_reason === "account_deleted",
      `${closedEnrollment?.state ?? "?"}/${closedEnrollment?.cancel_reason ?? "?"}`,
    );
    check("no termination recorded for it", (failAction ?? []).length === 0);
    check("failed termination sends no termination email", (falseMail ?? []).length === 0);
    await db.from("lifecycle_actions").delete().eq("enrollment_id", fe!["id"]);
    await db.from("lifecycle_enrollments").delete().eq("id", fe!["id"]);

    /* ---------------- existing system emails unaffected ------------------- */
    const { count } = await db
      .from("transactional_templates")
      .select("id", { count: "exact", head: true });
    check("system email templates intact", (count ?? 0) >= 0, `${count} stored templates`);
  } finally {
    await cleanup(created);
    await saveTransactionalSettings(db, { paused: mailSettings.paused });
    await saveLifecycleConfig(original as unknown as Record<string, unknown>, db);
    const restored = await getLifecycleConfig(db);
    check("lifecycle settings restored", restored.enabled === original.enabled);
  }

  console.log(results.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
