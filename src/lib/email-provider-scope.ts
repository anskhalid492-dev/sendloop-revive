/**
 * Email provider scopes.
 *
 * Every MunchReach email provider has two INDEPENDENT permissions:
 *
 *   customer  -> customer (campaign) email
 *   system    -> admin / system transactional email
 *
 * The model is generic: a provider is never named here, so adding a new
 * provider automatically gets both toggles and both enforcement paths.
 * Pure module — no I/O, safe to unit test.
 */

export const EMAIL_SCOPES = ["customer", "system"] as const;
export type EmailScope = (typeof EMAIL_SCOPES)[number];

/** Row column backing each scope's permission. */
export const SCOPE_COLUMN: Record<EmailScope, "customer_enabled" | "system_enabled"> = {
  customer: "customer_enabled",
  system: "system_enabled",
};

export const SCOPE_LABEL: Record<EmailScope, string> = {
  customer: "Customer emails",
  system: "Admin / system emails",
};

export type ScopedProviderRow = {
  is_enabled?: boolean | null;
  customer_enabled?: boolean | null;
  system_enabled?: boolean | null;
};

/**
 * Whether a provider row may carry email for one scope.
 *
 * A missing scope column (older row / older deployment) falls back to the
 * legacy `is_enabled` switch so behaviour never regresses.
 */
export function isProviderEnabledForScope(row: ScopedProviderRow, scope: EmailScope): boolean {
  const value = row[SCOPE_COLUMN[scope]];
  if (value === null || value === undefined) return row.is_enabled !== false;
  return value === true;
}

export function filterProvidersForScope<T extends ScopedProviderRow>(
  rows: T[],
  scope: EmailScope,
): T[] {
  return rows.filter((row) => isProviderEnabledForScope(row, scope));
}

/** The legacy master switch stays consistent: on when either scope is on. */
export function masterEnabled(row: {
  customer_enabled: boolean;
  system_enabled: boolean;
}): boolean {
  return row.customer_enabled || row.system_enabled;
}

export function isEmailScope(value: unknown): value is EmailScope {
  return typeof value === "string" && (EMAIL_SCOPES as readonly string[]).includes(value);
}
