/**
 * Frequency capping and send-gate decisions for marketing email.
 *
 * Pure logic: the server layer supplies counts and state, this module decides.
 * Keeping the decision pure is what lets the whole gate be unit-tested,
 * including the rules that protect subscribers (suppression, unsubscribe,
 * frequency caps) which must never be bypassable by a campaign setting.
 */
import type { SubscriberStatus } from "./types";

export type SendSkipReason =
  | "subscriber_inactive"
  | "unsubscribed"
  | "suppressed"
  | "bounced"
  | "complained"
  | "frequency_capped"
  | "already_sent"
  | "invalid_email";

export type FrequencyState = {
  /** Marketing emails already sent to this subscriber in the last 24 hours. */
  sentLast24h: number;
  /** Marketing emails already sent to this subscriber in the last 7 days. */
  sentLast7d: number;
};

export type FrequencyLimits = {
  maxPerDay: number;
  maxPerWeek: number;
};

export const DEFAULT_FREQUENCY_LIMITS: FrequencyLimits = {
  maxPerDay: 1,
  maxPerWeek: 3,
};

export type SendGateInput = {
  email: string;
  status: SubscriberStatus;
  suppressed: boolean;
  alreadySent: boolean;
  frequency: FrequencyState;
  limits?: FrequencyLimits;
  /** Transactional/system mail never routes through here; kept explicit anyway. */
  ignoreFrequency?: boolean;
};

export type SendGateResult =
  | { allowed: true }
  | { allowed: false; reason: SendSkipReason; detail: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * The single decision point for "may we send this marketing email?".
 * Order matters: subscriber protection first, delivery hygiene second,
 * duplicate protection last.
 */
export function evaluateSendGate(input: SendGateInput): SendGateResult {
  if (!isValidEmail(input.email)) {
    return { allowed: false, reason: "invalid_email", detail: "Address is not deliverable." };
  }
  if (input.status === "unsubscribed") {
    return { allowed: false, reason: "unsubscribed", detail: "Subscriber opted out." };
  }
  if (input.status === "complained") {
    return { allowed: false, reason: "complained", detail: "Subscriber marked mail as spam." };
  }
  if (input.status === "bounced") {
    return { allowed: false, reason: "bounced", detail: "Address previously hard bounced." };
  }
  if (input.suppressed || input.status === "suppressed") {
    return { allowed: false, reason: "suppressed", detail: "Address is on the suppression list." };
  }
  if (input.status !== "active") {
    return { allowed: false, reason: "subscriber_inactive", detail: "Subscriber is not active." };
  }
  if (input.alreadySent) {
    return { allowed: false, reason: "already_sent", detail: "Already sent for this send." };
  }
  if (!input.ignoreFrequency) {
    const limits = input.limits ?? DEFAULT_FREQUENCY_LIMITS;
    if (input.frequency.sentLast24h >= limits.maxPerDay) {
      return {
        allowed: false,
        reason: "frequency_capped",
        detail: `Daily cap reached (${limits.maxPerDay}/day).`,
      };
    }
    if (input.frequency.sentLast7d >= limits.maxPerWeek) {
      return {
        allowed: false,
        reason: "frequency_capped",
        detail: `Weekly cap reached (${limits.maxPerWeek}/week).`,
      };
    }
  }
  return { allowed: true };
}

/**
 * Configuration validation runs once per send, not per recipient: a missing
 * or unverified domain is an operator error that must abort the whole send
 * rather than silently skip every recipient.
 */
export type SendConfiguration = {
  provider: { id: string; status: string; connectionStatus: string } | null;
  domain: {
    id: string;
    domain: string;
    enabled: boolean;
    verificationStatus: string;
    spfStatus: string;
    dkimStatus: string;
    dmarcStatus: string;
    allowedProviderIds: string[];
  } | null;
  fromEmail: string;
};

export type ConfigurationIssue = { code: string; message: string };

export function validateSendConfiguration(config: SendConfiguration): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const { provider, domain, fromEmail } = config;

  if (!provider) {
    issues.push({ code: "provider_missing", message: "No email provider selected." });
  } else if (provider.status !== "active") {
    issues.push({ code: "provider_inactive", message: "Selected provider is not active." });
  } else if (provider.connectionStatus === "failed") {
    issues.push({
      code: "provider_connection_failed",
      message: "Selected provider failed its last connection test.",
    });
  }

  if (!domain) {
    issues.push({ code: "domain_missing", message: "No sending domain selected." });
    return issues;
  }
  if (!domain.enabled) {
    issues.push({ code: "domain_disabled", message: `${domain.domain} is disabled.` });
  }
  if (domain.verificationStatus !== "verified") {
    issues.push({
      code: "domain_not_verified",
      message: `${domain.domain} is not verified yet.`,
    });
  }
  for (const [key, label] of [
    ["spfStatus", "SPF"],
    ["dkimStatus", "DKIM"],
    ["dmarcStatus", "DMARC"],
  ] as const) {
    if (domain[key] !== "pass") {
      issues.push({
        code: `dns_${label.toLowerCase()}_failed`,
        message: `${label} is not passing for ${domain.domain}.`,
      });
    }
  }
  if (provider && domain.allowedProviderIds.length > 0 && !domain.allowedProviderIds.includes(provider.id)) {
    issues.push({
      code: "provider_not_allowed",
      message: `${domain.domain} is not configured to send through this provider.`,
    });
  }
  const fromDomain = fromEmail.split("@")[1]?.toLowerCase() ?? "";
  if (fromDomain !== domain.domain.toLowerCase()) {
    issues.push({
      code: "from_domain_mismatch",
      message: `From address must be on ${domain.domain}.`,
    });
  }
  return issues;
}
