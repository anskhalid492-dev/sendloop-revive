import type { ProviderId } from "@/lib/providers/registry";

export type ProviderGuide = {
  id: ProviderId;
  label: string;
  tagline: string;
  /** Short steps the user follows inside the provider dashboard. */
  steps: string[];
  docsUrl: string;
  /** Whether the provider can be verified and test-sent over HTTP. */
  liveTest: boolean;
  fieldHints: Partial<Record<string, string>>;
};

export const PROVIDER_GUIDES: Record<ProviderId, ProviderGuide> = {
  smtp: {
    id: "smtp",
    label: "Custom SMTP",
    tagline: "Any mailbox or relay that speaks SMTP.",
    steps: [
      "Open your mail host and find the SMTP settings for the mailbox.",
      "Copy the host and port (587 with STARTTLS is the usual choice).",
      "Create an app password rather than using the account password.",
    ],
    docsUrl: "/docs",
    liveTest: false,
    fieldHints: {
      host: "e.g. smtp.yourdomain.com",
      port: "587 for STARTTLS, 465 for SSL",
      username: "Usually the full mailbox address",
      password: "App password, not your login password",
    },
  },
  ses: {
    id: "ses",
    label: "Amazon SES",
    tagline: "Lowest cost at volume, needs a verified domain.",
    steps: [
      "Verify your sending domain in the SES console and leave the sandbox.",
      "Create an IAM user limited to ses:SendRawEmail.",
      "Copy the access key ID and secret access key.",
    ],
    docsUrl: "/docs",
    liveTest: false,
    fieldHints: {
      region: "e.g. eu-west-1",
      access_key_id: "IAM access key ID",
      secret_access_key: "IAM secret access key",
    },
  },
  sendgrid: {
    id: "sendgrid",
    label: "SendGrid",
    tagline: "API sending with domain authentication.",
    steps: [
      "Authenticate your sending domain under Settings → Sender Authentication.",
      "Create an API key with Mail Send permission.",
      "Paste the key below — we verify it immediately.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Starts with SG." },
  },
  mailgun: {
    id: "mailgun",
    label: "Mailgun",
    tagline: "API sending with per-domain routing.",
    steps: [
      "Add and verify your sending domain in Mailgun.",
      "Copy the private API key from API Security.",
      "Enter the exact domain you send from.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Private API key", domain: "mg.yourdomain.com" },
  },
  postmark: {
    id: "postmark",
    label: "Postmark",
    tagline: "Strong deliverability for transactional-style sends.",
    steps: [
      "Create or open a server in Postmark.",
      "Verify the sender signature or domain you will send from.",
      "Copy the Server API token.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Server API token" },
  },
  resend: {
    id: "resend",
    label: "Resend",
    tagline: "Simple modern API, fast domain setup.",
    steps: [
      "Add your domain in Resend and complete the DNS records.",
      "Create an API key with send access.",
      "Paste the key below.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Starts with re_" },
  },
  zeptomail: {
    id: "zeptomail",
    label: "ZeptoMail",
    tagline: "Zoho's transactional sending service.",
    steps: [
      "Verify your domain in ZeptoMail.",
      "Create a Mail Agent and copy its send-mail token.",
      "Paste the token below.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Send-mail token" },
  },
  brevo: {
    id: "brevo",
    label: "Brevo",
    tagline: "Transactional API with generous throughput.",
    steps: [
      "Verify your sending domain in Brevo.",
      "Create an API key under SMTP & API → API keys.",
      "Paste the key below.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Starts with xkeysib-" },
  },
  emailit: {
    id: "emailit",
    label: "Emailit",
    tagline: "Low-cost API sending for outbound volume.",
    steps: [
      "Add and verify your sending domain in Emailit.",
      "Create an API credential with send permission.",
      "Paste the key below.",
    ],
    docsUrl: "/docs",
    liveTest: true,
    fieldHints: { api_key: "Emailit API key" },
  },
};
