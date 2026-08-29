/**
 * Client-safe catalogue of marketing email provider types and the credential
 * fields each one needs. Lives outside `providers.server.ts` so the admin UI
 * can render credential forms without importing server-only code.
 */
import type { ProviderType } from "./types";

export const MARKETING_PROVIDER_TYPES: { id: ProviderType; label: string; fields: string[] }[] = [
  { id: "ses", label: "Amazon SES", fields: ["access_key_id", "secret_access_key", "region"] },
  { id: "resend", label: "Resend", fields: ["api_key"] },
  { id: "sendgrid", label: "SendGrid", fields: ["api_key"] },
  { id: "mailgun", label: "Mailgun", fields: ["api_key", "domain", "region"] },
  { id: "smtp", label: "SMTP", fields: ["host", "port", "username", "password"] },
];
