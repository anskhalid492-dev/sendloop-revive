/**
 * Safety policy for MunchReach system (transactional) emails.
 *
 * Pure module — no I/O. It answers three questions the admin UI and the
 * server functions both need to agree on:
 *
 *  1. Which system emails are required and may never be disabled?
 *  2. Is a chosen From address a real, usable MunchReach sender identity?
 *  3. Which provider will actually carry the message right now?
 *
 * Campaign sending, sequences and warmup are unrelated to this module.
 */

import { selectSystemEmailProvider } from "@/lib/system-email-provider";

/**
 * Emails whose delivery is load-bearing for account access or security.
 * Disabling any of these would lock customers out or hide security events.
 */
export const REQUIRED_SYSTEM_EMAILS = [
  "user.email_verification_requested",
  "user.password_reset_requested",
  "user.magic_link_requested",
  "user.password_changed",
  "user.login_alert",
] as const;

const REQUIRED = new Set<string>(REQUIRED_SYSTEM_EMAILS);

export function isRequiredSystemEmail(eventKey: string | null | undefined): boolean {
  return REQUIRED.has((eventKey ?? "").trim());
}

export type SenderCheckInput = {
  /** Per-template From override; empty means "use the mapped system sender". */
  fromEmail?: string | null;
  /** Amazon SES explicitly enabled for system email delivery. */
  sesEnabled: boolean;
  /** Domains SES reports as verified sending identities. */
  verifiedDomains: string[];
  /** Every address in the centralized MunchReach sender mapping. */
  knownSenders: string[];
};

/** Reason the sender cannot be used, or null when it is allowed. */
export function senderRejectionReason(input: SenderCheckInput): string | null {
  const from = (input.fromEmail ?? "").trim().toLowerCase();
  if (!from) return null; // falls back to the mapped system sender

  const known = input.knownSenders.map((s) => s.trim().toLowerCase());
  if (!known.includes(from)) {
    return `${from} is not a MunchReach system sender identity.`;
  }

  if (input.sesEnabled) {
    const domain = (from.split("@")[1] ?? "").toLowerCase();
    const verified = input.verifiedDomains.map((d) => d.trim().toLowerCase());
    if (!verified.includes(domain)) {
      return `${from} is not a verified Amazon SES sending identity.`;
    }
  }

  return null;
}

export type ProviderDisplayInput = {
  sesEnabled: boolean;
  sesConnected: boolean;
  managedAvailable: boolean;
};

export type ProviderDisplay = {
  /** Provider that will carry the next send. */
  provider: "ses" | "managed" | "none";
  label: string;
  available: boolean;
  detail: string;
};

/** Human-readable provider status shown next to every transactional email. */
export function providerDisplay(input: ProviderDisplayInput): ProviderDisplay {
  const choice = selectSystemEmailProvider({
    sesEnabled: input.sesEnabled,
    sesCredentialsAvailable: input.sesConnected,
    managedAvailable: input.managedAvailable,
  });

  if (choice.provider === "ses") {
    return {
      provider: "ses",
      label: "Amazon SES",
      available: true,
      detail: choice.reason,
    };
  }

  if (!input.managedAvailable) {
    return {
      provider: "none",
      label: "Provider unavailable",
      available: false,
      detail: "No system email provider is currently able to deliver.",
    };
  }

  return {
    provider: "managed",
    label: "MunchReach managed sending",
    available: true,
    detail: choice.reason,
  };
}
