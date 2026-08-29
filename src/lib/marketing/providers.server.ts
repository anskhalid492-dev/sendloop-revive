/**
 * Marketing provider manager (server-only).
 *
 * Credentials live in `marketing_provider_secrets`, encrypted with the same
 * AES-GCM helper the outbound provider pool uses, and that table is reachable
 * only through the service-role client — no browser session can read it under
 * any RLS policy, because it has none.
 *
 * Sending and connection testing delegate to the existing provider layer, so
 * marketing email uses exactly the same battle-tested provider transport as
 * the rest of MunchReach. Marketing providers stay in their OWN table so the
 * customer sending pool and internal marketing sending can never share
 * credentials, reputation or limits.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  decryptCredentials,
  encryptCredentials,
  sendProviderEmail,
  testProviderCredentials,
  type OutboundEmail,
} from "@/lib/provider-credentials.server";

import type { MarketingProvider, ProviderType } from "./types";

export { MARKETING_PROVIDER_TYPES } from "./provider-types";

type ProviderRow = {
  id: string;
  name: string;
  provider_type: string;
  status: string;
  connection_status: string;
  health: string;
  last_tested_at: string | null;
  last_test_message: string | null;
  daily_send_limit: number | null;
  rate_per_second: number | null;
  created_at: string;
};

function toProvider(row: ProviderRow, hasCredentials: boolean): MarketingProvider {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type as ProviderType,
    status: row.status as MarketingProvider["status"],
    connectionStatus: row.connection_status as MarketingProvider["connectionStatus"],
    health: row.health as MarketingProvider["health"],
    lastTestedAt: row.last_tested_at,
    lastTestMessage: row.last_test_message,
    dailySendLimit: row.daily_send_limit,
    ratePerSecond: row.rate_per_second,
    hasCredentials,
    createdAt: row.created_at,
  };
}

export async function listMarketingProviders(): Promise<MarketingProvider[]> {
  const [{ data: rows, error }, { data: secrets }] = await Promise.all([
    supabaseAdmin
      .from("marketing_email_providers")
      .select("*")
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("marketing_provider_secrets").select("provider_id"),
  ]);
  if (error) throw new Error(error.message);
  const withSecrets = new Set((secrets ?? []).map((s: { provider_id: string }) => s.provider_id));
  return ((rows ?? []) as ProviderRow[]).map((row) => toProvider(row, withSecrets.has(row.id)));
}

export async function getMarketingProvider(id: string): Promise<MarketingProvider | null> {
  const { data, error } = await supabaseAdmin
    .from("marketing_email_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secret } = await supabaseAdmin
    .from("marketing_provider_secrets")
    .select("provider_id")
    .eq("provider_id", id)
    .maybeSingle();
  return toProvider(data as ProviderRow, Boolean(secret));
}

/** Credentials are write-only from the UI: they go in, they never come back out. */
export async function saveProviderCredentials(
  providerId: string,
  credentials: Record<string, string>,
): Promise<void> {
  const clean: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(credentials)) {
    const value = String(rawValue ?? "").trim();
    if (value) clean[key] = value;
  }
  if (Object.keys(clean).length === 0) return;
  const { error } = await supabaseAdmin.from("marketing_provider_secrets").upsert(
    {
      provider_id: providerId,
      encrypted_credentials: encryptCredentials(clean),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );
  if (error) throw new Error(error.message);
}

export async function loadProviderCredentials(
  providerId: string,
): Promise<Record<string, string> | null> {
  const { data, error } = await supabaseAdmin
    .from("marketing_provider_secrets")
    .select("encrypted_credentials")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.encrypted_credentials) return null;
  try {
    return decryptCredentials<Record<string, string>>(data.encrypted_credentials);
  } catch {
    return null;
  }
}

export async function deleteProviderCredentials(providerId: string): Promise<void> {
  await supabaseAdmin.from("marketing_provider_secrets").delete().eq("provider_id", providerId);
}

/** Runs a real provider credential check and records the outcome. */
export async function testMarketingProvider(providerId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const provider = await getMarketingProvider(providerId);
  if (!provider) return { ok: false, message: "Provider not found." };
  const credentials = await loadProviderCredentials(providerId);
  if (!credentials) {
    await recordProviderTest(providerId, false, "No credentials stored.");
    return { ok: false, message: "No credentials stored for this provider." };
  }
  let ok = false;
  let message = "Connection test failed.";
  try {
    const result = await testProviderCredentials(provider.providerType, credentials);
    ok = result.ok;
    message = result.message;
  } catch (error) {
    message = error instanceof Error ? error.message : "Connection test failed.";
  }
  await recordProviderTest(providerId, ok, message);
  return { ok, message };
}

export async function recordProviderTest(providerId: string, ok: boolean, message: string) {
  await supabaseAdmin
    .from("marketing_email_providers")
    .update({
      connection_status: ok ? "connected" : "failed",
      health: ok ? "healthy" : "down",
      last_tested_at: new Date().toISOString(),
      last_test_message: message.slice(0, 500),
    })
    .eq("id", providerId);
}

export type MarketingSendResult = {
  ok: boolean;
  messageId?: string | undefined;
  message: string;
};

/** Sends one marketing email through the configured provider. */
export async function sendThroughMarketingProvider(
  providerId: string,
  email: OutboundEmail,
): Promise<MarketingSendResult> {
  const provider = await getMarketingProvider(providerId);
  if (!provider) return { ok: false, message: "Provider not found." };
  if (provider.status !== "active") return { ok: false, message: "Provider is not active." };
  const credentials = await loadProviderCredentials(providerId);
  if (!credentials) return { ok: false, message: "No credentials stored for this provider." };
  try {
    const result = await sendProviderEmail(provider.providerType, credentials, email);
    if (!result.ok) {
      await supabaseAdmin
        .from("marketing_email_providers")
        .update({ health: "degraded", last_test_message: result.message.slice(0, 500) })
        .eq("id", providerId);
    }
    return { ok: result.ok, messageId: result.messageId, message: result.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider send failed.";
    await supabaseAdmin
      .from("marketing_email_providers")
      .update({ health: "down", last_test_message: message.slice(0, 500) })
      .eq("id", providerId);
    return { ok: false, message };
  }
}
