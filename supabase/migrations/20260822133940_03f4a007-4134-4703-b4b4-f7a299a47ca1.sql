-- Shorten footer Legal anchors
UPDATE public.site_nav_items
SET label = 'Terms'
WHERE location = 'footer' AND group_label = 'Legal' AND label = 'Terms of Service';

UPDATE public.site_nav_items
SET label = 'Acceptable Use'
WHERE location = 'footer' AND group_label = 'Legal' AND label = 'Acceptable Use Policy';

UPDATE public.site_nav_items
SET label = 'DPA'
WHERE location = 'footer' AND group_label = 'Legal' AND label = 'Data Processing Agreement';

-- Remove Support section from footer
DELETE FROM public.site_nav_items
WHERE location = 'footer' AND group_label = 'Support';

-- Add User Guide & Alerts to header Resources
INSERT INTO public.site_nav_items (location, group_label, label, href, description, icon, is_external, is_visible, sort_order)
SELECT 'header', 'resources', 'User Guide & Alerts', '/user-guide', 'Product guides, incident notices and platform updates.', 'GraduationCap', false, true, 35
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items
  WHERE location = 'header' AND group_label = 'resources' AND href = '/user-guide'
);
