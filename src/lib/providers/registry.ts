/**
 * Client-safe provider registry.
 *
 * This describes Sendloop's *internal* sending infrastructure. It is only ever
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
];

export function providerLabel(id: string): string {
  return PROVIDER_DEFINITIONS.find((p) => p.id === id)?.label ?? id;
}
