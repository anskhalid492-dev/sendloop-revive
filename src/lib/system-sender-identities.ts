/**
 * Editable MunchReach system sender identities.
 *
 * The shipped mapping in `system-email-senders.ts` is the default. Admins may
 * override each identity (address, display name, reply-to, provider
 * preference, active state); overrides are persisted as platform settings and
 * merged on top of the defaults here.
 *
 * Pure module — no I/O — so both the admin API and the send path resolve the
 * exact same identity. Templates, rendering and the sending pipeline itself
 * are untouched by this module.
 */

import {
  SYSTEM_SENDERS,
  type SystemEmailPurpose,
  type SystemSender,
} from "@/lib/system-email-senders";

/** Which delivery provider an identity should use. */
export type SenderProviderPreference = "auto" | "managed" | "ses";

export const SENDER_PROVIDER_OPTIONS: SenderProviderPreference[] = ["auto", "managed", "ses"];

export type SenderIdentityOverride = {
  email?: string;
  name?: string;
  replyTo?: string;
  provider?: SenderProviderPreference;
  active?: boolean;
};

export type SenderIdentityOverrides = Partial<Record<SystemEmailPurpose, SenderIdentityOverride>>;

export type ResolvedSenderIdentity = SystemSender & {
  provider: SenderProviderPreference;
  active: boolean;
  /** True when an admin changed anything away from the shipped default. */
  customized: boolean;
};

/** What the platform can actually deliver with right now. */
export type ProviderAvailability = {
  /** A managed provider (Resend etc.) is configured and able to deliver. */
  managedAvailable: boolean;
  /** Amazon SES is switched on for system email. */
  sesEnabled: boolean;
  /** Amazon SES credentials resolved. */
  sesConnected: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSenderProviderPreference(value: unknown): value is SenderProviderPreference {
  return typeof value === "string" && (SENDER_PROVIDER_OPTIONS as string[]).includes(value);
}

/** Whether a provider choice can be used given the real backend state. */
export function providerOptionAvailable(
  option: SenderProviderPreference,
  availability: ProviderAvailability,
): boolean {
  if (option === "auto") return availability.managedAvailable || (availability.sesEnabled && availability.sesConnected);
  if (option === "managed") return availability.managedAvailable;
  return availability.sesEnabled && availability.sesConnected;
}

/** Merges one stored override on top of a shipped default identity. */
export function resolveSenderIdentity(
  purpose: SystemEmailPurpose,
  overrides: SenderIdentityOverrides | null | undefined,
): ResolvedSenderIdentity {
  const base = SYSTEM_SENDERS[purpose];
  const patch = overrides?.[purpose] ?? {};
  const email = (patch.email ?? base.email).trim().toLowerCase();
  const name = (patch.name ?? base.name).trim();
  const replyTo = (patch.replyTo ?? base.replyTo).trim().toLowerCase();
  const provider = isSenderProviderPreference(patch.provider) ? patch.provider : "auto";
  const active = patch.active !== false;
  return {
    ...base,
    email,
    name,
    replyTo,
    provider,
    active,
    customized:
      email !== base.email ||
      name !== base.name ||
      replyTo !== base.replyTo ||
      provider !== "auto" ||
      !active,
  };
}

/** Every identity with overrides applied, in the shipped order. */
export function resolveSenderIdentities(
  overrides: SenderIdentityOverrides | null | undefined,
): ResolvedSenderIdentity[] {
  return (Object.keys(SYSTEM_SENDERS) as SystemEmailPurpose[]).map((purpose) =>
    resolveSenderIdentity(purpose, overrides),
  );
}

/**
 * Falls back to the first active identity when the mapped one was switched
 * off, so a disabled identity can never silently stop a system email.
 */
export function activeSenderIdentity(
  purpose: SystemEmailPurpose,
  overrides: SenderIdentityOverrides | null | undefined,
): ResolvedSenderIdentity {
  const mapped = resolveSenderIdentity(purpose, overrides);
  if (mapped.active) return mapped;
  const all = resolveSenderIdentities(overrides);
  return (
    all.find((identity) => identity.purpose === "system" && identity.active) ??
    all.find((identity) => identity.active) ??
    mapped
  );
}

export type SenderIdentityEdit = {
  purpose: SystemEmailPurpose;
  email: string;
  name: string;
  replyTo: string;
  provider: SenderProviderPreference;
  active: boolean;
};

/**
 * Validates an admin edit against the real backend state. Returns the first
 * problem, or null when the identity can be saved.
 */
export function validateSenderIdentityEdit(
  edit: SenderIdentityEdit,
  availability: ProviderAvailability,
  options: { allowedDomains?: string[]; verifiedDomains?: string[] } = {},
): string | null {
  const email = edit.email.trim().toLowerCase();
  const replyTo = edit.replyTo.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return "Enter a valid sender email address.";
  if (!EMAIL_RE.test(replyTo)) return "Enter a valid reply-to email address.";
  if (!edit.name.trim()) return "Enter a display name.";
  if (!isSenderProviderPreference(edit.provider)) return "Choose a valid provider.";

  const domain = email.split("@")[1] ?? "";
  const allowed = (options.allowedDomains ?? []).map((d) => d.toLowerCase());
  if (allowed.length && !allowed.includes(domain)) {
    return `${domain} is not a MunchReach sending domain.`;
  }

  if (!providerOptionAvailable(edit.provider, availability)) {
    return edit.provider === "ses"
      ? "Amazon SES is not enabled and connected, so it cannot be selected."
      : "No sending provider is currently configured for that choice.";
  }

  const usesSes =
    edit.provider === "ses" ||
    (edit.provider === "auto" && availability.sesEnabled && availability.sesConnected);
  const verified = (options.verifiedDomains ?? []).map((d) => d.toLowerCase());
  if (usesSes && verified.length > 0 && !verified.includes(domain)) {
    return `${domain} is not a verified Amazon SES sending identity.`;
  }

  return null;
}

/** Applies a validated edit to the stored override map. */
export function applySenderIdentityEdit(
  overrides: SenderIdentityOverrides | null | undefined,
  edit: SenderIdentityEdit,
): SenderIdentityOverrides {
  return {
    ...(overrides ?? {}),
    [edit.purpose]: {
      email: edit.email.trim().toLowerCase(),
      name: edit.name.trim(),
      replyTo: edit.replyTo.trim().toLowerCase(),
      provider: edit.provider,
      active: edit.active,
    },
  };
}
