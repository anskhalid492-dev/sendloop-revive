-- Footer navigation: add Comparisons column and enforce the column order
-- Products → Resources → Comparisons → Company → Legal

-- 1. Add the Comparisons column links if they are missing.
INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Comparisons', 'Sendloop vs Instantly', '/compare/sendloop-vs-instantly', 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'footer' AND label = 'Sendloop vs Instantly'
);

INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Comparisons', 'Sendloop vs Smartlead', '/compare/sendloop-vs-smartlead', 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'footer' AND label = 'Sendloop vs Smartlead'
);

INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Comparisons', 'Sendloop vs lemlist', '/compare/sendloop-vs-lemlist', 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'footer' AND label = 'Sendloop vs lemlist'
);

INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Comparisons', 'Sendloop vs Apollo', '/compare/sendloop-vs-apollo', 4
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'footer' AND label = 'Sendloop vs Apollo'
);

INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Comparisons', 'Sendloop vs Saleshandy', '/compare/sendloop-vs-saleshandy', 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'footer' AND label = 'Sendloop vs Saleshandy'
);

INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order)
SELECT 'footer', 'Comparisons', 'Sendloop Alternatives', '/compare/sendloop-alternatives', 6
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'footer' AND label = 'Sendloop Alternatives'
);

-- 2. Ensure the label for the product group is consistently "Products".
UPDATE public.site_nav_items
SET group_label = 'Products'
WHERE location = 'footer' AND group_label = 'Product';

-- 3. Re-normalize sort_order within each footer group.
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
