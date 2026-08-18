UPDATE public.plan_features SET name = 'Managed sending included' WHERE name = 'SMTP / IMAP support';
UPDATE public.plan_features SET name = 'Deliverability monitoring' WHERE name = 'Amazon SES connector';
UPDATE public.plan_features SET name = 'Mailbox rotation' WHERE name = 'Provider rotation';
UPDATE public.plan_features SET name = 'Assigned sending accounts' WHERE name = 'Connected sending accounts';
UPDATE public.plan_features SET category = 'Sending' WHERE category = 'Sending accounts';