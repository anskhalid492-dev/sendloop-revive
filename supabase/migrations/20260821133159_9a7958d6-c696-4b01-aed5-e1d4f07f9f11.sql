UPDATE public.site_nav_items SET sort_order = 0 WHERE location = 'header' AND group_label = 'top' AND href = '/features';
UPDATE public.site_nav_items SET sort_order = 10 WHERE location = 'header' AND group_label = 'top' AND href = '/customer-reviews';
UPDATE public.site_nav_items SET sort_order = 20 WHERE location = 'header' AND group_label = 'top' AND href = '/pricing';
UPDATE public.site_nav_items SET sort_order = 30 WHERE location = 'header' AND group_label = 'top' AND href = '/blog';

DELETE FROM public.testimonials
WHERE name ILIKE '%placeholder%'
   OR name ILIKE '%replace in admin%'
   OR company ILIKE 'Example %'
   OR company ILIKE '%dummy%';