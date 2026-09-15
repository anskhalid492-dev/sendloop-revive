/**
 * Why can't system email send right now?
 *
 * The admin UI used to show a generic "Provider unavailable". This module turns
 * that into the exact failing condition (nothing enabled for system email, no
 * stored key, failing health check, capacity exhausted), so an admin can act on
 * it. It reports statuses only — never a credential value.
 */
import { isProviderEnabledForScope } from "@/lib/email-provider-scope";
import { managedProviderLabel } from "@/lib/transactional/policy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Short, admin-facing reason no system-email provider can deliver. */
export async function diagnoseSystemProvider(admin: Admin): Promise<string> {
  try {
    const { loadPool, credentialsFor, hasCapacity } = await import("@/lib/provider-pool.server");
    const pool = await loadPool(admin);
    if (pool.length === 0) {
      return "No email provider is configured in Admin → Providers.";
    }

    const enabled = pool.filter((row) => isProviderEnabledForScope(row, "system"));
    if (enabled.length === 0) {
      return "No provider is enabled for system email — enable one for the system scope in Admin → Providers.";
    }

    const reasons: string[] = [];
    for (const row of enabled) {
      const label = managedProviderLabel(row.provider);
      if (row.health_status === "down") {
        reasons.push(
          `${label} is enabled for system email but its health check is failing${
            row.health_detail ? `: ${row.health_detail}` : "."
          }`,
        );
        continue;
      }
      if (!hasCapacity(row)) {
        reasons.push(`${label} has reached its hourly/daily sending capacity.`);
        continue;
      }
      const creds = await credentialsFor(admin, row);
      if (!creds) {
        reasons.push(`${label} is enabled for system email but has no API key stored.`);
        continue;
      }
      reasons.push(
        `${label} is enabled and credentialed but was not selected for system email routing.`,
      );
    }
    return reasons.join(" ");
  } catch (error) {
    return `Provider availability check failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}
