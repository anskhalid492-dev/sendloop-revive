INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order, is_visible)
SELECT * FROM (VALUES
  ('footer','Comparisons','Sendloop vs Apollo','/compare/sendloop-vs-apollo',404,true),
  ('footer','Comparisons','Sendloop vs Saleshandy','/compare/sendloop-vs-saleshandy',405,true),
  ('footer','Comparisons','Sendloop Alternatives','/compare/sendloop-alternatives',406,true)
) AS v(location, group_label, label, href, sort_order, is_visible)
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items s WHERE s.location = 'footer' AND s.href = v.href
);

INSERT INTO public.site_pages (path, title, status, seo_title, meta_description, robots_index, include_in_sitemap, changefreq, priority)
SELECT * FROM (VALUES
  ('/compare/sendloop-vs-apollo','Sendloop vs Apollo','published','Sendloop vs Apollo — Email Execution or Contact Database?','Compare Sendloop and Apollo on cold email sending, deliverability and warmup, unified inbox, CRM, automations, analytics and prospect data.',true,true,'monthly',0.7),
  ('/compare/sendloop-vs-saleshandy','Sendloop vs Saleshandy','published','Sendloop vs Saleshandy — Cold Email Platform Comparison','Compare Sendloop and Saleshandy on sequences, mailbox rotation, warmup, deliverability controls, unified inbox, CRM, automations and reporting.',true,true,'monthly',0.7),
  ('/compare/sendloop-alternatives','Sendloop Alternatives','published','Sendloop Alternatives — Compare Cold Email Platforms (2026)','A neutral guide to Sendloop alternatives: Instantly, Smartlead, lemlist, Apollo and Saleshandy compared on sending, deliverability, warmup, inbox, CRM and automations.',true,true,'monthly',0.8)
) AS v(path, title, status, seo_title, meta_description, robots_index, include_in_sitemap, changefreq, priority)
WHERE NOT EXISTS (SELECT 1 FROM public.site_pages p WHERE p.path = v.path);