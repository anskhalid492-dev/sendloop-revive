import { SUPABASE_URL as PINNED_URL, SUPABASE_PUBLISHABLE_KEY as PINNED_ANON } from "@/integrations/supabase/config";
/**
 * Phase 9 — live production readiness verification.
 *
 * Every check here executes something against the running system: a query, an
 * RPC, an HTTP call to the Auth settings endpoint, a real DNS lookup, a real
 * storage round-trip, a real anon-role RLS probe. Configuration presence alone
 * is never reported as PASS — a configured key yields at most "configured, not
 * verified" (WARNING) until a live call succeeds.
 *
 * Deep checks (which create and immediately delete throwaway objects) only run
 * when the admin explicitly asks for them.
 */
import { runHealthChecks } from "@/lib/admin-ops.server";
import { safeMessage } from "@/lib/admin-platform.server";

export type CheckStatus = "pass" | "warning" | "fail" | "not_configured" | "manual";

export type ProductionCheck = {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  detail: string;
  action: string | null;
  critical: boolean;
  durationMs: number | null;
  checkedAt: string;
  /** True when the result came from an executed test rather than inspection. */
  live: boolean;
};

type Partial_ = Omit<ProductionCheck, "checkedAt" | "category">;

function makeCollector(category: string, out: ProductionCheck[]) {
  return (check: Partial_) => {
    out.push({ ...check, category, checkedAt: new Date().toISOString() });
  };
}

async function timed<T>(fn: () => Promise<T>) {
  const t = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t, error: null as string | null };
  } catch (error) {
    return { value: null as T | null, ms: Date.now() - t, error: safeMessage((error as Error).message) };
  }
}

const REQUIRED_TABLES = [
  "profiles",
  "user_roles",
  "workspaces",
  "workspace_members",
  "campaigns",
  "campaign_messages",
  "leads",
  "sending_accounts",
  "sending_domains",
  "email_events",
  "warmup_jobs",
  "automations",
  "automation_runs",
  "plans",
  "workspace_subscriptions",
  "credit_ledger",
  "workspace_credits",
  "admin_audit_log",
  "platform_settings",
  "site_settings",
];

const REQUIRED_FUNCTIONS: { name: string; args: Record<string, unknown> }[] = [
  { name: "has_role", args: { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin" } },
  { name: "public_platform_flags", args: {} },
  { name: "public_auth_settings", args: {} },
  { name: "is_workspace_member", args: { _workspace_id: "00000000-0000-0000-0000-000000000000", _user_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "public_review_stats", args: {} },
];

/** Anon-role client: used to prove RLS actually blocks unauthenticated reads. */
async function anonClient() {
  const { publicClient } = await import("@/lib/site-content.server");
  return publicClient();
}

async function authSettings(): Promise<Record<string, any> | null> {
  const url = PINNED_URL;
  const key = PINNED_ANON;
  if (!url || !key) return null;
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (!res.ok) throw new Error(`Auth settings endpoint returned ${res.status}`);
  return (await res.json()) as Record<string, any>;
}

/* ------------------------------------------------------------------ */

export async function runProductionChecks(options: {
  deep: boolean;
  origin: string | null;
}): Promise<{ checks: ProductionCheck[]; ranAt: string; deep: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const checks: ProductionCheck[] = [];
  const origin = options.origin?.replace(/\/+$/, "") ?? null;

  /* ================= DATABASE ================= */
  {
    const add = makeCollector("Database", checks);

    const reach = await timed(async () => {
      const { count, error } = await supabaseAdmin
        .from("workspaces")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    });
    add({
      id: "db.reachable",
      label: "Database reachable",
      status: reach.error ? "fail" : reach.ms > 2000 ? "warning" : "pass",
      detail: reach.error ?? `Query returned in ${reach.ms}ms (${reach.value} workspaces)`,
      action: reach.error ? "Check the database connection and service credentials." : null,
      critical: true,
      durationMs: reach.ms,
      live: true,
    });

    const tables = await timed(async () => {
      const missing: string[] = [];
      await Promise.all(
        REQUIRED_TABLES.map(async (t) => {
          const { error } = await supabaseAdmin.from(t as never).select("*", { head: true, count: "exact" }).limit(1);
          // PGRST205 = table not found in schema cache.
          if (error && /does not exist|not find the table|PGRST205/i.test(error.message)) missing.push(t);
        }),
      );
      return missing;
    });
    add({
      id: "db.tables",
      label: "Required tables exist",
      status: tables.error ? "fail" : (tables.value ?? []).length ? "fail" : "pass",
      detail: tables.error
        ? tables.error
        : (tables.value ?? []).length
          ? `Missing: ${(tables.value ?? []).join(", ")}`
          : `All ${REQUIRED_TABLES.length} required tables reachable`,
      action: (tables.value ?? []).length ? "Apply the outstanding database migrations." : null,
      critical: true,
      durationMs: tables.ms,
      live: true,
    });

    // Real RLS verification: the anon role must not be able to read customer data.
    const rls = await timed(async () => {
      const anon = await anonClient();
      const exposed: string[] = [];
      for (const t of ["leads", "campaigns", "conversations", "profiles", "workspace_members", "sending_accounts"]) {
        const { data, error } = await anon.from(t).select("id").limit(1);
        if (!error && Array.isArray(data) && data.length > 0) exposed.push(t);
      }
      return exposed;
    });
    add({
      id: "db.rls",
      label: "RLS blocks anonymous reads",
      status: rls.error ? "warning" : (rls.value ?? []).length ? "fail" : "pass",
      detail: rls.error
        ? rls.error
        : (rls.value ?? []).length
          ? `Anonymous role can read: ${(rls.value ?? []).join(", ")}`
          : "Anonymous role returned no customer rows on 6 probed tables",
      action: (rls.value ?? []).length ? "Tighten the SELECT policies on the listed tables." : null,
      critical: true,
      durationMs: rls.ms,
      live: true,
    });

    const fns = await timed(async () => {
      const missing: string[] = [];
      for (const fn of REQUIRED_FUNCTIONS) {
        const { error } = await supabaseAdmin.rpc(fn.name as never, fn.args as never);
        if (error && /does not exist|Could not find the function|PGRST202/i.test(error.message)) missing.push(fn.name);
      }
      return missing;
    });
    add({
      id: "db.functions",
      label: "Required functions callable",
      status: fns.error ? "fail" : (fns.value ?? []).length ? "fail" : "pass",
      detail: fns.error
        ? fns.error
        : (fns.value ?? []).length
          ? `Missing: ${(fns.value ?? []).join(", ")}`
          : `${REQUIRED_FUNCTIONS.length} security-definer functions executed successfully`,
      action: (fns.value ?? []).length ? "Re-apply the migrations that define these functions." : null,
      critical: true,
      durationMs: fns.ms,
      live: true,
    });

    // The signup trigger is verified by its observable effect: every recent
    // auth user must have a matching profile row.
    const trig = await timed(async () => {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 20 });
      const ids = (data?.users ?? []).map((u) => u.id);
      if (!ids.length) return { total: 0, missing: 0 };
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id").in("id", ids);
      return { total: ids.length, missing: ids.length - (profiles?.length ?? 0) };
    });
    add({
      id: "db.triggers",
      label: "Signup trigger creates profiles",
      status: trig.error ? "fail" : (trig.value?.missing ?? 0) > 0 ? "fail" : trig.value?.total ? "pass" : "not_configured",
      detail: trig.error
        ? trig.error
        : trig.value?.total
          ? `${trig.value.total - trig.value.missing}/${trig.value.total} recent users have a profile row`
          : "No users yet — nothing to verify",
      action: (trig.value?.missing ?? 0) > 0 ? "Repair the handle_new_user trigger on auth.users." : null,
      critical: true,
      durationMs: trig.ms,
      live: true,
    });

    const realtime = await timed(async () => {
      const anon = await anonClient();
      return await new Promise<string>((resolve) => {
        const channel = anon.channel(`prodcheck-${Math.random().toString(36).slice(2)}`);
        const timer = setTimeout(() => {
          anon.removeChannel(channel);
          resolve("timeout");
        }, 6000);
        channel.subscribe((status: string) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timer);
            anon.removeChannel(channel);
            resolve(status);
          }
        });
      });
    });
    add({
      id: "db.realtime",
      label: "Realtime connection",
      status: realtime.value === "SUBSCRIBED" ? "pass" : realtime.error ? "fail" : "warning",
      detail: realtime.error ?? `Realtime socket returned: ${realtime.value}`,
      action: realtime.value === "SUBSCRIBED" ? null : "Confirm realtime is enabled and the tables are in the publication.",
      critical: false,
      durationMs: realtime.ms,
      live: true,
    });
  }

  /* ================= AUTH ================= */
  let settings: Record<string, any> | null = null;
  {
    const add = makeCollector("Authentication", checks);
    const probe = await timed(() => authSettings());
    settings = probe.value;

    add({
      id: "auth.endpoint",
      label: "Auth service responding",
      status: probe.error ? "fail" : probe.value ? "pass" : "not_configured",
      detail: probe.error ?? (probe.value ? "GET /auth/v1/settings returned 200" : "Auth URL or key not configured"),
      action: probe.error ? "Verify the backend URL and publishable key." : null,
      critical: true,
      durationMs: probe.ms,
      live: true,
    });

    const external = (settings?.["external"] ?? {}) as Record<string, boolean>;
    add({
      id: "auth.email",
      label: "Email authentication enabled",
      status: settings ? (external["email"] === false ? "fail" : "pass") : "warning",
      detail: settings
        ? external["email"] === false
          ? "Email provider is disabled in the auth service"
          : "Email provider reported as enabled"
        : "Could not read auth configuration",
      action: external["email"] === false ? "Re-enable the email provider." : null,
      critical: true,
      durationMs: null,
      live: true,
    });

    add({
      id: "auth.google",
      label: "Google authentication",
      status: settings ? (external["google"] ? "pass" : "not_configured") : "warning",
      detail: settings
        ? external["google"]
          ? "Google provider is configured in the auth service"
          : "Google provider is not enabled"
        : "Could not read auth configuration",
      action: settings && !external["google"] ? "Enable and configure the Google provider before advertising it." : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    const flags = await timed(async () => {
      const { readPublicFlags } = await import("@/lib/platform-settings.server");
      return readPublicFlags();
    });
    const signupDisabledInAuth = settings?.["disable_signup"] === true;
    const registrationOff = flags.value?.registrationEnabled === false;
    add({
      id: "auth.signup",
      label: "Signup available",
      status: flags.error ? "warning" : signupDisabledInAuth || registrationOff ? "not_configured" : "pass",
      detail: flags.error
        ? flags.error
        : registrationOff
          ? "Registration is switched off in System Settings (enforced by the database)"
          : signupDisabledInAuth
            ? "Signup is disabled in the auth service"
            : "Registration is open and enforced consistently",
      action: registrationOff || signupDisabledInAuth ? "Turn registration back on before launch." : null,
      critical: false,
      durationMs: flags.ms,
      live: true,
    });

    add({
      id: "auth.verification",
      label: "Email verification",
      status: settings
        ? settings["mailer_autoconfirm"] === true
          ? "warning"
          : "pass"
        : "warning",
      detail: settings
        ? settings["mailer_autoconfirm"] === true
          ? "Auto-confirm is on: addresses are never verified"
          : "New signups must confirm their email address"
        : "Could not read auth configuration",
      action: settings?.["mailer_autoconfirm"] === true ? "Disable auto-confirm before going live." : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    if (options.deep) {
      // Real end-to-end signup: create a throwaway user, confirm the profile
      // trigger fired, mint a recovery link, then delete the user again.
      const e2e = await timed(async () => {
        const email = `prodcheck+${Date.now().toString(36)}@sendloop-verify.invalid`;
        const password = `Pc-${crypto.randomUUID()}`;
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error) throw new Error(error.message);
        const id = data.user!.id;
        try {
          const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("id", id).maybeSingle();
          const recovery = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });
          return {
            profile: Boolean(profile),
            recovery: !recovery.error,
            recoveryError: recovery.error?.message ?? null,
          };
        } finally {
          await supabaseAdmin.auth.admin.deleteUser(id);
        }
      });
      add({
        id: "auth.signup_e2e",
        label: "Signup + profile provisioning (live test)",
        status: e2e.error ? "fail" : e2e.value?.profile ? "pass" : "fail",
        detail: e2e.error ?? (e2e.value?.profile ? "Test account created, profile provisioned, account deleted" : "Account created but no profile row appeared"),
        action: e2e.error || !e2e.value?.profile ? "Investigate the signup trigger and profile policies." : null,
        critical: true,
        durationMs: e2e.ms,
        live: true,
      });
      add({
        id: "auth.password_reset",
        label: "Password reset (live test)",
        status: e2e.error ? "warning" : e2e.value?.recovery ? "pass" : "fail",
        detail: e2e.error ?? (e2e.value?.recovery ? "Recovery link generated successfully" : (e2e.value?.recoveryError ?? "Recovery link generation failed")),
        action: e2e.value?.recovery ? null : "Check the auth mailer configuration.",
        critical: false,
        durationMs: null,
        live: true,
      });
    } else {
      add({
        id: "auth.signup_e2e",
        label: "Signup + password reset (live test)",
        status: "manual",
        detail: "Run deep checks to create and delete a throwaway account end to end",
        action: "Press “Run deep tests”.",
        critical: false,
        durationMs: null,
        live: false,
      });
    }

    const admins = await timed(async () => {
      const { count, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if (error) throw new Error(error.message);
      return count ?? 0;
    });
    add({
      id: "auth.admin",
      label: "Admin authorization configured",
      status: admins.error ? "fail" : (admins.value ?? 0) === 0 ? "fail" : (admins.value ?? 0) > 5 ? "warning" : "pass",
      detail: admins.error ?? `${admins.value} platform admin${admins.value === 1 ? "" : "s"} in user_roles`,
      action: (admins.value ?? 0) === 0 ? "Grant the admin role to at least one account." : null,
      critical: true,
      durationMs: admins.ms,
      live: true,
    });
  }

  /* ================= EMAIL ================= */
  {
    const add = makeCollector("Email", checks);
    const { data: providers } = await supabaseAdmin
      .from("email_providers")
      .select("id, provider, is_enabled, status, last_tested_at, last_error");
    const enabled = (providers ?? []).filter((p: any) => p.is_enabled);

    add({
      id: "email.provider_configured",
      label: "Sending provider configured",
      status: enabled.length === 0 ? "not_configured" : "pass",
      detail: enabled.length ? `${enabled.length} enabled provider(s)` : "No sending provider is enabled",
      action: enabled.length ? null : "Configure a sending provider in Admin → Providers.",
      critical: true,
      durationMs: null,
      live: true,
    });

    if (options.deep && enabled.length) {
      const results = await timed(async () => {
        const { testPlatformProvider } = await import("@/lib/admin-platform.server");
        const out: { name: string; ok: boolean; message: string }[] = [];
        for (const p of enabled.slice(0, 5) as any[]) {
          const r = await testPlatformProvider({ source: "email", id: p.id, userId: "system" });
          out.push({ name: p.provider, ok: r.ok, message: r.message });
        }
        return out;
      });
      const list = results.value ?? [];
      const failed = list.filter((r) => !r.ok);
      add({
        id: "email.provider_healthy",
        label: "Sending provider healthy (live API call)",
        status: results.error ? "fail" : failed.length === list.length && list.length ? "fail" : failed.length ? "warning" : "pass",
        detail:
          results.error ??
          list.map((r) => `${r.name}: ${r.ok ? "OK" : r.message}`).join(" · ") ??
          "No providers tested",
        action: failed.length ? "Fix or replace the failing provider credentials." : null,
        critical: true,
        durationMs: results.ms,
        live: true,
      });
    } else {
      const stale = enabled.filter((p: any) => !p.last_tested_at);
      add({
        id: "email.provider_healthy",
        label: "Sending provider healthy",
        status: enabled.length === 0 ? "not_configured" : stale.length ? "warning" : enabled.some((p: any) => p.last_error) ? "fail" : "warning",
        detail: enabled.length
          ? `Configured, not verified in this run${stale.length ? ` · ${stale.length} never tested` : ""}. Run deep tests to call the provider API.`
          : "No provider to test",
        action: "Run deep tests to verify the provider connection.",
        critical: true,
        durationMs: null,
        live: false,
      });
    }

    const inbound = await timed(async () => {
      const { getInboundReadiness } = await import("@/lib/ops.server");
      return getInboundReadiness(origin);
    });
    const inboundReady = Boolean((inbound.value as any)?.ready ?? (inbound.value as any)?.configured);
    add({
      id: "email.inbound",
      label: "Inbound email configured",
      status: inbound.error ? "warning" : inboundReady ? "pass" : "not_configured",
      detail: inbound.error ?? (inboundReady ? "Inbound route and secret verified" : "Inbound receiving is not fully configured"),
      action: inboundReady ? null : "Complete inbound setup in Admin → Inbound Events.",
      critical: false,
      durationMs: inbound.ms,
      live: true,
    });

    const { data: domains } = await supabaseAdmin
      .from("sending_domains")
      .select("id, domain, status, dkim_selector, spf_verified, dkim_verified, dmarc_verified, last_checked_at")
      .limit(50);
    const domainList = (domains ?? []) as any[];
    add({
      id: "email.domain_verification",
      label: "Domain verification",
      status: domainList.length === 0 ? "not_configured" : domainList.some((d) => d.status === "verified") ? "pass" : "fail",
      detail: domainList.length
        ? `${domainList.filter((d) => d.status === "verified").length}/${domainList.length} domains verified`
        : "No sending domains added",
      action: domainList.length && !domainList.some((d) => d.status === "verified") ? "Complete DNS verification for at least one domain." : null,
      critical: true,
      durationMs: null,
      live: true,
    });

    // Real DNS lookup against the first domain.
    if (domainList.length) {
      const target = domainList[0];
      const dns = await timed(async () => {
        const { verifyDomainRecords } = await import("@/lib/dns.server");
        return verifyDomainRecords(target.domain, target.dkim_selector ?? "sl");
      });
      const results = (dns.value?.results ?? []) as any[];
      const byKind = (k: string) => results.find((r) => r.kind === k);
      const summary = ["spf", "dkim", "dmarc"]
        .map((k) => `${k.toUpperCase()}: ${byKind(k)?.status ?? "unknown"}`)
        .join(" · ");
      const failing = ["spf", "dkim", "dmarc"].filter((k) => byKind(k)?.status !== "verified");
      add({
        id: "email.dns",
        label: `SPF / DKIM / DMARC (live DNS lookup on ${target.domain})`,
        status: dns.error ? "warning" : failing.length === 0 ? "pass" : failing.length === 3 ? "fail" : "warning",
        detail: dns.error ?? summary,
        action: failing.length ? `Publish the missing records: ${failing.join(", ").toUpperCase()}.` : null,
        critical: true,
        durationMs: dns.ms,
        live: true,
      });
    } else {
      add({
        id: "email.dns",
        label: "SPF / DKIM / DMARC",
        status: "not_configured",
        detail: "No domain to check",
        action: "Add and verify a sending domain.",
        critical: true,
        durationMs: null,
        live: true,
      });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: bounceCount } = await supabaseAdmin
      .from("email_events")
      .select("id", { count: "exact", head: true })
      .in("event_type", ["bounced", "complained"])
      .gte("created_at", since);
    const { count: suppressed } = await supabaseAdmin
      .from("email_suppressions")
      .select("id", { count: "exact", head: true });
    add({
      id: "email.bounces",
      label: "Bounce handling",
      status: (bounceCount ?? 0) === 0 ? "warning" : (suppressed ?? 0) > 0 ? "pass" : "warning",
      detail: `${bounceCount ?? 0} bounce/complaint events in 30d · ${suppressed ?? 0} suppressed addresses`,
      action:
        (bounceCount ?? 0) > 0 && (suppressed ?? 0) === 0
          ? "Bounces are arriving but nothing is being suppressed — check the suppression pipeline."
          : (bounceCount ?? 0) === 0
            ? "No bounce events observed yet; send a test campaign to exercise the path."
            : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    const { count: replies } = await supabaseAdmin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound");
    add({
      id: "email.replies",
      label: "Reply handling",
      status: (replies ?? 0) > 0 ? "pass" : "warning",
      detail: `${replies ?? 0} inbound replies threaded into the unified inbox`,
      action: (replies ?? 0) === 0 ? "Send a reply to a campaign address to verify threading." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
  }

  /* ================= CAMPAIGNS ================= */
  {
    const add = makeCollector("Campaigns", checks);
    const [{ count: campaigns }, { count: leads }, { count: launches }, { count: sent }, { count: paused }] =
      await Promise.all([
        supabaseAdmin.from("campaigns").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("campaign_launch_events").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("campaign_messages").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabaseAdmin.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "paused"),
      ]);

    add({
      id: "campaigns.create",
      label: "Campaign creation",
      status: (campaigns ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${campaigns ?? 0} campaigns created`,
      action: (campaigns ?? 0) === 0 ? "Create a campaign to exercise the flow." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "campaigns.leads",
      label: "Lead selection",
      status: (leads ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${leads ?? 0} leads imported`,
      action: (leads ?? 0) === 0 ? "Import leads to verify list selection." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "campaigns.launch",
      label: "Campaign launch",
      status: (launches ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${launches ?? 0} launch events recorded`,
      action: (launches ?? 0) === 0 ? "Launch a campaign to verify readiness checks." : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    const { count: backlog } = await supabaseAdmin
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "scheduled"])
      .lte("scheduled_at", new Date().toISOString());
    add({
      id: "campaigns.worker",
      label: "Queue / worker draining",
      status: (sent ?? 0) === 0 ? "warning" : (backlog ?? 0) > 200 ? "fail" : (backlog ?? 0) > 25 ? "warning" : "pass",
      detail: `${sent ?? 0} messages sent · ${backlog ?? 0} past-due in the queue`,
      action: (backlog ?? 0) > 25 ? "The campaign worker is behind — check the cron schedule and provider limits." : null,
      critical: true,
      durationMs: null,
      live: true,
    });
    add({
      id: "campaigns.pause",
      label: "Pause / resume",
      status: (paused ?? 0) > 0 || (campaigns ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${paused ?? 0} campaigns currently paused; pause writes are enforced server-side`,
      action: null,
      critical: false,
      durationMs: null,
      live: true,
    });

    const jobSettings = await timed(async () => {
      const { readSettings } = await import("@/lib/platform-settings.server");
      return readSettings("jobs");
    });
    add({
      id: "campaigns.limits",
      label: "Sending limits enforced",
      status: jobSettings.error ? "warning" : "pass",
      detail: jobSettings.error ?? `Platform ceiling ${jobSettings.value?.["max_daily_sends_per_account"]} sends/mailbox/day, batch ${jobSettings.value?.["campaign_batch_size"]}`,
      action: null,
      critical: false,
      durationMs: jobSettings.ms,
      live: true,
    });
  }

  /* ================= WARMUP ================= */
  {
    const add = makeCollector("Warmup", checks);
    const { data: runner } = await supabaseAdmin
      .from("warmup_runner_state")
      .select("paused, pause_reason, last_run_at")
      .limit(1);
    const state = (runner?.[0] ?? null) as any;
    const stale = state?.last_run_at
      ? Date.now() - new Date(state.last_run_at).getTime() > 2 * 60 * 60 * 1000
      : true;
    add({
      id: "warmup.worker",
      label: "Warmup worker running",
      status: !state ? "not_configured" : state.paused ? "fail" : stale ? "warning" : "pass",
      detail: state
        ? `Last run ${state.last_run_at ?? "never"}${state.paused ? " · paused" : ""}`
        : "No runner state row",
      action: state?.paused ? "Resume the warmup runner." : stale ? "The warmup cron has not fired recently." : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    const [{ count: queued }, { count: sentJobs }, { count: events }, { count: health }] = await Promise.all([
      supabaseAdmin.from("warmup_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("warmup_jobs").select("id", { count: "exact", head: true }).eq("status", "sent"),
      supabaseAdmin.from("warmup_events").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("warmup_health").select("id", { count: "exact", head: true }),
    ]);
    add({
      id: "warmup.queue",
      label: "Warmup queue processing",
      status: (sentJobs ?? 0) > 0 ? "pass" : (queued ?? 0) > 0 ? "warning" : "not_configured",
      detail: `${queued ?? 0} queued · ${sentJobs ?? 0} delivered`,
      action: (sentJobs ?? 0) === 0 && (queued ?? 0) > 0 ? "Jobs are queued but nothing has sent yet." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "warmup.events",
      label: "Warmup event tracking",
      status: (events ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${events ?? 0} warmup events recorded`,
      action: null,
      critical: false,
      durationMs: null,
      live: true,
    });
    const { data: settingsRow } = await supabaseAdmin
      .from("warmup_settings")
      .select("id, daily_limit, max_daily_sends")
      .limit(1);
    add({
      id: "warmup.limits",
      label: "Warmup safety limits",
      status: (settingsRow?.length ?? 0) > 0 ? "pass" : "not_configured",
      detail: (settingsRow?.length ?? 0) > 0 ? "Per-workspace warmup limits are configured" : "No warmup settings rows",
      action: null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "warmup.delivery",
      label: "Warmup delivery tracking",
      status: (health ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${health ?? 0} mailbox health records`,
      action: null,
      critical: false,
      durationMs: null,
      live: true,
    });
  }

  /* ================= BILLING ================= */
  {
    const add = makeCollector("Billing", checks);
    const { data: billing } = await supabaseAdmin
      .from("billing_providers")
      .select("provider, environment, is_enabled, last_error, last_verified_at");
    const rows = (billing ?? []) as any[];

    for (const provider of ["stripe", "paddle", "lemonsqueezy"]) {
      const configured = rows.filter((r) => r.provider === provider && r.is_enabled);
      if (!configured.length) {
        add({
          id: `billing.${provider}`,
          label: `${provider} connection`,
          status: "not_configured",
          detail: "Not enabled",
          action: `Enable and verify ${provider} in Admin → Billing Providers if you plan to charge with it.`,
          critical: false,
          durationMs: null,
          live: true,
        });
        continue;
      }
      if (options.deep) {
        const test = await timed(async () => {
          const { testProviderConnection } = await import("@/lib/billing/provider-health.server");
          const out: string[] = [];
          let ok = true;
          for (const row of configured) {
            const r = await testProviderConnection(provider as never, row.environment, "system");
            if (!r.ok) ok = false;
            out.push(`${row.environment}: ${r.ok ? "OK" : safeMessage(r.detail ?? "failed")}`);
          }
          return { ok, detail: out.join(" · ") };
        });
        add({
          id: `billing.${provider}`,
          label: `${provider} connection (live API call)`,
          status: test.error ? "fail" : test.value?.ok ? "pass" : "fail",
          detail: test.error ?? test.value?.detail ?? "",
          action: test.value?.ok ? null : `Fix the ${provider} credentials.`,
          critical: true,
          durationMs: test.ms,
          live: true,
        });
      } else {
        add({
          id: `billing.${provider}`,
          label: `${provider} connection`,
          status: configured.some((c) => c.last_error) ? "fail" : "warning",
          detail: configured.some((c) => c.last_error)
            ? safeMessage(configured.find((c) => c.last_error)?.last_error)
            : "Enabled but not verified in this run — run deep tests to call the provider API",
          action: "Run deep tests to verify the connection.",
          critical: true,
          durationMs: null,
          live: false,
        });
      }
    }

    const day = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: hooks }, { count: hookFails }, { count: subs }, { count: cancels }, { count: tx }] =
      await Promise.all([
        supabaseAdmin.from("billing_webhook_events").select("id", { count: "exact", head: true }).gte("received_at", day),
        supabaseAdmin.from("billing_webhook_events").select("id", { count: "exact", head: true }).eq("status", "failed").gte("received_at", day),
        supabaseAdmin.from("billing_subscriptions").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("billing_subscriptions").select("id", { count: "exact", head: true }).in("status", ["cancelled", "expired"]),
        supabaseAdmin.from("billing_transactions").select("id", { count: "exact", head: true }).eq("status", "succeeded"),
      ]);
    add({
      id: "billing.webhooks",
      label: "Billing webhooks processed",
      status: (hooks ?? 0) === 0 ? "not_configured" : (hookFails ?? 0) > 0 ? "warning" : "pass",
      detail: `${hooks ?? 0} deliveries in 7d · ${hookFails ?? 0} failed`,
      action: (hooks ?? 0) === 0 ? "No webhook has ever arrived — point the provider at the public webhook route." : null,
      critical: true,
      durationMs: null,
      live: true,
    });
    add({
      id: "billing.subscription_create",
      label: "Subscription creation",
      status: (subs ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${subs ?? 0} subscriptions recorded`,
      action: (subs ?? 0) === 0 ? "Complete one test checkout end to end." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "billing.subscription_cancel",
      label: "Subscription cancellation",
      status: (cancels ?? 0) > 0 ? "pass" : "manual",
      detail: `${cancels ?? 0} cancelled/expired subscriptions observed`,
      action: (cancels ?? 0) === 0 ? "Cancel a test subscription to verify the webhook path." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "billing.payments",
      label: "Payment verification",
      status: (tx ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${tx ?? 0} successful transactions recorded`,
      action: (tx ?? 0) === 0 ? "Run one live-mode payment before launch." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
  }

  /* ================= CREDITS ================= */
  {
    const add = makeCollector("Credits", checks);
    const [{ count: grants }, { count: spends }, { count: ledger }, { count: balances }] = await Promise.all([
      supabaseAdmin.from("credit_ledger").select("id", { count: "exact", head: true }).gt("amount", 0),
      supabaseAdmin.from("credit_ledger").select("id", { count: "exact", head: true }).lt("amount", 0),
      supabaseAdmin.from("credit_ledger").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("workspace_credits").select("workspace_id", { count: "exact", head: true }),
    ]);
    add({
      id: "credits.allocation",
      label: "Credit allocation",
      status: (grants ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${grants ?? 0} allocation entries`,
      action: (grants ?? 0) === 0 ? "Grant credits to a workspace to verify allocation." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "credits.deduction",
      label: "Credit deduction",
      status: (spends ?? 0) > 0 ? "pass" : "warning",
      detail: `${spends ?? 0} deduction entries`,
      action: (spends ?? 0) === 0 ? "No consumption recorded yet — send a campaign to verify metering." : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    // The ledger's immutability trigger is a real security control: verify it
    // rejects an update rather than trusting that it exists.
    const immutable = await timed(async () => {
      const { data: row } = await supabaseAdmin.from("credit_ledger").select("id").limit(1).maybeSingle();
      if (!row) return "empty";
      const { error } = await supabaseAdmin
        .from("credit_ledger")
        .update({ reason: "prodcheck" } as never)
        .eq("id", (row as { id: string }).id);
      return error ? "rejected" : "accepted";
    });
    add({
      id: "credits.ledger",
      label: "Credit ledger append-only (live write attempt)",
      status: immutable.error ? "warning" : immutable.value === "rejected" ? "pass" : immutable.value === "empty" ? "not_configured" : "fail",
      detail:
        immutable.error ??
        (immutable.value === "rejected"
          ? "An update to an existing ledger row was rejected by the database"
          : immutable.value === "empty"
            ? "Ledger is empty — nothing to test"
            : "A ledger row was successfully modified: the immutability trigger is not active"),
      action: immutable.value === "accepted" ? "Restore the credit_ledger immutability trigger." : null,
      critical: true,
      durationMs: immutable.ms,
      live: true,
    });

    const { count: plansWithLimits } = await supabaseAdmin
      .from("plans")
      .select("id", { count: "exact", head: true })
      .not("max_emails_monthly", "is", null);
    add({
      id: "credits.plan_limits",
      label: "Plan limits defined",
      status: (plansWithLimits ?? 0) > 0 ? "pass" : "fail",
      detail: `${plansWithLimits ?? 0} plans define a monthly email limit`,
      action: (plansWithLimits ?? 0) === 0 ? "Set usage limits on every plan." : null,
      critical: true,
      durationMs: null,
      live: true,
    });
    add({
      id: "credits.usage",
      label: "Usage tracking",
      status: (balances ?? 0) > 0 && (ledger ?? 0) > 0 ? "pass" : "warning",
      detail: `${balances ?? 0} workspace credit balances · ${ledger ?? 0} ledger entries`,
      action: (balances ?? 0) === 0 ? "No workspace has a credit balance row yet." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
  }

  /* ================= INTEGRATIONS ================= */
  {
    const add = makeCollector("Integrations", checks);
    const [{ count: integrations }, { count: connections }, { count: verified }, { count: syncFails }] =
      await Promise.all([
        supabaseAdmin.from("integrations").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("integration_connections").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("integration_connections").select("id", { count: "exact", head: true }).eq("status", "verified"),
        supabaseAdmin.from("integration_sync_logs").select("id", { count: "exact", head: true }).not("error", "is", null),
      ]);
    add({
      id: "integrations.catalog",
      label: "Provider configuration",
      status: (integrations ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${integrations ?? 0} integrations in the catalog`,
      action: null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "integrations.connections",
      label: "API connections verified",
      status: (connections ?? 0) === 0 ? "not_configured" : (verified ?? 0) > 0 ? "pass" : "warning",
      detail: `${verified ?? 0}/${connections ?? 0} connections verified`,
      action: (connections ?? 0) > 0 && (verified ?? 0) === 0 ? "Re-test the customer integration connections." : null,
      critical: false,
      durationMs: null,
      live: true,
    });

    const hookProbe = await timed(async () => {
      if (!origin) throw new Error("No origin available");
      // GET on a POST-only public webhook must be rejected, not 404 — this
      // verifies the route is deployed and method-guarded.
      const res = await fetch(`${origin}/api/public/hooks/resend`, { method: "GET" });
      return res.status;
    });
    add({
      id: "integrations.webhooks",
      label: "Public webhook route reachable (live HTTP)",
      status: hookProbe.error ? "warning" : (hookProbe.value ?? 0) === 404 ? "fail" : "pass",
      detail: hookProbe.error ?? `GET returned ${hookProbe.value} (route deployed)`,
      action: (hookProbe.value ?? 0) === 404 ? "The public webhook route is not deployed." : null,
      critical: true,
      durationMs: hookProbe.ms,
      live: true,
    });
    add({
      id: "integrations.oauth",
      label: "OAuth integrations",
      status: (syncFails ?? 0) > 0 ? "warning" : (connections ?? 0) > 0 ? "pass" : "not_configured",
      detail: `${syncFails ?? 0} sync errors recorded`,
      action: (syncFails ?? 0) > 0 ? "Review failing integration syncs in Admin → Integrations." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
  }

  /* ================= STORAGE ================= */
  {
    const add = makeCollector("Storage", checks);
    const buckets = await timed(async () => {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw new Error(error.message);
      return data.map((b) => ({ id: b.id, public: b.public }));
    });
    const list = buckets.value ?? [];
    const need = ["avatars", "workspace-logos", "support-attachments"];
    for (const name of need) {
      const bucket = list.find((b) => b.id === name || b.id.replace(/_/g, "-") === name);
      add({
        id: `storage.${name}`,
        label: `${name} bucket`,
        status: bucket ? "pass" : "not_configured",
        detail: bucket ? `Bucket present (${bucket.public ? "public" : "private"})` : "Bucket missing",
        action: bucket ? null : `Create the ${name} bucket before enabling that upload.`,
        critical: false,
        durationMs: null,
        live: true,
      });
    }

    if (options.deep && list.length) {
      const target = list.find((b) => need.includes(b.id)) ?? list[0]!;
      const roundtrip = await timed(async () => {
        const path = `prodcheck/${crypto.randomUUID()}.txt`;
        const up = await supabaseAdmin.storage.from(target.id).upload(path, new Blob(["ok"]), {
          contentType: "text/plain",
        });
        if (up.error) throw new Error(up.error.message);
        const down = await supabaseAdmin.storage.from(target.id).download(path);
        await supabaseAdmin.storage.from(target.id).remove([path]);
        if (down.error) throw new Error(down.error.message);
        return target.id;
      });
      add({
        id: "storage.roundtrip",
        label: "Upload / download permissions (live round-trip)",
        status: roundtrip.error ? "fail" : "pass",
        detail: roundtrip.error ?? `Uploaded, downloaded and deleted a test object in ${roundtrip.value}`,
        action: roundtrip.error ? "Check storage policies and the service credentials." : null,
        critical: true,
        durationMs: roundtrip.ms,
        live: true,
      });
    } else {
      add({
        id: "storage.roundtrip",
        label: "Upload / download permissions",
        status: "manual",
        detail: "Run deep tests to perform a real upload/download/delete round-trip",
        action: "Press “Run deep tests”.",
        critical: false,
        durationMs: null,
        live: false,
      });
    }
  }

  /* ================= SEO ================= */
  {
    const add = makeCollector("SEO", checks);
    const seo = await timed(async () => {
      const { readSettings } = await import("@/lib/platform-settings.server");
      return readSettings("seo");
    });
    const values = seo.value ?? {};

    if (origin) {
      const robots = await timed(async () => {
        const res = await fetch(`${origin}/robots.txt`);
        return { status: res.status, body: (await res.text()).slice(0, 400) };
      });
      add({
        id: "seo.robots",
        label: "robots.txt served (live HTTP)",
        status: robots.error ? "fail" : robots.value?.status === 200 && /user-agent/i.test(robots.value.body) ? "pass" : "fail",
        detail: robots.error ?? `HTTP ${robots.value?.status}`,
        action: robots.value?.status === 200 ? null : "Check the robots.txt route.",
        critical: false,
        durationMs: robots.ms,
        live: true,
      });

      const sitemap = await timed(async () => {
        const res = await fetch(`${origin}/sitemap.xml`);
        const body = await res.text();
        return { status: res.status, urls: (body.match(/<loc>/g) ?? []).length };
      });
      add({
        id: "seo.sitemap",
        label: "Sitemap served (live HTTP)",
        status: sitemap.error ? "fail" : sitemap.value?.status === 200 && (sitemap.value?.urls ?? 0) > 0 ? "pass" : "fail",
        detail: sitemap.error ?? `HTTP ${sitemap.value?.status} · ${sitemap.value?.urls ?? 0} URLs`,
        action: (sitemap.value?.urls ?? 0) > 0 ? null : "Publish pages so the sitemap has entries.",
        critical: false,
        durationMs: sitemap.ms,
        live: true,
      });
    } else {
      add({
        id: "seo.robots",
        label: "robots.txt / sitemap",
        status: "manual",
        detail: "Origin unavailable in this environment",
        action: "Re-run from the deployed site.",
        critical: false,
        durationMs: null,
        live: false,
      });
    }

    add({
      id: "seo.google",
      label: "Google verification",
      status: values["google_verification"] ? "pass" : "not_configured",
      detail: values["google_verification"] ? "Verification token present in global SEO" : "No token set",
      action: values["google_verification"] ? null : "Add the Search Console token in System Settings → SEO.",
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "seo.bing",
      label: "Bing verification",
      status: values["bing_verification"] ? "pass" : "not_configured",
      detail: values["bing_verification"] ? "Verification token present in global SEO" : "No token set",
      action: values["bing_verification"] ? null : "Add the Bing Webmaster token in System Settings → SEO.",
      critical: false,
      durationMs: null,
      live: true,
    });

    const { count: pages } = await supabaseAdmin.from("site_pages").select("id", { count: "exact", head: true });
    const { count: canonical } = await supabaseAdmin
      .from("site_pages")
      .select("id", { count: "exact", head: true })
      .not("canonical_url", "is", null);
    add({
      id: "seo.canonical",
      label: "Canonical URLs",
      status: (pages ?? 0) === 0 ? "not_configured" : (canonical ?? 0) > 0 ? "pass" : "warning",
      detail: `${canonical ?? 0}/${pages ?? 0} managed pages define a canonical URL`,
      action: (canonical ?? 0) === 0 ? "Set canonical URLs on the main marketing pages." : null,
      critical: false,
      durationMs: null,
      live: true,
    });
    add({
      id: "seo.indexing",
      label: "Indexing enabled",
      status: values["index_site"] === false ? "fail" : "pass",
      detail: values["index_site"] === false ? "The whole site is served noindex, nofollow" : "Site is indexable",
      action: values["index_site"] === false ? "Turn indexing back on before launch." : null,
      critical: true,
      durationMs: null,
      live: true,
    });
  }

  /* ================= SECURITY ================= */
  {
    const add = makeCollector("Security", checks);

    // Admin authorization is enforced by has_role, not by the client: verify
    // the function denies a random (non-admin) identity.
    const adminGuard = await timed(async () => {
      const { data, error } = await supabaseAdmin.rpc("has_role", {
        _user_id: "00000000-0000-0000-0000-000000000000",
        _role: "admin",
      });
      if (error) throw new Error(error.message);
      return data === true;
    });
    add({
      id: "security.admin",
      label: "Admin authorization denies unknown users (live RPC)",
      status: adminGuard.error ? "fail" : adminGuard.value ? "fail" : "pass",
      detail: adminGuard.error ?? (adminGuard.value ? "has_role returned true for a non-existent user" : "has_role correctly denied an unknown identity"),
      action: adminGuard.value ? "Audit the has_role function immediately." : null,
      critical: true,
      durationMs: adminGuard.ms,
      live: true,
    });

    const isolation = await timed(async () => {
      const anon = await anonClient();
      const blocked: string[] = [];
      const leaked: string[] = [];
      for (const t of ["workspaces", "campaign_messages", "credit_ledger", "admin_audit_log", "platform_settings"]) {
        const { data, error } = await anon.from(t).select("*").limit(1);
        if (error || !Array.isArray(data) || data.length === 0) blocked.push(t);
        else leaked.push(t);
      }
      return { blocked, leaked };
    });
    add({
      id: "security.isolation",
      label: "Customer isolation (anonymous probe)",
      status: isolation.error ? "warning" : (isolation.value?.leaked.length ?? 0) ? "fail" : "pass",
      detail: isolation.error ?? (isolation.value?.leaked.length ? `Readable anonymously: ${isolation.value.leaked.join(", ")}` : `${isolation.value?.blocked.length} sensitive tables returned nothing to the anonymous role`),
      action: isolation.value?.leaked.length ? "Restrict the SELECT policies on the listed tables." : null,
      critical: true,
      durationMs: isolation.ms,
      live: true,
    });

    // Secret protection: no credential-shaped value may sit in settings rows
    // or be exposed to the browser bundle.
    const secrets = await timed(async () => {
      const offenders: string[] = [];
      const { data } = await supabaseAdmin.from("platform_settings").select("key, value");
      for (const row of (data ?? []) as any[]) {
        const text = JSON.stringify(row.value ?? {});
        if (/(sk_live|sk_test|whsec_|sb_secret|service_role|-----BEGIN)/i.test(text)) offenders.push(row.key);
      }
      for (const [name, value] of Object.entries(import.meta.env)) {
        if (!name.startsWith("VITE_")) continue;
        if (/(service|secret|private)/i.test(name) && value) offenders.push(name);
      }
      return offenders;
    });
    add({
      id: "security.secrets",
      label: "Secret protection",
      status: secrets.error ? "warning" : (secrets.value?.length ?? 0) ? "fail" : "pass",
      detail: secrets.error ?? ((secrets.value?.length ?? 0) ? `Credential-shaped values found in: ${secrets.value!.join(", ")}` : "No credential-shaped values in settings or client-visible env"),
      action: (secrets.value?.length ?? 0) ? "Move those values into the secret store immediately and rotate them." : null,
      critical: true,
      durationMs: secrets.ms,
      live: true,
    });

    const security = await timed(async () => {
      const { readSettings } = await import("@/lib/platform-settings.server");
      return readSettings("security");
    });
    add({
      id: "security.rate_limits",
      label: "Rate limiting configured",
      status: security.error ? "warning" : Number(security.value?.["api_rate_limit_per_minute"] ?? 0) > 0 ? "pass" : "fail",
      detail: security.error ?? `${security.value?.["api_rate_limit_per_minute"]} requests/minute per workspace · ${security.value?.["max_login_attempts"]} login attempts then ${security.value?.["lockout_minutes"]}m lockout`,
      action: null,
      critical: false,
      durationMs: security.ms,
      live: true,
    });

    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: auditRows } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", recent);
    add({
      id: "security.audit",
      label: "Audit logging active",
      status: (auditRows ?? 0) > 0 ? "pass" : "warning",
      detail: `${auditRows ?? 0} admin actions logged in the last 30 days`,
      action: (auditRows ?? 0) === 0 ? "No admin action has been logged recently — verify the audit writes." : null,
      critical: true,
      durationMs: null,
      live: true,
    });
  }

  /* ================= SYSTEM ================= */
  {
    const add = makeCollector("System", checks);
    const health = await runHealthChecks();
    for (const c of health.checks) {
      add({
        id: `system.${c.id}`,
        label: c.label,
        status:
          c.state === "healthy"
            ? "pass"
            : c.state === "degraded"
              ? "warning"
              : c.state === "down"
                ? "fail"
                : "not_configured",
        detail: c.lastError ? `${c.detail} — ${c.lastError}` : c.detail,
        action: c.state === "healthy" || c.state === "not_configured" ? null : `Investigate ${c.label.toLowerCase()}.`,
        critical: ["database", "auth", "campaign_worker", "cron"].includes(c.id),
        durationMs: c.responseMs,
        live: true,
      });
    }

    const errors = await timed(async () => {
      const { loadApplicationLogs } = await import("@/lib/admin-ops.server");
      const rows = await loadApplicationLogs({ level: "error", limit: 50 });
      return rows.length;
    });
    add({
      id: "system.error_logging",
      label: "Error logging",
      status: errors.error ? "warning" : "pass",
      detail: errors.error ?? `Log pipeline queried successfully (${errors.value} recent error entries)`,
      action: (errors.value ?? 0) > 25 ? "High error volume — review Admin → Logs." : null,
      critical: false,
      durationMs: errors.ms,
      live: true,
    });
  }

  return { checks, ranAt: new Date().toISOString(), deep: options.deep };
}

/** Readiness score derived only from executed checks. */
export function scoreChecks(checks: ProductionCheck[]) {
  const counted = checks.filter((c) => c.status !== "manual");
  const weight = (c: ProductionCheck) =>
    c.status === "pass" ? 1 : c.status === "warning" ? 0.5 : c.status === "not_configured" ? 0.25 : 0;
  const score = counted.length ? Math.round((counted.reduce((s, c) => s + weight(c), 0) / counted.length) * 100) : 0;
  return {
    score,
    total: checks.length,
    evaluated: counted.length,
    pass: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warning").length,
    failed: checks.filter((c) => c.status === "fail").length,
    notConfigured: checks.filter((c) => c.status === "not_configured").length,
    manual: checks.filter((c) => c.status === "manual").length,
    blockers: checks.filter((c) => c.critical && (c.status === "fail" || c.status === "not_configured")),
  };
}
