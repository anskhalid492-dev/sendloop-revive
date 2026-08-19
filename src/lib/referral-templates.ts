/**
 * Referrer notification email/in-app templates.
 *
 * Admins can edit copy and toggle each template independently from
 * Admin → Settings. Values live in `platform_settings.referral_templates`;
 * anything missing falls back to the defaults below.
 */
export const REFERRAL_TEMPLATE_KINDS = [
  "referral_attributed",
  "commission_approved",
  "commission_rejected",
  "commission_reversed",
  "payout_processing",
  "payout_paid",
  "payout_rejected",
] as const;

export type ReferralTemplateKind = (typeof REFERRAL_TEMPLATE_KINDS)[number];

export type ReferralTemplate = {
  enabled: boolean;
  subject: string;
  body: string;
  ctaLabel: string;
};

export type ReferralTemplateMap = Record<ReferralTemplateKind, ReferralTemplate>;

export const REFERRAL_TEMPLATE_LABELS: Record<ReferralTemplateKind, string> = {
  referral_attributed: "New referral signup",
  commission_approved: "Commission approved",
  commission_rejected: "Commission rejected",
  commission_reversed: "Commission reversed",
  payout_processing: "Payout processing",
  payout_paid: "Payout sent",
  payout_rejected: "Payout declined",
};

const CTA = "Open your referral dashboard";

export const DEFAULT_REFERRAL_TEMPLATES: ReferralTemplateMap = {
  referral_attributed: {
    enabled: true,
    subject: "You have a new referral signup",
    body: "Someone created a Sendloop account through your referral link. You earn commission once they start paying.",
    ctaLabel: CTA,
  },
  commission_approved: {
    enabled: true,
    subject: "Commission approved — {{amount}}",
    body: "This commission is now part of your available balance and can be included in a payout request.",
    ctaLabel: CTA,
  },
  commission_rejected: {
    enabled: true,
    subject: "A commission was not approved",
    body: "{{detail}}",
    ctaLabel: CTA,
  },
  commission_reversed: {
    enabled: true,
    subject: "Commission reversed — {{amount}}",
    body: "{{detail}}",
    ctaLabel: CTA,
  },
  payout_processing: {
    enabled: true,
    subject: "Payout of {{amount}} is being processed",
    body: "We've started sending your referral payout. You'll get another update once it's on its way.",
    ctaLabel: CTA,
  },
  payout_paid: {
    enabled: true,
    subject: "Payout sent — {{amount}}",
    body: "{{detail}}",
    ctaLabel: CTA,
  },
  payout_rejected: {
    enabled: true,
    subject: "Your payout request was declined",
    body: "{{detail}}",
    ctaLabel: CTA,
  },
};

export const REFERRAL_TEMPLATE_FALLBACK_DETAIL: Record<ReferralTemplateKind, string> = {
  referral_attributed: "A new referred account was created through your link.",
  commission_approved: "This commission was approved by our team.",
  commission_rejected: "A referral commission was reviewed and rejected by our team.",
  commission_reversed:
    "The referred customer's payment was refunded or cancelled, so the commission was reversed.",
  payout_processing: "Your referral payout is being processed.",
  payout_paid:
    "Your referral payout has been processed. Bank or wallet transfers can take a few business days to land.",
  payout_rejected:
    "A payout request could not be processed. Check your payout details or contact support.",
};

/** Merge stored overrides onto the defaults so partial records stay valid. */
export function mergeReferralTemplates(stored: unknown): ReferralTemplateMap {
  const source = (stored ?? {}) as Partial<Record<ReferralTemplateKind, Partial<ReferralTemplate>>>;
  const out = {} as ReferralTemplateMap;
  for (const kind of REFERRAL_TEMPLATE_KINDS) {
    const base = DEFAULT_REFERRAL_TEMPLATES[kind];
    const override = source[kind] ?? {};
    out[kind] = {
      enabled: typeof override.enabled === "boolean" ? override.enabled : base.enabled,
      subject: override.subject?.trim() ? override.subject : base.subject,
      body: override.body?.trim() ? override.body : base.body,
      ctaLabel: override.ctaLabel?.trim() ? override.ctaLabel : base.ctaLabel,
    };
  }
  return out;
}

export function renderReferralTemplate(
  template: string,
  vars: { amount?: string | null; detail?: string | null; name?: string | null },
): string {
  return template
    .replace(/\{\{\s*amount\s*\}\}/g, vars.amount ?? "")
    .replace(/\{\{\s*detail\s*\}\}/g, vars.detail ?? "")
    .replace(/\{\{\s*name\s*\}\}/g, vars.name ?? "there")
    .replace(/\s+—\s*$/, "")
    .trim();
}
