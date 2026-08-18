/**
 * Customer-owned mailboxes.
 *
 * The customer owns the domain and the mailbox; Sendloop only stores the
 * connection. Credentials are validated against the provider before a mailbox
 * is ever marked active, are encrypted server-side and are never returned to
 * the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAILBOX_METHODS } from "@/lib/domains-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const methodEnum = z.enum([
  "resend",
  "sendgrid",
  "postmark",
  "mailgun",
  "brevo",
  "zeptomail",
]);

const credentialsSchema = z.record(z.string(), z.string().trim().min(1).max(500));

function assertRequiredFields(method: string, credentials: Record<string, string>) {
  const definition = MAILBOX_METHODS.find((m) => m.id === method);
  if (!definition) throw new Error("Unsupported connection method");
  for (const field of definition.fields) {
    if (!credentials[field.name]?.trim()) throw new Error(`${field.label} is required`);
  }
}

async function loadVerifiedDomain(client: Client, domainId: string) {
  const { data: domain, error } = await client
    .from("sending_domains")
    .select("id, workspace_id, domain, dns_status, spf_status, dkim_status, dmarc_status, mx_status")
    .eq("id", domainId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!domain) throw new Error("Domain not found");
  if (domain.dns_status !== "verified") {
    throw new Error("Verify this domain's DNS records before connecting a mailbox.");
  }
  return domain;
}

function assertEmailOnDomain(email: string, domain: string) {
  const host = email.split("@")[1]?.toLowerCase() ?? "";
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    throw new Error(`The email address must be on ${domain}.`);
  }
}

export const connectMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        domainId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email(),
        displayName: z.string().trim().min(1).max(80),
        replyTo: z.string().trim().email().or(z.literal("")).optional(),
        method: methodEnum,
        credentials: credentialsSchema,
        dailyLimit: z.number().int().min(1).max(2000).default(50),
        hourlyLimit: z.number().int().min(1).max(500).default(20),
        enableWarmup: z.boolean().default(true),
        warmupDailyTarget: z.number().int().min(1).max(200).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const domain = await loadVerifiedDomain(client, data.domainId);
    assertEmailOnDomain(data.email, domain.domain as string);
    assertRequiredFields(data.method, data.credentials);

    // Real provider check — a mailbox is never activated on trust.
    const { testProviderCredentials, encryptCredentials } = await import(
      "@/lib/provider-credentials.server"
    );
    const test = await testProviderCredentials(data.method, data.credentials);
    if (!test.ok) throw new Error(test.message);

    const now = new Date().toISOString();
    const { data: created, error } = await client
      .from("sending_accounts")
      .insert({
        workspace_id: domain.workspace_id,
        domain_id: domain.id,
        provider: data.method,
        connection_method: data.method,
        label: data.displayName,
        from_name: data.displayName,
        from_email: data.email,
        reply_to: data.replyTo || null,
        daily_limit: data.dailyLimit,
        hourly_limit: data.hourlyLimit,
        status: test.verified ? "verified" : "untested",
        auth_status: test.verified ? "verified" : "untested",
        last_tested_at: now,
        last_error: test.verified ? null : test.message,
        spf_status: domain.spf_status === "verified" ? "pass" : "unknown",
        dkim_status: domain.dkim_status === "verified" ? "pass" : "unknown",
        dmarc_status: domain.dmarc_status === "verified" ? "pass" : "unknown",
        mx_status: domain.mx_status === "verified" ? "pass" : "unknown",
        warmup_status: data.enableWarmup ? "warming" : "not_started",
        warmup_started_at: data.enableWarmup ? now : null,
        warmup_daily_target: data.warmupDailyTarget,
        customer_enabled: true,
        paused: false,
        created_by: context.userId,
        assigned_at: now,
      })
      .select("id")
      .single();
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        throw new Error("That mailbox is already connected.");
      }
      throw new Error(error.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: secretError } = await supabaseAdmin.from("sending_account_secrets").upsert(
      {
        sending_account_id: created.id as string,
        credentials_ciphertext: encryptCredentials(data.credentials),
      },
      { onConflict: "sending_account_id" },
    );
    if (secretError) {
      await client.from("sending_accounts").delete().eq("id", created.id);
      throw new Error("Could not store the mailbox credentials securely.");
    }

    return { id: created.id as string, verified: test.verified, message: test.message };
  });

/** Replaces stored credentials for an existing mailbox and re-tests it. */
export const reconnectMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        method: methodEnum,
        credentials: credentialsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    assertRequiredFields(data.method, data.credentials);

    const { data: account, error } = await client
      .from("sending_accounts")
      .select("id, workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Mailbox not found");

    const { testProviderCredentials, encryptCredentials } = await import(
      "@/lib/provider-credentials.server"
    );
    const test = await testProviderCredentials(data.method, data.credentials);
    if (!test.ok) throw new Error(test.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: secretError } = await supabaseAdmin.from("sending_account_secrets").upsert(
      {
        sending_account_id: data.id,
        credentials_ciphertext: encryptCredentials(data.credentials),
      },
      { onConflict: "sending_account_id" },
    );
    if (secretError) throw new Error("Could not store the mailbox credentials securely.");

    const { error: updateError } = await client
      .from("sending_accounts")
      .update({
        provider: data.method,
        connection_method: data.method,
        status: test.verified ? "verified" : "untested",
        auth_status: test.verified ? "verified" : "untested",
        last_tested_at: new Date().toISOString(),
        last_error: test.verified ? null : test.message,
        paused: false,
        customer_enabled: true,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, verified: test.verified, message: test.message };
  });

/** Re-validates the stored credentials against the provider. */
export const testMailboxConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: account, error } = await client
      .from("sending_accounts")
      .select("id, provider, provider_id, connection_method")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Mailbox not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAccountCredentials } = await import("@/lib/account-credentials.server");
    const credentials = await loadAccountCredentials(supabaseAdmin, {
      id: account.id as string,
      provider_id: (account.provider_id as string | null) ?? null,
    });
    if (!credentials) {
      await client
        .from("sending_accounts")
        .update({
          status: "failed",
          auth_status: "failed",
          last_tested_at: new Date().toISOString(),
          last_error: "No stored credentials — reconnect this mailbox.",
        })
        .eq("id", data.id);
      return { ok: false, message: "No stored credentials — reconnect this mailbox." };
    }

    const { testProviderCredentials } = await import("@/lib/provider-credentials.server");
    const test = await testProviderCredentials(
      (account.connection_method as string) || (account.provider as string),
      credentials,
    );
    const { error: updateError } = await client
      .from("sending_accounts")
      .update({
        status: test.verified ? "verified" : test.ok ? "untested" : "failed",
        auth_status: test.verified ? "verified" : test.ok ? "untested" : "failed",
        last_tested_at: new Date().toISOString(),
        last_error: test.ok ? null : test.message,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);
    return { ok: test.ok, message: test.message };
  });

export const updateMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        displayName: z.string().trim().min(1).max(80).optional(),
        replyTo: z.string().trim().email().or(z.literal("")).optional(),
        dailyLimit: z.number().int().min(1).max(2000).optional(),
        hourlyLimit: z.number().int().min(1).max(500).optional(),
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
    if (data.replyTo !== undefined) patch["reply_to"] = data.replyTo || null;
    if (data.dailyLimit !== undefined) patch["daily_limit"] = data.dailyLimit;
    if (data.hourlyLimit !== undefined) patch["hourly_limit"] = data.hourlyLimit;
    if (data.warmupDailyTarget !== undefined) patch["warmup_daily_target"] = data.warmupDailyTarget;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await (context.supabase as Client)
      .from("sending_accounts")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
