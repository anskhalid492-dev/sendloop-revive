-- Add the /refund-policy page to the public site registry and update the
-- footer Legal menu to the requested order.
--
-- Run this against the connected Supabase project after the /refund-policy
-- route has been deployed.

-- 1. Ensure the page exists in site_pages.
INSERT INTO public.site_pages (
  path,
  title,
  section,
  status,
  seo_title,
  meta_description,
  canonical_url,
  og_title,
  og_description,
  robots_index,
  robots_follow,
  include_in_sitemap,
  changefreq,
  priority
)
VALUES (
  '/refund-policy',
  'Refund Policy',
  'marketing',
  'published',
  'Refund Policy — MunchReach',
  'MunchReach refund policy: eligibility, timeframes, how to request a refund, and exceptions.',
  'https://munchreach.com/refund-policy',
  'Refund Policy — MunchReach',
  'MunchReach refund policy: eligibility, timeframes, how to request a refund, and exceptions.',
  true,
  true,
  true,
  'monthly',
  0.6
)
ON CONFLICT (path) DO UPDATE SET
  title = EXCLUDED.title,
  section = EXCLUDED.section,
  status = EXCLUDED.status,
  seo_title = EXCLUDED.seo_title,
  meta_description = EXCLUDED.meta_description,
  canonical_url = EXCLUDED.canonical_url,
  og_title = EXCLUDED.og_title,
  og_description = EXCLUDED.og_description,
  robots_index = EXCLUDED.robots_index,
  robots_follow = EXCLUDED.robots_follow,
  include_in_sitemap = EXCLUDED.include_in_sitemap,
  changefreq = EXCLUDED.changefreq,
  priority = EXCLUDED.priority,
  updated_at = now();

-- 2. Re-label and re-order existing legal footer links.
UPDATE public.site_nav_items
SET
  label = CASE href
    WHEN '/privacy' THEN 'Privacy Policy'
    WHEN '/terms' THEN 'Terms of Service'
    WHEN '/acceptable-use' THEN 'Acceptable Use'
    WHEN '/cookie-policy' THEN 'Cookie Policy'
    WHEN '/dpa' THEN 'DPA'
    WHEN '/remove-my-data' THEN 'Remove My Data'
  END,
  sort_order = CASE href
    WHEN '/privacy' THEN 1
    WHEN '/terms' THEN 2
    WHEN '/acceptable-use' THEN 4
    WHEN '/cookie-policy' THEN 5
    WHEN '/dpa' THEN 6
    WHEN '/remove-my-data' THEN 7
  END,
  is_visible = true
WHERE location = 'footer'
  AND group_label = 'Legal'
  AND href IN (
    '/privacy', '/terms', '/acceptable-use', '/cookie-policy', '/dpa', '/remove-my-data'
  );

-- 3. Insert the Refund Policy footer link if it does not already exist.
INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Legal', 'Refund Policy', '/refund-policy', 3
WHERE NOT EXISTS (
  SELECT 1
  FROM public.site_nav_items
  WHERE location = 'footer'
    AND group_label = 'Legal'
    AND href = '/refund-policy'
);

-- 4. Remove any leftover legal footer links that are not in the requested menu.
DELETE FROM public.site_nav_items
WHERE location = 'footer'
  AND group_label = 'Legal'
  AND href NOT IN (
    '/privacy', '/terms', '/refund-policy', '/acceptable-use',
    '/cookie-policy', '/dpa', '/remove-my-data'
  );
