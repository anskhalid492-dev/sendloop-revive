/**
 * Centralized MunchReach system email sender mapping.
 *
 * Every platform-generated (transactional / system) email resolves its From
 * address here, so sender addresses are never hardcoded across features.
 *
 * This mapping applies ONLY to MunchReach system email. Customer campaign
 * sending, customer mailboxes, Unified Inbox and provider configuration are
 * untouched by it.
 */

export const SYSTEM_EMAIL_PURPOSES = [
  "accounts",
  "billing",
  "support",
  "notifications",
  "security",
  "onboarding",
  "system",
  "marketing",
] as const;

export type SystemEmailPurpose = (typeof SYSTEM_EMAIL_PURPOSES)[number];

export const SYSTEM_EMAIL_DOMAIN = "munchreach.com";

export type SystemSender = {
  purpose: SystemEmailPurpose;
  /** Visible From address. */
  email: string;
  /** Visible From display name. */
  name: string;
  /** Address a human reply should reach. */
  replyTo: string;
  description: string;
};

const SUPPORT_ADDRESS = `support@${SYSTEM_EMAIL_DOMAIN}`;

export const SYSTEM_SENDERS: Record<SystemEmailPurpose, SystemSender> = {
  accounts: {
    purpose: "accounts",
    email: `accounts@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach Accounts",
    replyTo: SUPPORT_ADDRESS,
    description: "Account creation, email verification, password resets, account changes",
  },
  billing: {
    purpose: "billing",
    email: `billing@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach Billing",
    replyTo: `billing@${SYSTEM_EMAIL_DOMAIN}`,
    description: "Payments, invoices, subscriptions, trials, plan changes",
  },
  support: {
    purpose: "support",
    email: SUPPORT_ADDRESS,
    name: "MunchReach Support",
    replyTo: SUPPORT_ADDRESS,
    description: "Support tickets and customer support replies",
  },
  notifications: {
    purpose: "notifications",
    email: `notifications@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach",
    replyTo: SUPPORT_ADDRESS,
    description: "General product notifications and alerts",
  },
  security: {
    purpose: "security",
    email: `security@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach Security",
    replyTo: `security@${SYSTEM_EMAIL_DOMAIN}`,
    description: "Security alerts and login/security events",
  },
  onboarding: {
    purpose: "onboarding",
    email: `onboarding@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach",
    replyTo: SUPPORT_ADDRESS,
    description: "Welcome emails and onboarding emails",
  },
  system: {
    purpose: "system",
    email: `system@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach",
    replyTo: SUPPORT_ADDRESS,
    description: "Internal and system-generated emails",
  },
  marketing: {
    purpose: "marketing",
    email: `marketing@${SYSTEM_EMAIL_DOMAIN}`,
    name: "MunchReach",
    replyTo: SUPPORT_ADDRESS,
    description: "Product announcements and marketing emails",
  },
};

/** Explicit per-event overrides (checked before the category mapping). */
const EVENT_PURPOSES: Record<string, SystemEmailPurpose> = {
  // Authentication / account lifecycle
  "user.email_verification_requested": "accounts",
  "user.password_reset_requested": "accounts",
  "user.magic_link_requested": "accounts",
  "user.password_changed": "accounts",
  "user.suspended": "accounts",
  "user.reactivated": "accounts",
  "user.deleted": "accounts",
  // Welcome / onboarding
  "user.created": "onboarding",
  "workspace.created": "onboarding",
  // Security events
  "user.login_alert": "security",
  // Announcements are marketing-style product news
  "system.announcement": "marketing",
};

/** Template category → default purpose. */
const CATEGORY_PURPOSES: Record<string, SystemEmailPurpose> = {
  Authentication: "accounts",
  Account: "accounts",
  Workspace: "notifications",
  Billing: "billing",
  Credits: "billing",
  Campaigns: "notifications",
  "Email Infrastructure": "notifications",
  Warmup: "notifications",
  Support: "support",
  Security: "security",
  System: "system",
  Transactional: "notifications",
};

/** Resolves the purpose for a system email event. */
export function systemEmailPurpose(
  eventKey: string | null | undefined,
  category?: string | null,
): SystemEmailPurpose {
  const key = (eventKey ?? "").trim();
  const direct = EVENT_PURPOSES[key];
  if (direct) return direct;

  const byCategory = category ? CATEGORY_PURPOSES[category] : undefined;
  if (byCategory) return byCategory;

  // Prefix fallback keeps new event keys on a sensible sender.
  const prefix = key.split(".")[0] ?? "";
  const prefixMap: Record<string, SystemEmailPurpose> = {
    user: "accounts",
    security: "security",
    support: "support",
    subscription: "billing",
    payment: "billing",
    invoice: "billing",
    trial: "billing",
    credits: "billing",
    account: "billing",
    workspace: "notifications",
    campaign: "notifications",
    domain: "notifications",
    mailbox: "notifications",
    sending: "notifications",
    infrastructure: "notifications",
    warmup: "notifications",
    referral: "notifications",
    system: "system",
  };
  return prefixMap[prefix] ?? "notifications";
}

/** Resolves the full sender identity for a system email event. */
export function systemSenderFor(
  eventKey: string | null | undefined,
  category?: string | null,
): SystemSender {
  return SYSTEM_SENDERS[systemEmailPurpose(eventKey, category)];
}

/** Resolves a sender by purpose (for non-template system mail). */
export function systemSender(purpose: SystemEmailPurpose): SystemSender {
  return SYSTEM_SENDERS[purpose];
}

/** `Name <email>` header value for a purpose. */
export function systemFromHeader(purpose: SystemEmailPurpose): string {
  const sender = SYSTEM_SENDERS[purpose];
  return `${sender.name} <${sender.email}>`;
}
