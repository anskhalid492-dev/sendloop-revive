-- Footer social slots: one row per supported platform, hidden until staff add a real URL.
UPDATE public.site_nav_items
SET href = '', is_visible = false, updated_at = now()
WHERE location = 'social'
  AND href IN ('https://www.linkedin.com/', 'https://www.youtube.com/', 'https://x.com/', 'https://www.facebook.com/', '#', '#top');

UPDATE public.site_nav_items SET sort_order = 1, is_external = true WHERE location = 'social' AND label = 'X';
UPDATE public.site_nav_items SET sort_order = 3, is_external = true WHERE location = 'social' AND label = 'YouTube';
UPDATE public.site_nav_items SET sort_order = 4, is_external = true WHERE location = 'social' AND label = 'LinkedIn';
UPDATE public.site_nav_items SET sort_order = 5, is_external = true WHERE location = 'social' AND label = 'Facebook';

INSERT INTO public.site_nav_items (location, group_label, label, href, is_external, is_visible, sort_order)
SELECT v.label_loc, NULL, v.label, '', true, false, v.sort_order
FROM (VALUES
  ('social','X',1),
  ('social','Instagram',2),
  ('social','YouTube',3),
  ('social','LinkedIn',4),
  ('social','Facebook',5),
  ('social','Discord',6)
) AS v(label_loc, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items s WHERE s.location = 'social' AND s.label = v.label
);