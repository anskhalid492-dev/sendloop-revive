# Roadmap

- [x] Review monitoring finding: smartoutreach.art sends blocked (domain not verified with provider)
- [x] Move admin area from /admin to /mranuskhalid

- [x] Add `customer_enabled` / `system_enabled` columns to `public.email_providers` on the connected database (Admin → Email Providers)

- [x] Fix AI personalization jobs stuck after workspace key or plan blocks
- [x] Diagnose production large-campaign error against the exact 4,087-lead campaign
- [x] Add bounded campaign-summary compatibility when the production aggregate RPC is missing
- [x] Replace the timed-out live campaign summary join for the exact 4,087-lead campaign
- [ ] Eliminate Campaign Overview server-function CPU failures and verify the live page has only bounded HTTP 200 reads (isolated lead and launch-history reads; removed non-Overview initial requests; awaiting live verification)
- [x] Correct customer Analytics delivery displays and polish Dashboard outbound cards plus Warmup Health only
- [x] Correct policy-blocked campaign outcomes so valid recipients are not counted or suppressed as bounced
- [ ] Make Settings → Email & Sending mailbox-first without changing readiness logic or sending behavior
