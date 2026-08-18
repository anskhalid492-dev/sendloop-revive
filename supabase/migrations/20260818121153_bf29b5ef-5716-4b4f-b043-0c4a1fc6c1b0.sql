INSERT INTO public.lead_lists (id, workspace_id, name, created_by)
VALUES ('11111111-2222-4333-8444-555555550010','42032fb3-3da7-43f0-8958-0e482ebdf697','Live send test','07bc8c49-3e1b-4035-b4dc-08bf68b038fe')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.leads (id, workspace_id, list_id, email, first_name, last_name, company, status)
VALUES ('11111111-2222-4333-8444-555555550011','42032fb3-3da7-43f0-8958-0e482ebdf697','11111111-2222-4333-8444-555555550010','forexdatabases01@gmail.com','Ali','Owner','Sendloop','new')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campaigns (id, workspace_id, name, list_id, sending_account_ids, send_days, send_start_hour, send_end_hour, daily_cap, status, created_by, min_delay_minutes, random_delay_minutes)
VALUES ('11111111-2222-4333-8444-555555550020','42032fb3-3da7-43f0-8958-0e482ebdf697','Live delivery test','11111111-2222-4333-8444-555555550010', ARRAY['11111111-2222-4333-8444-555555550001']::uuid[], ARRAY[1,2,3,4,5,6,7]::smallint[], 0, 23, 100, 'draft','07bc8c49-3e1b-4035-b4dc-08bf68b038fe', 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campaign_steps (id, campaign_id, workspace_id, step_order, name, step_type, subject, body, wait_days, wait_hours, delay_minutes)
VALUES ('11111111-2222-4333-8444-555555550021','11111111-2222-4333-8444-555555550020','42032fb3-3da7-43f0-8958-0e482ebdf697',1,'Step 1','email','Sendloop live delivery test for {{first_name}}','Hi {{first_name}},

This is a live delivery test sent through the Sendloop managed pool.

- Sendloop', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;