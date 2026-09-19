/**
 * Safe per-mail-host sending ceilings.
 *
 * A customer's own provider suspends or throttles a mailbox that sends more
 * than it tolerates — a different failure mode from ours, but still our job to
 * stay under. These values are conservative ceilings applied ON TOP of the
 * existing capacity rules: they can only ever LOWER a limit, never raise one.
 */
import type { MailHost } from "@/lib/mailbox-auth-check";

export type ProviderSendingLimit = {
  /** Highest daily volume MunchReach will drive through this host. */
  dailyCeiling: number;
  /** Highest daily warm-up volume for a mailbox on this host. */
  warmupCeiling: number;
  /** Plain-language reason, shown when the ceiling is what limits a mailbox. */
  note: string;
};

const LIMITS: Record<MailHost, ProviderSendingLimit> = {
  google_workspace: {
    dailyCeiling: 100,
    warmupCeiling: 40,
    note: "Google Workspace throttles mailboxes that send large volumes of similar mail, so we stay well inside its limits.",
  },
  microsoft365: {
    dailyCeiling: 80,
    warmupCeiling: 30,
    note: "Microsoft 365 applies its own per-mailbox recipient limits, so we keep daily volume below them.",
  },
  zoho: {
    dailyCeiling: 60,
    warmupCeiling: 25,
    note: "Zoho applies a per-mailbox daily sending limit, so we keep volume below it.",
  },
  hostinger: {
    dailyCeiling: 50,
    warmupCeiling: 20,
    note: "Shared mail hosting applies tight hourly and daily limits, so we keep volume low.",
  },
  godaddy: {
    dailyCeiling: 40,
    warmupCeiling: 20,
    note: "GoDaddy mailboxes have a low daily send allowance, so we keep volume below it.",
  },
  titan: {
    dailyCeiling: 50,
    warmupCeiling: 20,
    note: "Titan / Private Email applies a per-mailbox daily limit, so we keep volume below it.",
  },
  yahoo: {
    dailyCeiling: 25,
    warmupCeiling: 10,
    note: "This host is not built for outreach volume, so we keep daily sending very low.",
  },
  proton: {
    dailyCeiling: 25,
    warmupCeiling: 10,
    note: "Proton applies a low daily recipient limit per mailbox, so we keep volume below it.",
  },
  zimbra: {
    dailyCeiling: 50,
    warmupCeiling: 20,
    note: "Self-hosted mail servers vary, so we use a conservative daily ceiling.",
  },
  free_mailbox: {
    dailyCeiling: 20,
    warmupCeiling: 10,
    note: "Free personal mailboxes are flagged quickly at volume, so sending stays minimal.",
  },
  custom: {
    dailyCeiling: 50,
    warmupCeiling: 20,
    note: "We use a conservative daily ceiling until we know what this mail host allows.",
  },
  unknown: {
    dailyCeiling: 50,
    warmupCeiling: 20,
    note: "We use a conservative daily ceiling until we know what this mail host allows.",
  },
};

export function providerSendingLimit(host: MailHost): ProviderSendingLimit {
  return LIMITS[host];
}

/** The ceiling can only lower a configured limit, never raise it. */
export function effectiveDailyLimit(configured: number, host: MailHost | null | undefined): number {
  const limit = Math.max(0, Math.floor(configured));
  if (!host) return limit;
  return Math.min(limit, providerSendingLimit(host).dailyCeiling);
}

/** Warm-up ramp ceiling for a mailbox, also never above the mailbox's own limit. */
export function effectiveWarmupCeiling(
  configuredDailyLimit: number,
  host: MailHost | null | undefined,
): number {
  const limit = Math.max(0, Math.floor(configuredDailyLimit));
  if (!host) return limit;
  return Math.min(limit, providerSendingLimit(host).warmupCeiling);
}
