INSERT INTO public.site_nav_items (location, group_label, label, href, description, icon, sort_order, is_visible)
SELECT 'header', 'top', 'Features', '/features', NULL, NULL, 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items WHERE location = 'header' AND href = '/features'
);

UPDATE public.site_nav_items
SET description = replace(description, 'Sendloop', 'MunchReach')
WHERE description LIKE '%Sendloop%';