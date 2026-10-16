-- Blog author profile upgrade (additive, backward-compatible).
-- Adds optional profile, social, background and SEO fields to blog_authors.
-- Existing authors, slugs and post assignments are untouched.

ALTER TABLE public.blog_authors
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS linkedin_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS x_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS introduction text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS experience text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS certifications text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS languages text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS featured_quote text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expertise text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS noindex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS full_bio text NOT NULL DEFAULT '';
