CREATE TYPE public.billing_interval AS ENUM ('monthly', 'yearly');

CREATE TABLE public.plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    tagline text,
    sort_order integer NOT NULL DEFAULT 0,
    monthly_price integer NOT NULL DEFAULT 0,
    yearly_price integer NOT NULL DEFAULT 0,
    is_popular boolean NOT NULL DEFAULT false,
    is_enterprise boolean NOT NULL DEFAULT false,
    max_workspaces integer,
    max_users integer,
    max_leads integer,
    max_campaigns integer,
    max_emails_monthly integer,
    max_sending_accounts integer,
    warmup_enabled boolean NOT NULL DEFAULT false,
    unified_inbox_enabled boolean NOT NULL DEFAULT true,
    analytics_enabled boolean NOT NULL DEFAULT true,
    api_access boolean NOT NULL DEFAULT false,
    priority_support boolean NOT NULL DEFAULT false,
    custom_branding boolean NOT NULL DEFAULT false,
    sso_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO anon;
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are publicly readable"
ON public.plans
FOR SELECT
TO anon, authenticated
USING (true);

CREATE TABLE public.plan_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'General',
    name text NOT NULL,
    included boolean NOT NULL DEFAULT true,
    value text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plan_features TO anon;
GRANT SELECT ON public.plan_features TO authenticated;
GRANT ALL ON public.plan_features TO service_role;

ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plan features are publicly readable"
ON public.plan_features
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

INSERT INTO public.plans (
    name, slug, description, tagline, sort_order,
    monthly_price, yearly_price, is_popular, is_enterprise,
    max_workspaces, max_users, max_leads, max_campaigns, max_emails_monthly, max_sending_accounts,
    warmup_enabled, unified_inbox_enabled, analytics_enabled, api_access, priority_support, custom_branding, sso_enabled
) VALUES
(
    'Free', 'free',
    'Start sending with one workspace and a small lead list.',
    'For individuals trying Sendloop.',
    10,
    0, 0,
    false, false,
    1, 1, 500, 3, 250, 1,
    false, true, true, false, false, false, false
),
(
    'Starter', 'starter',
    'Everything you need to run your first cold-email campaigns.',
    'For solopreneurs and early-stage startups.',
    20,
    4900, 4700,
    false, false,
    2, 2, 10000, 10, 10000, 3,
    true, true, true, true, false, false, false
),
(
    'Growth', 'growth',
    'Scale outreach with more accounts, leads, and advanced deliverability.',
    'For growing sales teams.',
    30,
    9900, 8900,
    true, false,
    5, 10, 100000, 50, 100000, 10,
    true, true, true, true, true, true, false
),
(
    'Agency', 'agency',
    'White-label, multi-workspace control, and dedicated support.',
    'For agencies managing client outreach.',
    40,
    24900, 21900,
    false, false,
    20, 30, 500000, 200, 500000, 50,
    true, true, true, true, true, true, true
);

WITH plan_ids AS (
    SELECT id, slug FROM public.plans
)
INSERT INTO public.plan_features (plan_id, category, name, included, value, sort_order)
SELECT
    p.id,
    f.category,
    f.name,
    f.included,
    f.value,
    f.sort_order
FROM plan_ids p
CROSS JOIN (
    VALUES
    ('Workspace & users', 'Workspaces included', true, NULL, 1),
    ('Workspace & users', 'Team members', true, '1', 2),
    ('Workspace & users', 'Additional seats', false, NULL, 3),
    ('Workspace & users', 'Custom roles & permissions', false, NULL, 4),
    ('Leads & campaigns', 'Lead contacts', true, '500', 10),
    ('Leads & campaigns', 'Active campaigns', true, '3', 11),
    ('Leads & campaigns', 'Email sends per month', true, '250', 12),
    ('Leads & campaigns', 'Lead lists', true, 'Unlimited', 13),
    ('Sending accounts', 'Connected sending accounts', true, '1', 20),
    ('Sending accounts', 'SMTP / IMAP support', true, NULL, 21),
    ('Sending accounts', 'Amazon SES connector', false, NULL, 22),
    ('Sending accounts', 'Provider rotation', false, NULL, 23),
    ('Inbox & replies', 'Unified inbox', true, NULL, 30),
    ('Inbox & replies', 'AI reply classification', false, NULL, 31),
    ('Inbox & replies', 'Auto-detect unsubscribe / bounce', true, NULL, 32),
    ('Warmup & deliverability', 'Mailbox warmup', false, NULL, 40),
    ('Warmup & deliverability', 'Deliverability dashboard', true, NULL, 41),
    ('Warmup & deliverability', 'Custom warmup pools', false, NULL, 42),
    ('Analytics', 'Open & click tracking', true, NULL, 50),
    ('Analytics', 'Campaign A/B testing', false, NULL, 51),
    ('Analytics', 'Custom reporting', false, NULL, 52),
    ('Integrations & API', 'Zapier / Make integrations', true, NULL, 60),
    ('Integrations & API', 'REST API access', false, NULL, 61),
    ('Integrations & API', 'Webhooks', false, NULL, 62),
    ('Support & services', 'Help center access', true, NULL, 70),
    ('Support & services', 'Email support', true, NULL, 71),
    ('Support & services', 'Priority chat support', false, NULL, 72),
    ('Support & services', 'Dedicated account manager', false, NULL, 73)
) AS f(category, name, included, value, sort_order)
WHERE p.slug = 'free';

WITH plan_ids AS (
    SELECT id, slug FROM public.plans
)
INSERT INTO public.plan_features (plan_id, category, name, included, value, sort_order)
SELECT
    p.id,
    f.category,
    f.name,
    f.included,
    f.value,
    f.sort_order
FROM plan_ids p
CROSS JOIN (
    VALUES
    ('Workspace & users', 'Workspaces included', true, '2', 1),
    ('Workspace & users', 'Team members', true, '2', 2),
    ('Workspace & users', 'Additional seats', true, '$15/mo', 3),
    ('Workspace & users', 'Custom roles & permissions', false, NULL, 4),
    ('Leads & campaigns', 'Lead contacts', true, '10,000', 10),
    ('Leads & campaigns', 'Active campaigns', true, '10', 11),
    ('Leads & campaigns', 'Email sends per month', true, '10,000', 12),
    ('Leads & campaigns', 'Lead lists', true, 'Unlimited', 13),
    ('Sending accounts', 'Connected sending accounts', true, '3', 20),
    ('Sending accounts', 'SMTP / IMAP support', true, NULL, 21),
    ('Sending accounts', 'Amazon SES connector', true, NULL, 22),
    ('Sending accounts', 'Provider rotation', true, NULL, 23),
    ('Inbox & replies', 'Unified inbox', true, NULL, 30),
    ('Inbox & replies', 'AI reply classification', true, NULL, 31),
    ('Inbox & replies', 'Auto-detect unsubscribe / bounce', true, NULL, 32),
    ('Warmup & deliverability', 'Mailbox warmup', true, NULL, 40),
    ('Warmup & deliverability', 'Deliverability dashboard', true, NULL, 41),
    ('Warmup & deliverability', 'Custom warmup pools', false, NULL, 42),
    ('Analytics', 'Open & click tracking', true, NULL, 50),
    ('Analytics', 'Campaign A/B testing', true, NULL, 51),
    ('Analytics', 'Custom reporting', false, NULL, 52),
    ('Integrations & API', 'Zapier / Make integrations', true, NULL, 60),
    ('Integrations & API', 'REST API access', true, NULL, 61),
    ('Integrations & API', 'Webhooks', true, NULL, 62),
    ('Support & services', 'Help center access', true, NULL, 70),
    ('Support & services', 'Email support', true, NULL, 71),
    ('Support & services', 'Priority chat support', false, NULL, 72),
    ('Support & services', 'Dedicated account manager', false, NULL, 73)
) AS f(category, name, included, value, sort_order)
WHERE p.slug = 'starter';

WITH plan_ids AS (
    SELECT id, slug FROM public.plans
)
INSERT INTO public.plan_features (plan_id, category, name, included, value, sort_order)
SELECT
    p.id,
    f.category,
    f.name,
    f.included,
    f.value,
    f.sort_order
FROM plan_ids p
CROSS JOIN (
    VALUES
    ('Workspace & users', 'Workspaces included', true, '5', 1),
    ('Workspace & users', 'Team members', true, '10', 2),
    ('Workspace & users', 'Additional seats', true, '$12/mo', 3),
    ('Workspace & users', 'Custom roles & permissions', true, NULL, 4),
    ('Leads & campaigns', 'Lead contacts', true, '100,000', 10),
    ('Leads & campaigns', 'Active campaigns', true, '50', 11),
    ('Leads & campaigns', 'Email sends per month', true, '100,000', 12),
    ('Leads & campaigns', 'Lead lists', true, 'Unlimited', 13),
    ('Sending accounts', 'Connected sending accounts', true, '10', 20),
    ('Sending accounts', 'SMTP / IMAP support', true, NULL, 21),
    ('Sending accounts', 'Amazon SES connector', true, NULL, 22),
    ('Sending accounts', 'Provider rotation', true, NULL, 23),
    ('Inbox & replies', 'Unified inbox', true, NULL, 30),
    ('Inbox & replies', 'AI reply classification', true, NULL, 31),
    ('Inbox & replies', 'Auto-detect unsubscribe / bounce', true, NULL, 32),
    ('Warmup & deliverability', 'Mailbox warmup', true, NULL, 40),
    ('Warmup & deliverability', 'Deliverability dashboard', true, NULL, 41),
    ('Warmup & deliverability', 'Custom warmup pools', true, NULL, 42),
    ('Analytics', 'Open & click tracking', true, NULL, 50),
    ('Analytics', 'Campaign A/B testing', true, NULL, 51),
    ('Analytics', 'Custom reporting', true, NULL, 52),
    ('Integrations & API', 'Zapier / Make integrations', true, NULL, 60),
    ('Integrations & API', 'REST API access', true, NULL, 61),
    ('Integrations & API', 'Webhooks', true, NULL, 62),
    ('Support & services', 'Help center access', true, NULL, 70),
    ('Support & services', 'Email support', true, NULL, 71),
    ('Support & services', 'Priority chat support', true, NULL, 72),
    ('Support & services', 'Dedicated account manager', false, NULL, 73)
) AS f(category, name, included, value, sort_order)
WHERE p.slug = 'growth';

WITH plan_ids AS (
    SELECT id, slug FROM public.plans
)
INSERT INTO public.plan_features (plan_id, category, name, included, value, sort_order)
SELECT
    p.id,
    f.category,
    f.name,
    f.included,
    f.value,
    f.sort_order
FROM plan_ids p
CROSS JOIN (
    VALUES
    ('Workspace & users', 'Workspaces included', true, '20', 1),
    ('Workspace & users', 'Team members', true, '30', 2),
    ('Workspace & users', 'Additional seats', true, '$10/mo', 3),
    ('Workspace & users', 'Custom roles & permissions', true, NULL, 4),
    ('Leads & campaigns', 'Lead contacts', true, '500,000', 10),
    ('Leads & campaigns', 'Active campaigns', true, '200', 11),
    ('Leads & campaigns', 'Email sends per month', true, '500,000', 12),
    ('Leads & campaigns', 'Lead lists', true, 'Unlimited', 13),
    ('Sending accounts', 'Connected sending accounts', true, '50', 20),
    ('Sending accounts', 'SMTP / IMAP support', true, NULL, 21),
    ('Sending accounts', 'Amazon SES connector', true, NULL, 22),
    ('Sending accounts', 'Provider rotation', true, NULL, 23),
    ('Inbox & replies', 'Unified inbox', true, NULL, 30),
    ('Inbox & replies', 'AI reply classification', true, NULL, 31),
    ('Inbox & replies', 'Auto-detect unsubscribe / bounce', true, NULL, 32),
    ('Warmup & deliverability', 'Mailbox warmup', true, NULL, 40),
    ('Warmup & deliverability', 'Deliverability dashboard', true, NULL, 41),
    ('Warmup & deliverability', 'Custom warmup pools', true, NULL, 42),
    ('Analytics', 'Open & click tracking', true, NULL, 50),
    ('Analytics', 'Campaign A/B testing', true, NULL, 51),
    ('Analytics', 'Custom reporting', true, NULL, 52),
    ('Integrations & API', 'Zapier / Make integrations', true, NULL, 60),
    ('Integrations & API', 'REST API access', true, NULL, 61),
    ('Integrations & API', 'Webhooks', true, NULL, 62),
    ('Support & services', 'Help center access', true, NULL, 70),
    ('Support & services', 'Email support', true, NULL, 71),
    ('Support & services', 'Priority chat support', true, NULL, 72),
    ('Support & services', 'Dedicated account manager', true, NULL, 73)
) AS f(category, name, included, value, sort_order)
WHERE p.slug = 'agency';
