-- Restore point (read this before re-running anything).
--
-- On 2026-09-16 the domain meetsmartoutreach.agency was moved off the disabled
-- Maileroo account so nothing keeps calling it. These are the EXACT values the
-- row held beforehand. Running this statement puts the domain back on Maileroo
-- exactly as it was. Nothing here deletes or drops anything.
--
-- Provider record payloads (provider_records / record_checks) are untouched by
-- the move, so they do not need restoring.

update public.sending_domains
set provider = 'maileroo',
    provider_id = '7628bbd2-cb7f-46c5-ad47-e884297c96bf',
    provider_domain_id = '102869',
    stage = 'ready',
    dns_status = 'verified',
    spf_status = 'verified',
    dkim_status = 'verified',
    dmarc_status = 'verified',
    mx_status = 'failed',
    tracking_status = 'verified',
    verified_at = '2026-09-15 15:05:04.46+00'
where id = '5438c847-46a7-4bce-bf12-c515a2a29502';
