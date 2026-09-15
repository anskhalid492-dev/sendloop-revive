/**
 * System (transactional) email provider selection.
 *
 * MunchReach templates, sender identities, reply-to, unsubscribe headers and
 * tracking are provider-independent. This module only answers ONE question:
 * which delivery provider carries the already-rendered message.
 *
 *   MunchReach template -> MunchReach sender identity -> provider -> recipient
 *
 * Rules:
 *  - An admin may pin the Active provider (Resend / Amazon SES / Maileroo).
 *    A pinned provider is used for every system email category; nothing is
 *    left behind on the previously active provider.
 *  - A pinned provider that is not usable never silently changes production
 *    sending: the existing managed provider keeps working and the reason is
 *    reported to admins.
 *  - With no pin ("auto"), Amazon SES is used only when it is explicitly
 *    enabled AND usable; otherwise the managed provider delivers.
 *
 * Pure module: no I/O, safe to unit test.
 */

/** Providers an admin can pin as the Active system-email provider. */
export type SystemProviderId = "resend" | "ses" | "maileroo";

/** Stored setting value; "auto" keeps the historical automatic behaviour. */
export type SystemProviderSelection = "auto" | SystemProviderId;

export const SYSTEM_PROVIDER_OPTIONS: SystemProviderSelection[] = [
  "auto",
  "resend",
  "ses",
  "maileroo",
];

export function isSystemProviderSelection(value: unknown): value is SystemProviderSelection {
  return typeof value === "string" && (SYSTEM_PROVIDER_OPTIONS as string[]).includes(value);
}

export type SystemEmailProviderChoice = {
  /** Provider to attempt first. "managed" = the configured managed pool. */
  provider: "ses" | "managed" | "maileroo";
  /** Provider to use if the primary attempt fails; null = no fallback. */
  fallback: "managed" | null;
  reason: string;
};

export type SystemProviderInput = {
  /** Explicit admin switch (`ses_enabled` in system email settings). */
  sesEnabled: boolean;
  /** Server-side SES credentials resolved successfully. */
  sesCredentialsAvailable: boolean;
  /** SES account reports sending as enabled (unknown => treated as usable). */
  sesSendingEnabled?: boolean | undefined;
  /** An existing managed provider is configured and can deliver. */
  managedAvailable: boolean;
  /** Admin-pinned Active provider; defaults to "auto". */
  activeProvider?: SystemProviderSelection | undefined;
  /** Maileroo is configured server-side and allowed for system email. */
  mailerooAvailable?: boolean | undefined;
};

export function selectSystemEmailProvider(
  input: SystemProviderInput,
): SystemEmailProviderChoice {
  const sesUsable =
    input.sesCredentialsAvailable && input.sesSendingEnabled !== false;
  const active: SystemProviderSelection = isSystemProviderSelection(input.activeProvider)
    ? input.activeProvider
    : "auto";

  if (active === "maileroo") {
    if (input.mailerooAvailable) {
      return {
        provider: "maileroo",
        fallback: null,
        reason: "Maileroo is the active system email provider.",
      };
    }
    return {
      provider: "managed",
      fallback: null,
      reason: "Maileroo is selected but not configured; using the existing provider.",
    };
  }

  if (active === "ses") {
    if (sesUsable) {
      return {
        provider: "ses",
        fallback: null,
        reason: "Amazon SES is the active system email provider.",
      };
    }
    return {
      provider: "managed",
      fallback: null,
      reason: "Amazon SES is selected but not connected; using the existing provider.",
    };
  }

  if (active === "resend") {
    return {
      provider: "managed",
      fallback: null,
      reason: "The managed provider is the active system email provider.",
    };
  }

  // Automatic (historical behaviour).
  if (input.sesEnabled && sesUsable) {
    return {
      provider: "ses",
      fallback: input.managedAvailable ? "managed" : null,
      reason: "Amazon SES is enabled for system email delivery.",
    };
  }

  if (input.sesEnabled && !input.sesCredentialsAvailable) {
    return {
      provider: "managed",
      fallback: null,
      reason: "Amazon SES is enabled but not connected; using the existing provider.",
    };
  }

  return {
    provider: "managed",
    fallback: null,
    reason: "Amazon SES is not enabled; using the existing provider.",
  };
}
