/**
 * Customer-owned mailboxes on MunchReach's managed sending infrastructure.
 *
 * The customer owns the domain and the mailbox. The sending provider and its
 * credentials are chosen and stored by MunchReach (admin-side) — customers can
 * never select a provider or submit credentials, and nothing provider-specific
 * is ever returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { clampMailboxHourlyLimit } from "@/lib/mailbox-hourly-cap";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertEmailOnDomain,
  loadVerifiedDomain,
  recordCheck,
  selectManagedProvider,
} from "@/lib/mailboxes.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const connectMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        domainId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email(),
        displayName: z.string().trim().min(1).max(80),
        dailyLimit: z.number().int().min(1).max(2000).default(50),
        hourlyLimit: z.number().int().min(1).transform(clampMailboxHourlyLimit).default(20),
        enableWarmup: z.boolean().default(true),
        warmupDailyTarget: z.number().int().min(1).max(200).default(20),
      })
      // .strict() so a crafted request cannot smuggle provider fields past the UI.
      .strict()
      .parse(input),
  )
  .handler(async () => {
    // RETIRED PATH — shared sending infrastructure.
    //
    // Customers now connect their own mailbox with their own SMTP/IMAP
    // credentials (`mailboxes` table, /mailboxes/add). Creating a shared-provider
    // `sending_accounts` row from a customer session is no longer permitted, so
    // no customer can end up sending campaigns through platform-owned
    // credentials. Admin-side management is unchanged.
    throw new Error(
      "Mailboxes are connected with your own email credentials. Open Email Accounts \u2192 Connect email account to add one.",
    );
  });

/** Re-validates the stored credentials against the provider. */
export const testMailboxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: account, error } = await client
      .from("sending_accounts")
      .select("id, workspace_id, provider, provider_id, connection_method, from_email, domain_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Mailbox not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The test must reflect the infrastructure that would actually carry a send
    // right now — never the provider recorded on the mailbox row.
    const { resolveMailboxSendingProvider } = await import("@/lib/mailbox-sending-provider.server");
    const resolved = await resolveMailboxSendingProvider(supabaseAdmin, {
      id: account.id as string,
      from_email: account.from_email as string,
      provider: (account.provider as string | null) ?? null,
      provider_id: (account.provider_id as string | null) ?? null,
    });
    if (!resolved) {
      console.warn(
        `[mailbox-test] refused: no active sending infrastructure for ${account.from_email} (recorded provider "${account.provider ?? "none"}").`,
      );
    }
    const credentials = resolved?.credentials ?? null;
    const activeProvider = resolved?.provider ?? (account.provider as string);
    if (!credentials) {
      await client
        .from("sending_accounts")
        .update({
          status: "failed",
          auth_status: "failed",
          last_tested_at: new Date().toISOString(),
          last_error: "Sending infrastructure is not configured yet. Please contact support.",
        })
        .eq("id", data.id);
      await recordCheck(client, {
        workspaceId: account.workspace_id as string,
        accountId: data.id,
        actorId: context.userId,
        kind: "test",
        ok: false,
        provider: account.provider as string,
        message: "Sending infrastructure is not configured yet. Please contact support.",
      });
      return { ok: false, message: "Sending infrastructure is not configured yet. Please contact support." };
    }

    const { testProviderCredentials } = await import("@/lib/provider-credentials.server");
    const {
      checkSenderDomainVerification,
      senderDomain,
      logManagedSend,
      DOMAIN_NOT_VERIFIED_MESSAGE,
      customerSafeMessage,
    } = await import("@/lib/managed-sending.server");
    const startedAt = Date.now();
    const test = await testProviderCredentials(activeProvider, credentials);

    // A mailbox is only active once its sender domain is verified with the
    // managed provider — never on provider credentials alone.
    const domain = senderDomain(account.from_email as string);
    const verification = test.ok
      ? await checkSenderDomainVerification(activeProvider, credentials, domain, {
          fresh: true,
        })
      : { status: "unknown" as const, detail: "Provider credentials check failed." };
    const domainBlocked = verification.status === "not_verified";
    const ok = test.ok && !domainBlocked;
    const rawMessage = domainBlocked ? DOMAIN_NOT_VERIFIED_MESSAGE : test.message;
    // Customers never see provider identity; the raw text is kept for admin logs.
    const message = ok ? "Connection verified." : customerSafeMessage(rawMessage);

    logManagedSend({
      stage: "test",
      workspaceId: account.workspace_id as string,
      mailboxId: account.id as string,
      senderAddress: account.from_email as string,
      senderDomain: domain,
      provider: activeProvider,
      credentialSource: "managed",
      verificationStatus: verification.status,
      verificationDetail: verification.detail,
      result: ok ? "sent" : "blocked",
      providerError: ok ? null : rawMessage,
    });

    const { error: updateError } = await client
      .from("sending_accounts")
      .update({
        status: domainBlocked ? "failed" : test.verified ? "verified" : test.ok ? "untested" : "failed",
        auth_status: domainBlocked ? "failed" : test.verified ? "verified" : test.ok ? "untested" : "failed",
        last_tested_at: new Date().toISOString(),
        last_error: ok ? null : message,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    await recordCheck(client, {
      workspaceId: account.workspace_id as string,
      accountId: data.id,
      actorId: context.userId,
      kind: "test",
      ok,
      provider: account.provider as string,
      message: rawMessage,
      durationMs: Date.now() - startedAt,
      detail: {
        verified: test.verified,
        domain,
        domainVerification: verification.status,
        providerError: ok ? null : rawMessage,
      },
    });
    return { ok, message, domainVerification: verification.status };
  });


export const updateMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        displayName: z.string().trim().min(1).max(80).optional(),
        dailyLimit: z.number().int().min(1).max(2000).optional(),
        hourlyLimit: z.number().int().min(1).transform(clampMailboxHourlyLimit).optional(),
        warmupDailyTarget: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.displayName !== undefined) {
      patch["from_name"] = data.displayName;
      patch["label"] = data.displayName;
    }
    if (data.dailyLimit !== undefined) patch["daily_limit"] = data.dailyLimit;
    if (data.hourlyLimit !== undefined) patch["hourly_limit"] = data.hourlyLimit;
    if (data.warmupDailyTarget !== undefined) patch["warmup_daily_target"] = data.warmupDailyTarget;
    if (Object.keys(patch).length === 0) return { ok: true };

    // RLS restricts this update to mailboxes in the caller's workspace where
    // they hold owner/admin/campaign_manager. Returning the row proves the
    // write landed instead of silently matching zero rows.
    const { data: updated, error } = await (context.supabase as Client)
      .from("sending_accounts")
      .update(patch)
      .eq("id", data.id)
      .select("id, daily_limit, hourly_limit, sent_today")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("You do not have permission to change this mailbox.");

    return {
      ok: true,
      dailyLimit: Number(updated.daily_limit ?? 0),
      sentToday: Number(updated.sent_today ?? 0),
      remaining: Math.max(0, Number(updated.daily_limit ?? 0) - Number(updated.sent_today ?? 0)),
    };

  });

/** Enables or disables warmup for a mailbox the customer owns. */
export const setMailboxWarmup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean(),
        dailyTarget: z.number().int().min(1).max(200).optional(),
        targetDays: z.number().int().min(3).max(90).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: account, error: readError } = await client
      .from("sending_accounts")
      .select("id, warmup_started_at, warmup_status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!account) throw new Error("Mailbox not found");

    const patch: Record<string, unknown> = data.enabled
      ? {
          warmup_status: "warming",
          warmup_started_at: account.warmup_started_at ?? new Date().toISOString(),
        }
      : { warmup_status: "not_started" };
    if (data.dailyTarget !== undefined) patch["warmup_daily_target"] = data.dailyTarget;
    if (data.targetDays !== undefined) patch["warmup_target_days"] = data.targetDays;

    const { error } = await client.from("sending_accounts").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });

/** Tests several mailboxes in one action (bulk onboarding/maintenance). */
export const bulkTestMailboxes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: accounts, error } = await client
      .from("sending_accounts")
      .select("id, workspace_id, from_email, provider, provider_id, connection_method")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveMailboxSendingProvider } = await import("@/lib/mailbox-sending-provider.server");
    const { testProviderCredentials } = await import("@/lib/provider-credentials.server");
    const { customerSafeMessage } = await import("@/lib/managed-sending.server");

    const results: Array<{ id: string; email: string; ok: boolean; message: string }> = [];
    // Sequential on purpose: providers rate-limit credential checks.
    for (const account of (accounts ?? []) as Array<Record<string, unknown>>) {
      const id = account["id"] as string;
      const startedAt = Date.now();
      // Dynamic resolution: a mailbox must never report healthy against the
      // provider recorded on its row when that infrastructure is switched off.
      const resolved = await resolveMailboxSendingProvider(supabaseAdmin, {
        id,
        from_email: account["from_email"] as string,
        provider: (account["provider"] as string | null) ?? null,
        provider_id: (account["provider_id"] as string | null) ?? null,
      });
      const method = resolved?.provider ?? (account["provider"] as string);
      if (!resolved) {
        console.warn(
          `[mailbox-test] refused: no active sending infrastructure for ${account["from_email"]} (recorded provider "${account["provider"] ?? "none"}").`,
        );
      }
      const test = resolved
        ? await testProviderCredentials(method, resolved.credentials)
        : { ok: false, verified: false, message: "Sending infrastructure is not configured yet. Please contact support." };

      await client
        .from("sending_accounts")
        .update({
          status: test.verified ? "verified" : test.ok ? "untested" : "failed",
          auth_status: test.verified ? "verified" : test.ok ? "untested" : "failed",
          last_tested_at: new Date().toISOString(),
          last_error: test.ok ? null : customerSafeMessage(test.message),
        })
        .eq("id", id);

      await recordCheck(client, {
        workspaceId: account["workspace_id"] as string,
        accountId: id,
        actorId: context.userId,
        kind: "test",
        ok: test.ok,
        provider: method,
        message: test.message,
        durationMs: Date.now() - startedAt,
        detail: { verified: test.verified, bulk: true, providerError: test.ok ? null : test.message },
      });

      results.push({
        id,
        email: account["from_email"] as string,
        ok: test.ok,
        message: test.ok ? "Connection verified." : customerSafeMessage(test.message),
      });
    }

    return { results, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  });

/** Disconnects a customer-owned mailbox and destroys its stored credentials. */
export const removeMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: deleted, error } = await client
      .from("sending_accounts")
      .delete()
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);

    const removedIds = ((deleted ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (removedIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("sending_account_secrets")
        .delete()
        .in("sending_account_id", removedIds);
    }
    return { ok: true, removed: removedIds.length };
  });
