-- Footer navigation: standardize column order and labels.
-- Columns: Products, Resources, Company, Legal.
-- Adds Why Sendloop / How It Works / About Us to Resources.

-- 1. Rename Product -> Products
UPDATE public.site_nav_items
SET group_label = 'Products'
WHERE location = 'footer' AND group_label = 'Product';

-- 2. Move About into Resources and label as "About Us"
UPDATE public.site_nav_items
SET group_label = 'Resources', label = 'About Us', sort_order = 10
WHERE location = 'footer' AND label = 'About' AND href = '/about';

-- 3. Add Why Sendloop and How It Works to Resources if missing
INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Resources', 'Why Sendloop', '/why-sendloop', 8
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items
  WHERE location = 'footer' AND href = '/why-sendloop'
);

INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Resources', 'How It Works', '/how-it-works', 9
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items
  WHERE location = 'footer' AND href = '/how-it-works'
);

-- 4. Normalize sort_order within each footer group to match the fallback order
WITH ordered AS (
  SELECT id, group_label,
         ROW_NUMBER() OVER (
           PARTITION BY group_label
           ORDER BY sort_order ASC, label ASC
         ) AS new_order
  FROM public.site_nav_items
  WHERE location = 'footer'
)
UPDATE public.site_nav_items
SET sort_order = ordered.new_order
FROM ordered
WHERE public.site_nav_items.id = ordered.id;
