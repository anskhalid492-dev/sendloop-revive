/**
 * Maileroo as a system-email delivery channel.
 *
 * Server-only. Maileroo is MunchReach-owned infrastructure: the account API key
 * lives in platform secrets (or the provider secret row) and the per-domain
 * sending key is provisioned automatically. No credential is ever returned to a
 * browser or written to a log by this module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type SystemMailerooChannel = {
  providerId: string | null;
  credentials: Record<string, string>;
};

/** Resolves MunchReach's Maileroo credentials for system email, or null. */
export async function resolveSystemMaileroo(
  admin: Admin,
  fromEmail: string,
): Promise<SystemMailerooChannel | null> {
  try {
    const { resolveManagedProvider } = await import("@/lib/managed-sending.server");
    const managed = await resolveManagedProvider(
      admin,
      { provider: "maileroo", provider_id: null, from_email: fromEmail },
      { scope: "system" },
    );
    if (!managed || managed.provider !== "maileroo") return null;
    return { providerId: managed.providerId, credentials: managed.credentials };
  } catch (error) {
    console.error("[system-email] Maileroo credential lookup failed:", error);
    return null;
  }
}

/**
 * Maileroo verifies at the DOMAIN level, so every MunchReach sender identity on
 * a verified domain is usable as a From address without per-address setup.
 */
export async function mailerooVerifiedDomains(
  credentials: Record<string, string>,
  domains: string[],
): Promise<Record<string, string>> {
  const { checkSenderDomainVerification } = await import("@/lib/managed-sending.server");
  const states: Record<string, string> = {};
  await Promise.all(
    domains.map(async (domain) => {
      try {
        const check = await checkSenderDomainVerification("maileroo", credentials, domain);
        states[domain] = check.status === "verified" ? "verified" : check.status;
      } catch {
        states[domain] = "unknown";
      }
    }),
  );
  return states;
}
