# Secrets re-add checklist (after removing the built-in Lovable Cloud backend)

Re-add these in Project Settings → Secrets immediately after removal. Copy every
value from the Secrets screen BEFORE removing, so nothing depends on recovery.

## Must be the SAME value as before (do not regenerate)

| Secret | Why it must match | Where to get it |
| --- | --- | --- |
| PROVIDER_CREDENTIALS_KEY | Decrypts already-stored provider / mailbox / AI / Stripe / integration credentials. A new value makes existing stored credentials unreadable. | Copy from the Secrets screen before removal. |
| INBOUND_EMAIL_SECRET | Must match the value configured in the inbound-email webhook at the provider. Can be changed, but only if the provider config is updated in the same pass. | Copy from Secrets, or generate a new one and update the provider webhook. |

## Recoverable from your own dashboards

| Secret | Source |
| --- | --- |
| R2_ACCESS_KEY_ID | Cloudflare → R2 → Manage API tokens |
| R2_SECRET_ACCESS_KEY | Cloudflare → R2 (shown once; create a new token if lost) |
| R2_ACCOUNT_ID | Cloudflare dashboard account ID |
| R2_BUCKET_NAME | `munchreach-files` |
| AWS_SES_ACCESS_KEY_ID | AWS IAM → the SES user's access keys |
| AWS_SES_SECRET_ACCESS_KEY | AWS IAM (shown once; create a new key if lost) |
| AWS_SES_REGION | AWS SES console region (e.g. `us-east-1`) |
| AWS_SES_CONFIGURATION_SET | AWS SES → Configuration sets |
| AWS_SES_EVENT_TOPIC_ARN | AWS SNS → topic ARN used for SES events |
| RESEND_API_KEY | Resend → API Keys (create new if not stored) |
| RESEND_WEBHOOK_SECRET | Resend → Webhooks → signing secret |
| STRIPE_SECRET_KEY_TEST | Stripe → Developers → API keys (test mode) |
| STRIPE_WEBHOOK_SECRET_TEST | Stripe → Developers → Webhooks → signing secret |
| SB_SERVICE_ROLE_KEY | Your own backend project's API settings (service_role key) |

## Managed — do not touch

- LOVABLE_API_KEY (platform-managed)

## After re-adding

1. Send a test email from Settings → Sending.
2. Upload and download one file (avatar) to confirm R2 access.
3. Trigger one inbound-email webhook delivery.
4. Open Billing to confirm the Stripe secret loads.
