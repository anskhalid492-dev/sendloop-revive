/**
 * Client-safe provider registry.
 *
 * This describes MunchReach's *internal* sending infrastructure. It is only ever
 * rendered inside /admin — customers never see provider names or credentials.
 */

export const PROVIDER_IDS = [
  "ses",
  "resend",
  "emailit",
  "mailgun",
  "postmark",
  "brevo",
  "zeptomail",
  "sendgrid",
  "smtp",
  "nuntly",
  "elasticemail",
  "maileroo",
  "courier",
  "uspeedo",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderDefinition = {
  id: ProviderId;
  label: string;
  blurb: string;
  fields: { name: string; label: string; placeholder?: string; secret?: boolean }[];
};

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "ses",
    label: "Amazon SES",
    blurb: "High-volume, lowest cost per thousand. Good default for bulk capacity.",
    fields: [
      { name: "region", label: "Region", placeholder: "us-east-1" },
      { name: "access_key_id", label: "Access key ID" },
      { name: "secret_access_key", label: "Secret access key", secret: true },
    ],
  },
  {
    id: "resend",
    label: "Resend",
    blurb: "Fast API, strong deliverability, simple domain management.",
    fields: [{ name: "api_key", label: "API key", secret: true }],
  },
  {
    id: "emailit",
    label: "Emailit",
    blurb: "Cost-effective transactional capacity for warm pools.",
    fields: [{ name: "api_key", label: "API key", secret: true }],
  },
  {
    id: "mailgun",
    label: "Mailgun",
    blurb: "Mature routing, good bounce and complaint webhooks.",
    fields: [
      { name: "api_key", label: "API key", secret: true },
      { name: "domain", label: "Sending domain", placeholder: "mg.example.com" },
    ],
  },
  {
    id: "postmark",
    label: "Postmark",
    blurb: "Premium reputation, best for high-value low-volume streams.",
    fields: [{ name: "api_key", label: "Server token", secret: true }],
  },
  {
    id: "brevo",
    label: "Brevo",
    blurb: "Flexible European capacity with generous rate limits.",
    fields: [{ name: "api_key", label: "API key", secret: true }],
  },
  {
    id: "zeptomail",
    label: "ZeptoMail",
    blurb: "Zoho transactional service, inexpensive secondary capacity.",
    fields: [{ name: "api_key", label: "Send-mail token", secret: true }],
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    blurb: "Broad IP pool availability for burst capacity.",
    fields: [{ name: "api_key", label: "API key", secret: true }],
  },
  {
    id: "smtp",
    label: "Custom SMTP",
    blurb: "Any mailbox provider or relay reachable over SMTP.",
    fields: [
      { name: "host", label: "Host", placeholder: "smtp.example.com" },
      { name: "port", label: "Port", placeholder: "587" },
      { name: "username", label: "Username" },
      { name: "password", label: "Password", secret: true },
    ],
  },
  {
    id: "nuntly",
    label: "Nuntly",
    blurb: "API sending with full domain, DNS, receiving and webhook automation.",
    fields: [{ name: "api_key", label: "API key", placeholder: "apk_…", secret: true }],
  },
  {
    id: "elasticemail",
    label: "Elastic Email",
    blurb: "Low-cost volume with domain, inbound-route and webhook APIs.",
    fields: [{ name: "api_key", label: "API key", secret: true }],
  },
  {
    id: "maileroo",
    label: "Maileroo",
    blurb:
      "Account API key only — per-domain sending keys are provisioned automatically when a domain is verified.",
    fields: [
      { name: "api_key", label: "Account API key", placeholder: "roo_…", secret: true },
    ],
  },
  {
    id: "courier",
    label: "Courier",
    blurb: "Delivery orchestration: sending and tracking only, no domain or inbound API.",
    fields: [{ name: "api_key", label: "API key", secret: true }],
  },
  {
    id: "uspeedo",
    label: "uSpeedo",
    blurb: "Global sending API; domains and webhooks are configured in the uSpeedo console.",
    fields: [
      { name: "access_key_id", label: "Access key ID" },
      { name: "access_key_secret", label: "Access key secret", secret: true },
    ],
  },
];

export function providerLabel(id: string): string {
  return PROVIDER_DEFINITIONS.find((p) => p.id === id)?.label ?? id;
}
