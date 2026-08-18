DELETE FROM public.leads WHERE email IN ('a@x.com','bob@y.com');
DELETE FROM public.lead_lists WHERE name = 'Q3 Prospects';
DELETE FROM public.sending_accounts WHERE label = 'QA SendGrid';