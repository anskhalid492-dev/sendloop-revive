update site_settings set value = replace(value::text, 'Sendloop', 'MunchReach')::jsonb where value::text like '%Sendloop%';
update site_nav_items set label = replace(label, 'Sendloop', 'MunchReach') where label like '%Sendloop%';
update site_pages set
  title = replace(title, 'Sendloop', 'MunchReach'),
  seo_title = replace(coalesce(seo_title,''), 'Sendloop', 'MunchReach'),
  meta_description = replace(coalesce(meta_description,''), 'Sendloop', 'MunchReach'),
  og_description = replace(coalesce(og_description,''), 'Sendloop', 'MunchReach')
where (title || coalesce(seo_title,'') || coalesce(meta_description,'') || coalesce(og_description,'')) like '%Sendloop%';
update platform_settings set value = jsonb_set(value, '{login_logo_url}', '""'::jsonb, true) where key = 'system.branding' and not (value ? 'login_logo_url');