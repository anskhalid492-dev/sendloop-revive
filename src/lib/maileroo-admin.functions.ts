/**
 * Admin-only Maileroo infrastructure status.
 *
 * Reports whether the MunchReach-owned Maileroo account is configured and
 * healthy. Every value returned here is a status, a count or a timestamp —
 * never a credential, and never a raw provider response.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MailerooInfrastructureStatus = {
  accountConfigured: boolean;
  credentialSource: "provider_secret" | "platform_env" | "none";
  apiHealthy: boolean;
  apiDetail: string;
  domainApiAvailable: boolean;
  sendingAvailable: boolean;
  webhooksConfigured: boolean;
  managedDomains: number;
  managedMailboxes: number;
  lastApiCheckAt: string | null;
};

export const getMailerooInfrastructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailerooInfrastructureStatus> => {
    const { assertAdmin } = await import("@/lib/auth-settings.server");
    await assertAdmin(context as never);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readCredentials } = await import("@/lib/providers/adapter.server");
    const { platformKeyFor } = await import("@/lib/managed-sending.server");
    const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
    const { mailerooHeaders, MAILEROO_ACCOUNT_API } = await import(
      "@/lib/domain-providers/maileroo.server"
    );
    const { providerFetch } = await import("@/lib/domain-providers/adapter.server");

    const { data: providerRow } = await supabaseAdmin
      .from("email_providers")
      .select("id")
      .eq("provider", "maileroo")
      .maybeSingle();

    let credentials: Record<string, string> | null = null;
    let source: MailerooInfrastructureStatus["credentialSource"] = "none";

    if (providerRow?.id) {
      const { data: secret } = await supabaseAdmin
        .from("email_provider_secrets")
        .select("credentials_ciphertext")
        .eq("provider_id", providerRow.id)
        .maybeSingle();
      if (secret?.credentials_ciphertext) {
        try {
          credentials = readCredentials(secret.credentials_ciphertext);
          source = "provider_secret";
        } catch {
          credentials = null;
        }
      }
    }
    if (!credentials) {
      const envKey = platformKeyFor("maileroo");
      if (envKey) {
        credentials = { api_key: envKey };
        source = "platform_env";
      }
    }

    const [{ count: domainCount }, { count: mailboxCount }] = await Promise.all([
      supabaseAdmin
        .from("sending_domains")
        .select("id", { count: "exact", head: true })
        .eq("provider", "maileroo"),
      supabaseAdmin
        .from("sending_accounts")
        .select("id", { count: "exact", head: true })
        .eq("provider", "maileroo"),
    ]);

    const base: MailerooInfrastructureStatus = {
      accountConfigured: Boolean(credentials?.["api_key"]),
      credentialSource: source,
      apiHealthy: false,
      apiDetail: "No Maileroo account credential is configured yet.",
      domainApiAvailable: getDomainAdapter("maileroo").supportsDomainApi,
      sendingAvailable: false,
      webhooksConfigured: false,
      managedDomains: domainCount ?? 0,
      managedMailboxes: mailboxCount ?? 0,
      lastApiCheckAt: null,
    };
    if (!credentials?.["api_key"]) return base;

    // Read-only probe: listing domains proves authentication and domain access.
    const probe = await providerFetch(`${MAILEROO_ACCOUNT_API}/domains?page=1&per_page=1`, {
      headers: mailerooHeaders(credentials),
    });
    const webhooks = await providerFetch(`${MAILEROO_ACCOUNT_API}/webhooks?page=1&per_page=1`, {
      headers: mailerooHeaders(credentials),
    });
    const webhookRows = (() => {
      const payload = webhooks.json as { data?: unknown } | null;
      const data = payload?.data as { webhooks?: unknown[] } | unknown[] | undefined;
      if (Array.isArray(data)) return data.length;
      return Array.isArray(data?.webhooks) ? data.webhooks.length : 0;
    })();

    return {
      ...base,
      apiHealthy: probe.ok,
      apiDetail: probe.ok
        ? "The account API credential authenticated successfully."
        : `The account API rejected the credential [${probe.status}].`,
      sendingAvailable: probe.ok,
      webhooksConfigured: webhooks.ok && webhookRows > 0,
      lastApiCheckAt: new Date().toISOString(),
    };
  });
