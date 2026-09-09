-- Run manually against the LIVE production project.
-- Adds Claude (Anthropic) to the integrations catalogue. Idempotent, no data
-- is modified: existing rows and credentials are untouched.

INSERT INTO public.integrations (slug, name, category, tagline, is_enabled, requires_paid_plan, sort_order)
VALUES (
  'claude',
  'Claude',
  'ai',
  'Personalize outreach with Claude using your own Anthropic key.',
  true,
  false,
  COALESCE((SELECT sort_order FROM public.integrations WHERE slug = 'openai'), 0) + 1
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      tagline = EXCLUDED.tagline,
      updated_at = now();
