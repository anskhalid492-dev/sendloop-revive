/**
 * Admin-entered billing provider credentials. Server only.
 *
 * Keys are encrypted at rest with the platform credential key and stored in a
 * service-role-only table, so no browser session can ever read them back. The
 * admin UI only ever sees a masked preview (last 4 characters) plus the source
 * (entered in the dashboard vs. inherited from a project environment variable).
 */
import type { BillingEnvironment, BillingProvider } from "@/lib/billing/model";
import { BILLING_ENVIRONMENTS, BILLING_PROVIDERS, secretName } from "@/lib/billing/model";
import { CREDENTIAL_FIELDS, admin, readSecret, storedProviderSecrets, writeAudit } from "@/lib/billing/core.server";

export type CredentialField = "apiKey" | "webhookSecret" | "storeId";

export type CredentialFieldStatus = {
  field: CredentialField;
  envName: string;
  present: boolean;
  source: "dashboard" | "environment" | "none";
  last4: string | null;
};

export type ProviderSecretStatus = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  updatedAt: string | null;
  fields: CredentialFieldStatus[];
};

function last4(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

export async function loadProviderSecretStatus(): Promise<ProviderSecretStatus[]> {
  const db = await admin();
  const { data } = await db.from("billing_provider_secrets").select("provider, environment, updated_at");
  const rows: ProviderSecretStatus[] = [];

  for (const provider of BILLING_PROVIDERS) {
    for (const environment of BILLING_ENVIRONMENTS) {
      const stored = await storedProviderSecrets(provider, environment);
      const meta = (data ?? []).find(
        (r: { provider: string; environment: string }) =>
          r.provider === provider && r.environment === environment,
      );
      const fields = CREDENTIAL_FIELDS[provider].map(({ field, base }) => {
        const dashboard = stored[field];
        if (dashboard && dashboard.trim())
          return {
            field,
            envName: secretName(base, environment),
            present: true,
            source: "dashboard" as const,
            last4: last4(dashboard),
          };
        const env = readSecret(base, environment);
        return {
          field,
          envName: secretName(base, environment),
          present: Boolean(env),
          source: env ? ("environment" as const) : ("none" as const),
          last4: env ? last4(env) : null,
        };
      });
      rows.push({ provider, environment, updatedAt: meta?.updated_at ?? null, fields });
    }
  }
  return rows;
}

/**
 * Saves credentials for one provider+environment. Fields left blank keep their
 * previously stored value; passing an empty string with `clearBlank` removes it.
 */
export async function saveProviderSecrets(input: {
  provider: BillingProvider;
  environment: BillingEnvironment;
  values: Partial<Record<CredentialField, string | undefined>>;
  userId: string;
}) {
  const { provider, environment, userId } = input;
  const allowed = CREDENTIAL_FIELDS[provider].map((f) => f.field);
  const existing = await storedProviderSecrets(provider, environment);
  const next: Record<string, string> = { ...existing } as Record<string, string>;

  for (const field of allowed) {
    const raw = input.values[field];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value) next[field] = value;
    else delete next[field];
  }

  const db = await admin();
  if (Object.keys(next).length === 0) {
    await db.from("billing_provider_secrets").delete().eq("provider", provider).eq("environment", environment);
  } else {
    const { encryptCredentials } = await import("@/lib/provider-credentials.server");
    const { error } = await db.from("billing_provider_secrets").upsert(
      {
        provider,
        environment,
        ciphertext: encryptCredentials(next),
        meta: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, last4(v)])),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,environment" },
    );
    if (error) throw new Error(error.message);
  }

  await writeAudit({
    userId,
    action: "provider.credentials_saved",
    detail: { provider, environment, fields: Object.keys(next) },
  });

  return loadProviderSecretStatus();
}

/** Removes every dashboard-entered credential for a provider+environment. */
export async function clearProviderSecrets(
  provider: BillingProvider,
  environment: BillingEnvironment,
  userId: string,
) {
  const db = await admin();
  await db.from("billing_provider_secrets").delete().eq("provider", provider).eq("environment", environment);
  await writeAudit({ userId, action: "provider.credentials_cleared", detail: { provider, environment } });
  return loadProviderSecretStatus();
}
