/**
 * Customer lifecycle engine (server only).
 *
 * Runs inside the EXISTING transactional email cron cycle — there is no second
 * scheduler and no browser timer. Every cycle:
 *   1. enrolls new accounts into the free-trial and inactivity tracks,
 *   2. processes every enrollment whose next step is due,
 *   3. re-checks eligibility immediately before each email and each
 *      termination, cancelling the sequence when the customer converted,
 *      became active again, or is no longer eligible,
 *   4. claims each step with a unique (enrollment, step) ledger row, so a
 *      repeated run can never send a duplicate email or terminate twice.
 *
 * Emails go through the existing system-email queue (`transactional_emails`),
 * which owns rendering, provider routing and retries. Termination goes through
 * the same account controls used by Admin → Users / Workspaces.
 */
import {
  DEFAULT_LIFECYCLE_CONFIG,
  LIFECYCLE_SETTINGS_KEY,
  normalizeLifecycleConfig,
  type LifecycleConfig,
  type LifecycleState,
  type LifecycleTrack,
} from "@/lib/lifecycle/config";
import {
  LIFECYCLE_EVENT_KEYS,
  daysBetween,
  formatEmailDate,
  isOpenState,
  nextActionAt,
  nextStep,
  stepDueAt,
  terminationDate,
  type LifecycleStep,
} from "@/lib/lifecycle/model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY_MS = 24 * 60 * 60 * 1000;

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

function baseUrl(): string {
  return process.env["APP_URL"] || process.env["VITE_APP_URL"] || "https://munchreach.com";
}

/* ------------------------------------------------------------ settings */

export async function getLifecycleConfig(admin?: Db): Promise<LifecycleConfig> {
  const client = admin ?? (await db());
  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", LIFECYCLE_SETTINGS_KEY)
    .maybeSingle();
  return normalizeLifecycleConfig(data?.value ?? {});
}

export async function saveLifecycleConfig(
  patch: Record<string, unknown>,
  admin?: Db,
): Promise<LifecycleConfig> {
  const client = admin ?? (await db());
  const current = await getLifecycleConfig(client);
  const merged = {
    ...current,
    ...patch,
    free_trial: { ...current.free_trial, ...((patch["free_trial"] ?? {}) as object) },
    inactive: { ...current.inactive, ...((patch["inactive"] ?? {}) as object) },
  };
  const next = normalizeLifecycleConfig(merged);
  await client
    .from("platform_settings")
    .upsert({ key: LIFECYCLE_SETTINGS_KEY, value: next }, { onConflict: "key" });
  return next;
}

/* ------------------------------------------------------------- account */

type AuthUser = {
  id: string;
  email: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
};

function isBanned(user: AuthUser | null): boolean {
  if (!user?.banned_until) return false;
  return new Date(user.banned_until).getTime() > Date.now();
}

async function getAuthUser(client: Db, userId: string): Promise<AuthUser | null> {
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user as AuthUser;
}

/** Bounded listing of auth users, newest page first. */
async function listAuthUsers(client: Db, maxPages = 5): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const batch = (data?.users ?? []) as AuthUser[];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

export type AccountContext = {
  userId: string;
  email: string | null;
  firstName: string;
  workspaceIds: string[];
  workspaceId: string | null;
  workspaceName: string;
  workspaceSuspended: boolean;
  planName: string;
  subscriptionStatus: string | null;
  hasPaidAccess: boolean;
  authUser: AuthUser | null;
};

/** Everything the eligibility checks need, read fresh on every use. */
export async function loadAccount(client: Db, userId: string): Promise<AccountContext> {
  const [{ data: profile }, { data: workspaces }, authUser] = await Promise.all([
    client.from("profiles").select("email, full_name, first_name").eq("id", userId).maybeSingle(),
    client
      .from("workspaces")
      .select("id, name, status")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true }),
    getAuthUser(client, userId),
  ]);

  const owned = (workspaces ?? []) as { id: string; name: string; status: string | null }[];
  const workspaceIds = owned.map((w) => w.id);
  const primary = owned[0] ?? null;

  const full = String((profile as { full_name?: string } | null)?.full_name ?? "").trim();
  const firstName =
    ((profile as { first_name?: string } | null)?.first_name || full.split(/\s+/)[0] || "there").trim();

  let subscriptionStatus: string | null = null;
  let planName = "Free";
  let hasPaidAccess = false;

  if (workspaceIds.length > 0) {
    const { data: subs } = await client
      .from("billing_subscriptions")
      .select("plan_id, status, created_at")
      .in("workspace_id", workspaceIds)
      .order("created_at", { ascending: false });
    const list = (subs ?? []) as { plan_id: string | null; status: string | null }[];
    const live = list.find((s) => s.status === "active" || s.status === "past_due") ?? list[0] ?? null;
    subscriptionStatus = live?.status ?? null;
    hasPaidAccess = list.some((s) => s.status === "active" || s.status === "past_due");
    if (live?.plan_id) {
      const { data: plan } = await client.from("plans").select("name").eq("id", live.plan_id).maybeSingle();
      if (plan?.name) planName = plan.name as string;
    }

    // An admin-granted plan is paid access too.
    const { data: grants } = await client
      .from("plan_grants")
      .select("plan_id, status, expires_at")
      .in("workspace_id", workspaceIds)
      .eq("status", "active");
    for (const grant of (grants ?? []) as { expires_at: string | null }[]) {
      if (!grant.expires_at || Date.parse(grant.expires_at) > Date.now()) hasPaidAccess = true;
    }
  }

  return {
    userId,
    email: ((profile as { email?: string } | null)?.email ?? authUser?.email ?? null) as string | null,
    firstName,
    workspaceIds,
    workspaceId: primary?.id ?? null,
    workspaceName: primary?.name ?? "your workspace",
    workspaceSuspended: primary?.status === "suspended",
    planName,
    subscriptionStatus,
    hasPaidAccess,
    authUser,
  };
}

/**
 * The canonical "last meaningful activity" for an account: the newest of the
 * last sign-in, the newest workspace activity entry, the newest campaign
 * change and the newest lead activity. No new activity tracking is introduced.
 */
export async function lastActivityAt(client: Db, account: AccountContext): Promise<string | null> {
  const stamps: (string | null | undefined)[] = [account.authUser?.last_sign_in_at ?? null];

  if (account.workspaceIds.length > 0) {
    const [activity, campaigns, leads] = await Promise.all([
      client
        .from("workspace_activity")
        .select("created_at")
        .in("workspace_id", account.workspaceIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("campaigns")
        .select("updated_at, created_at")
        .in("workspace_id", account.workspaceIds)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("leads")
        .select("last_activity_at")
        .in("workspace_id", account.workspaceIds)
        .not("last_activity_at", "is", null)
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    stamps.push((activity.data as { created_at?: string } | null)?.created_at);
    stamps.push(
      (campaigns.data as { updated_at?: string; created_at?: string } | null)?.updated_at ??
        (campaigns.data as { created_at?: string } | null)?.created_at,
    );
    stamps.push((leads.data as { last_activity_at?: string } | null)?.last_activity_at);
  }

  const times = stamps
    .filter((s): s is string => Boolean(s))
    .map((s) => Date.parse(s))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/* -------------------------------------------------------- enrollments */

export type Enrollment = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  email: string | null;
  track: LifecycleTrack;
  state: LifecycleState;
  entered_at: string;
  baseline_at: string;
  next_action_at: string | null;
};

async function cancelEnrollment(
  client: Db,
  enrollment: Enrollment,
  state: "cancelled" | "reactivated",
  reason: string,
) {
  const now = new Date().toISOString();
  await client
    .from("lifecycle_enrollments")
    .update({
      state,
      next_action_at: null,
      cancel_reason: reason,
      cancelled_at: state === "cancelled" ? now : null,
      reactivated_at: state === "reactivated" ? now : null,
    })
    .eq("id", enrollment.id)
    .in("state", ["eligible", "email_1_sent", "email_2_sent", "email_3_sent", "final_warning_sent"]);
}

export type EligibilityResult =
  | { ok: true; account: AccountContext; activityAt: string | null }
  | { ok: false; state: "cancelled" | "reactivated"; reason: string };

/** Re-checked immediately before every email and every termination. */
export async function checkEligibility(
  client: Db,
  enrollment: Enrollment,
  config: LifecycleConfig,
): Promise<EligibilityResult> {
  const account = await loadAccount(client, enrollment.user_id);

  if (!account.authUser) return { ok: false, state: "cancelled", reason: "account_deleted" };
  if (!account.email) return { ok: false, state: "cancelled", reason: "no_email" };

  // Already suspended/terminated by an admin, or terminated by this engine.
  if (enrollment.state !== "final_warning_sent" && isBanned(account.authUser) && enrollment.track === "free_trial") {
    return { ok: false, state: "cancelled", reason: "account_suspended" };
  }
  if (isBanned(account.authUser)) return { ok: false, state: "cancelled", reason: "account_suspended" };
  if (account.workspaceSuspended) return { ok: false, state: "cancelled", reason: "workspace_suspended" };

  const activityAt = await lastActivityAt(client, account);

  if (enrollment.track === "free_trial") {
    // Converting to a paid plan ends the offer sequence immediately.
    if (account.hasPaidAccess) return { ok: false, state: "cancelled", reason: "converted" };
    return { ok: true, account, activityAt };
  }

  // Inactivity track: the account must still be an active customer.
  if (!account.hasPaidAccess) return { ok: false, state: "cancelled", reason: "no_active_subscription" };
  if (account.subscriptionStatus && ["cancelled", "expired"].includes(account.subscriptionStatus)) {
    return { ok: false, state: "cancelled", reason: "subscription_ended" };
  }
  // Any activity after the enrollment baseline means the customer came back.
  if (activityAt && Date.parse(activityAt) > Date.parse(enrollment.baseline_at)) {
    return { ok: false, state: "reactivated", reason: "customer_active" };
  }
  return { ok: true, account, activityAt };
}

/* ------------------------------------------------------------- enroll */

async function openEnrollmentUserIds(client: Db, track: LifecycleTrack): Promise<Set<string>> {
  const { data } = await client
    .from("lifecycle_enrollments")
    .select("user_id")
    .eq("track", track)
    .limit(20_000);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

async function insertEnrollment(
  client: Db,
  input: {
    userId: string;
    workspaceId: string | null;
    email: string | null;
    track: LifecycleTrack;
    baselineAt: string;
    config: LifecycleConfig;
  },
): Promise<boolean> {
  const next = nextActionAt(input.track, "eligible", input.baselineAt, input.config);
  const { error } = await client.from("lifecycle_enrollments").insert({
    user_id: input.userId,
    workspace_id: input.workspaceId,
    email: input.email,
    track: input.track,
    state: "eligible",
    baseline_at: input.baselineAt,
    next_action_at: next,
  });
  return !error;
}

/** Free/trial users who never upgraded. Baseline is their sign-up date. */
async function enrollFreeTrial(client: Db, config: LifecycleConfig): Promise<number> {
  if (!config.free_trial.enabled) return 0;
  const existing = await openEnrollmentUserIds(client, "free_trial");
  const cutoff = new Date(Date.now() - config.free_trial.email_1_day * DAY_MS).toISOString();

  const { data } = await client
    .from("profiles")
    .select("id, email, created_at")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(2000);

  let created = 0;
  for (const row of (data ?? []) as { id: string; email: string | null; created_at: string }[]) {
    if (created >= config.batch_limit) break;
    if (existing.has(row.id)) continue;
    const account = await loadAccount(client, row.id);
    if (!account.email || account.hasPaidAccess) continue;
    if (isBanned(account.authUser) || account.workspaceSuspended) continue;
    if (
      await insertEnrollment(client, {
        userId: row.id,
        workspaceId: account.workspaceId,
        email: account.email,
        track: "free_trial",
        baselineAt: row.created_at,
        config,
      })
    ) {
      created += 1;
    }
  }
  return created;
}

/** Paying customers with no activity for the configured window. */
async function enrollInactive(client: Db, config: LifecycleConfig): Promise<number> {
  if (!config.inactive.enabled) return 0;
  const existing = await openEnrollmentUserIds(client, "inactive");
  const threshold = Date.now() - config.inactive.inactive_days * DAY_MS;
  const users = await listAuthUsers(client);

  let created = 0;
  for (const user of users) {
    if (created >= config.batch_limit) break;
    if (existing.has(user.id) || isBanned(user)) continue;
    // Cheap pre-filter on the sign-in stamp before the heavier activity read.
    const signedIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : null;
    if (signedIn !== null && signedIn > threshold) continue;

    const account = await loadAccount(client, user.id);
    if (!account.email || !account.hasPaidAccess || account.workspaceSuspended) continue;
    const activity = await lastActivityAt(client, account);
    const activityTime = activity ? Date.parse(activity) : Date.parse(user.created_at ?? "");
    if (Number.isFinite(activityTime) && activityTime > threshold) continue;

    // Offsets count from entry into the sequence, per the lifecycle spec.
    if (
      await insertEnrollment(client, {
        userId: user.id,
        workspaceId: account.workspaceId,
        email: account.email,
        track: "inactive",
        baselineAt: new Date().toISOString(),
        config,
      })
    ) {
      created += 1;
    }
  }
  return created;
}

/* -------------------------------------------------------------- steps */

type ClaimResult = { claimed: boolean; actionId: string | null; existingStatus?: string };

/** Unique (enrollment, step) row — the single source of truth against dupes. */
async function claimStep(
  client: Db,
  enrollment: Enrollment,
  step: LifecycleStep,
): Promise<ClaimResult> {
  const { data, error } = await client
    .from("lifecycle_actions")
    .insert({
      enrollment_id: enrollment.id,
      step_key: step.stepKey,
      kind: step.kind,
      event_key: step.eventKey,
      status: "claimed",
      attempts: 1,
    })
    .select("id")
    .maybeSingle();

  if (!error && data) return { claimed: true, actionId: (data as { id: string }).id };

  // Row exists: a previous attempt either finished (nothing to do) or failed
  // and may be retried.
  const { data: existing } = await client
    .from("lifecycle_actions")
    .select("id, status, attempts")
    .eq("enrollment_id", enrollment.id)
    .eq("step_key", step.stepKey)
    .maybeSingle();
  const row = existing as { id: string; status: string; attempts: number } | null;
  if (!row) return { claimed: false, actionId: null };
  if (row.status === "failed") {
    const { data: retried } = await client
      .from("lifecycle_actions")
      .update({ status: "claimed", attempts: row.attempts + 1, error: null })
      .eq("id", row.id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (retried) return { claimed: true, actionId: row.id };
  }
  return { claimed: false, actionId: row.id, existingStatus: row.status };
}

async function finishStep(
  client: Db,
  actionId: string,
  patch: Record<string, unknown>,
) {
  await client
    .from("lifecycle_actions")
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq("id", actionId);
}

async function advanceEnrollment(
  client: Db,
  enrollment: Enrollment,
  step: LifecycleStep,
  config: LifecycleConfig,
) {
  const state = step.nextState;
  await client
    .from("lifecycle_enrollments")
    .update({
      state,
      last_step_at: new Date().toISOString(),
      next_action_at: nextActionAt(enrollment.track, state, enrollment.baseline_at, config),
      ...(state === "terminated" ? { terminated_at: new Date().toISOString() } : {}),
    })
    .eq("id", enrollment.id)
    .eq("state", enrollment.state);
}

/** Variables every lifecycle template may use. */
function emailVariables(
  account: AccountContext,
  enrollment: Enrollment,
  config: LifecycleConfig,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const app = baseUrl();
  const inactiveDays = Math.max(
    0,
    Math.round(daysBetween(enrollment.baseline_at, new Date()) + (enrollment.track === "inactive" ? config.inactive.inactive_days : 0)),
  );
  return {
    "user.first_name": account.firstName,
    "user.email": account.email ?? "",
    "workspace.name": account.workspaceName,
    "plan.name": account.planName,
    upgrade_url: `${app}/billing`,
    billing_url: `${app}/billing`,
    dashboard_url: `${app}/dashboard`,
    login_url: `${app}/auth`,
    support_url: `${app}/help-center`,
    "inactive.days": String(inactiveDays),
    "termination.date": formatEmailDate(terminationDate(enrollment.baseline_at, config)),
    ...extra,
  };
}

/** Suspends sign-in and the workspace through the existing account controls. */
async function terminateAccount(
  client: Db,
  account: AccountContext,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await client.auth.admin.updateUserById(account.userId, {
      ban_duration: "876000h",
    });
    if (error) return { ok: false, error: error.message };

    if (account.workspaceIds.length > 0) {
      const { error: wsError } = await client
        .from("workspaces")
        .update({
          status: "suspended",
          suspended_at: new Date().toISOString(),
          suspended_reason: reason,
        })
        .in("id", account.workspaceIds);
      if (wsError) return { ok: false, error: wsError.message };
    }

    try {
      await client.from("admin_audit_log").insert({
        action: "user.lifecycle_terminate",
        target_type: "user",
        target_id: account.userId,
        target_label: account.email,
        detail: { reason },
      });
    } catch {
      /* audit is best-effort; termination itself already succeeded */
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Termination failed" };
  }
}

async function queueLifecycleEmail(
  client: Db,
  input: {
    eventKey: string;
    to: string;
    userId: string;
    workspaceId: string | null;
    idempotencyKey: string;
    variables: Record<string, unknown>;
  },
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const { triggerTransactionalEmail } = await import("@/lib/transactional-email.server");
  const result = await triggerTransactionalEmail(client, {
    eventKey: input.eventKey,
    to: input.to,
    variables: input.variables,
    idempotencyKey: input.idempotencyKey,
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  if (!result.queued) return { ok: false, reason: result.reason ?? "Not queued" };
  return { ok: true, ...(result.id ? { id: result.id } : {}) };
}

export type LifecycleCycleResult = {
  ok: boolean;
  skipped?: string;
  enrolledFreeTrial: number;
  enrolledInactive: number;
  due: number;
  emailsQueued: number;
  terminated: number;
  cancelled: number;
  reactivated: number;
  deferred: number;
  errors: string[];
};

/** Processes one enrollment whose next step is due. */
async function processEnrollment(
  client: Db,
  enrollment: Enrollment,
  config: LifecycleConfig,
  result: LifecycleCycleResult,
) {
  const step = nextStep(enrollment.track, enrollment.state, config);
  if (!step) {
    await client
      .from("lifecycle_enrollments")
      .update({ next_action_at: null })
      .eq("id", enrollment.id);
    return;
  }

  // Configuration may have moved the offset later since the row was written.
  if (stepDueAt(enrollment.baseline_at, step.day).getTime() > Date.now()) {
    await client
      .from("lifecycle_enrollments")
      .update({ next_action_at: stepDueAt(enrollment.baseline_at, step.day).toISOString() })
      .eq("id", enrollment.id);
    result.deferred += 1;
    return;
  }

  const eligibility = await checkEligibility(client, enrollment, config);
  if (!eligibility.ok) {
    await cancelEnrollment(client, enrollment, eligibility.state, eligibility.reason);
    if (eligibility.state === "reactivated") result.reactivated += 1;
    else result.cancelled += 1;
    return;
  }
  const account = eligibility.account;

  const claim = await claimStep(client, enrollment, step);
  if (!claim.claimed) {
    // Already done by another run — just make sure the state moved on.
    if (claim.existingStatus === "sent" || claim.existingStatus === "done") {
      await advanceEnrollment(client, enrollment, step, config);
    }
    return;
  }
  const actionId = claim.actionId!;

  if (step.kind === "termination") {
    const outcome = await terminateAccount(
      client,
      account,
      `Closed after ${config.inactive.inactive_days}+ days of inactivity (lifecycle)`,
    );
    if (!outcome.ok) {
      // A failed termination must NOT produce a termination email.
      await finishStep(client, actionId, { status: "failed", error: outcome.error ?? "failed" });
      result.errors.push(`terminate ${enrollment.id}: ${outcome.error ?? "failed"}`);
      return;
    }
    await advanceEnrollment(client, enrollment, step, config);
    result.terminated += 1;

    const email = await queueLifecycleEmail(client, {
      eventKey: LIFECYCLE_EVENT_KEYS.terminated,
      to: account.email!,
      userId: account.userId,
      workspaceId: account.workspaceId,
      idempotencyKey: `lifecycle:${enrollment.id}:terminated_email`,
      variables: emailVariables(account, enrollment, config, {
        "termination.date": formatEmailDate(new Date()),
      }),
    });
    await finishStep(client, actionId, {
      status: "done",
      ...(email.id ? { email_id: email.id } : {}),
      ...(email.ok ? {} : { error: email.reason ?? null }),
    });
    if (email.ok) result.emailsQueued += 1;
    return;
  }

  // Email step. Offers must carry a real coupon or they are not sent.
  let extra: Record<string, unknown> = {};
  let couponFields: Record<string, unknown> = {};
  if (step.discountPercent) {
    const { data: prior } = await client
      .from("lifecycle_actions")
      .select("coupon_code, coupon_percent, coupon_expires_at")
      .eq("id", actionId)
      .maybeSingle();
    const cached = prior as
      | { coupon_code: string | null; coupon_percent: number | null; coupon_expires_at: string | null }
      | null;

    let code = cached?.coupon_code ?? null;
    let percent = cached?.coupon_percent ?? step.discountPercent;
    let expires = cached?.coupon_expires_at ?? null;

    if (!code) {
      const { createLifecycleCoupon } = await import("@/lib/lifecycle-coupons.server");
      const coupon = await createLifecycleCoupon({
        percent: step.discountPercent,
        validDays: config.free_trial.coupon_valid_days,
        idempotencyKey: `${enrollment.id}-${step.stepKey}`,
      });
      if (!coupon) {
        await finishStep(client, actionId, {
          status: "failed",
          error: "Discount code could not be issued",
        });
        result.errors.push(`coupon ${enrollment.id}: not issued`);
        return;
      }
      code = coupon.code;
      percent = coupon.percent;
      expires = coupon.expiresAt;
    }

    couponFields = { coupon_code: code, coupon_percent: percent, coupon_expires_at: expires };
    extra = {
      "coupon.code": code,
      "coupon.percent": String(percent),
      "coupon.expires_at": expires ? formatEmailDate(expires) : "",
    };
  }

  const email = await queueLifecycleEmail(client, {
    eventKey: step.eventKey!,
    to: account.email!,
    userId: account.userId,
    workspaceId: account.workspaceId,
    idempotencyKey: `lifecycle:${enrollment.id}:${step.stepKey}`,
    variables: emailVariables(account, enrollment, config, extra),
  });

  if (!email.ok) {
    await finishStep(client, actionId, {
      status: "failed",
      error: email.reason ?? "Not queued",
      ...couponFields,
    });
    result.errors.push(`email ${enrollment.id}/${step.stepKey}: ${email.reason ?? "not queued"}`);
    return;
  }

  await finishStep(client, actionId, {
    status: "sent",
    ...(email.id ? { email_id: email.id } : {}),
    ...couponFields,
  });
  await advanceEnrollment(client, enrollment, step, config);
  result.emailsQueued += 1;
}

/** One bounded lifecycle cycle. Never throws. */
export async function runLifecycleCycle(
  options: { enrollOnly?: boolean; limit?: number } = {},
): Promise<LifecycleCycleResult> {
  const result: LifecycleCycleResult = {
    ok: true,
    enrolledFreeTrial: 0,
    enrolledInactive: 0,
    due: 0,
    emailsQueued: 0,
    terminated: 0,
    cancelled: 0,
    reactivated: 0,
    deferred: 0,
    errors: [],
  };

  try {
    const client = await db();
    const config = await getLifecycleConfig(client);
    if (!config.enabled) return { ...result, ok: false, skipped: "Lifecycle emails disabled" };

    result.enrolledFreeTrial = await enrollFreeTrial(client, config);
    result.enrolledInactive = await enrollInactive(client, config);
    if (options.enrollOnly) return result;

    const { data } = await client
      .from("lifecycle_enrollments")
      .select("id, user_id, workspace_id, email, track, state, entered_at, baseline_at, next_action_at")
      .in("state", ["eligible", "email_1_sent", "email_2_sent", "email_3_sent", "final_warning_sent"])
      .not("next_action_at", "is", null)
      .lte("next_action_at", new Date().toISOString())
      .order("next_action_at", { ascending: true })
      .limit(Math.min(options.limit ?? config.batch_limit, 500));

    const due = (data ?? []) as Enrollment[];
    result.due = due.length;
    for (const enrollment of due) {
      if (!isOpenState(enrollment.state)) continue;
      try {
        await processEnrollment(client, enrollment, config, result);
      } catch (error) {
        result.errors.push(
          `${enrollment.id}: ${error instanceof Error ? error.message : "step failed"}`.slice(0, 300),
        );
      }
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(error instanceof Error ? error.message : "cycle failed");
  }
  return result;
}

export { DEFAULT_LIFECYCLE_CONFIG, LIFECYCLE_EVENT_KEYS };
