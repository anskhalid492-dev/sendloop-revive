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

import {
  selectSystemEmailProvider,
  type SystemProviderSelection,
} from "@/lib/system-email-provider";

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
  /** The managed provider actually resolved for system email (e.g. "resend"). */
  managedProvider?: string | null;
  /** Admin-pinned Active provider ("auto" | "resend" | "ses" | "maileroo"). */
  activeProvider?: SystemProviderSelection | null;
  /** Maileroo configured server-side and allowed for system email. */
  mailerooAvailable?: boolean;
  /** Exact failing condition, surfaced instead of a generic label. */
  unavailableReason?: string | null;
};

/** Display name for a managed provider id. Never hard-codes one provider. */
export function managedProviderLabel(provider: string | null | undefined): string {
  const key = (provider ?? "").trim().toLowerCase();
  const names: Record<string, string> = {
    resend: "Resend",
    ses: "Amazon SES",
    sendgrid: "SendGrid",
    mailgun: "Mailgun",
    postmark: "Postmark",
    zeptomail: "ZeptoMail",
    brevo: "Brevo",
    emailit: "Emailit",
    maileroo: "Maileroo",
    smtp: "SMTP",
  };
  if (!key) return "MunchReach managed sending";
  return names[key] ?? key.toUpperCase();
}

export type ProviderDisplay = {
  /** Provider that will carry the next send. */
  provider: "ses" | "managed" | "maileroo" | "none";
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
    activeProvider: input.activeProvider ?? "auto",
    mailerooAvailable: input.mailerooAvailable ?? false,
  });

  if (choice.provider === "maileroo") {
    return {
      provider: "maileroo",
      label: "Maileroo",
      available: true,
      detail: choice.reason,
    };
  }

  if (choice.provider === "ses") {
    return {
      provider: "ses",
      label: "Amazon SES",
      available: true,
      detail: choice.reason,
    };
  }

  if (!input.managedAvailable) {
    const reason = (input.unavailableReason ?? "").trim();
    return {
      provider: "none",
      label: reason ? `Unavailable — ${reason}` : "Provider unavailable",
      available: false,
      detail: reason || "No system email provider is currently able to deliver.",
    };
  }

  return {
    provider: "managed",
    label: managedProviderLabel(input.managedProvider),
    available: true,
    detail: choice.reason,
  };
}
