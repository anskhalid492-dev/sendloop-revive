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
 *  - Amazon SES is used only when it is explicitly enabled AND usable.
 *    Merely configuring credentials never switches production sending.
 *  - When SES is enabled but unusable (no credentials / sending disabled),
 *    the existing managed provider keeps working exactly as before.
 *  - A failed SES attempt falls back to the existing managed provider once.
 *
 * Pure module: no I/O, safe to unit test.
 */

export type SystemEmailProviderChoice = {
  /** Provider id to attempt first. */
  provider: "ses" | "managed";
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
};

export function selectSystemEmailProvider(
  input: SystemProviderInput,
): SystemEmailProviderChoice {
  const sesUsable =
    input.sesEnabled &&
    input.sesCredentialsAvailable &&
    input.sesSendingEnabled !== false;

  if (sesUsable) {
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
