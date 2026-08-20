UPDATE public.site_nav_items SET sort_order = 3 WHERE location='header' AND group_label='top' AND href='/pricing';
UPDATE public.site_nav_items SET sort_order = 2 WHERE location='header' AND group_label='top' AND href='/blog';
INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order, is_visible)
SELECT 'header','top','Customer Reviews','/customer-reviews',1,true
WHERE NOT EXISTS (SELECT 1 FROM public.site_nav_items WHERE location='header' AND group_label='top' AND href='/customer-reviews');