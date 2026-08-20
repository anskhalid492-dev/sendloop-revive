-- Footer navigation: remove "How It Works" and "About Us" from the Resources column.

DELETE FROM public.site_nav_items
WHERE location = 'footer'
  AND group_label = 'Resources'
  AND href IN ('/how-it-works', '/about');

-- Re-normalize sort_order within each footer group after the deletion.
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
