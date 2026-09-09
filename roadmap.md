# Roadmap

- [x] Review monitoring finding: smartoutreach.art sends blocked (domain not verified with provider)
- [x] Move admin area from /admin to /mranuskhalid

- [x] Add `customer_enabled` / `system_enabled` columns to `public.email_providers` on the connected database (Admin → Email Providers)

- [x] Fix AI personalization jobs stuck after workspace key or plan blocks
- [x] Diagnose production large-campaign error against the exact 4,087-lead campaign
- [x] Add bounded campaign-summary compatibility when the production aggregate RPC is missing
- [x] Replace the timed-out live campaign summary join for the exact 4,087-lead campaign
- [ ] Eliminate the campaign page server-function CPU failure and verify the live request returns HTTP 200 (isolated `getCampaignLeads`; awaiting publication verification)
