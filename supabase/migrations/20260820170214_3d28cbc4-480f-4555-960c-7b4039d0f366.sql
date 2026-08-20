-- Footer: Comparisons column after Legal
INSERT INTO public.site_nav_items (location, group_label, label, href, sort_order, is_visible)
SELECT * FROM (VALUES
  ('footer','Comparisons','Sendloop vs Instantly','/compare/sendloop-vs-instantly',401,true),
  ('footer','Comparisons','Sendloop vs Smartlead','/compare/sendloop-vs-smartlead',402,true),
  ('footer','Comparisons','Sendloop vs lemlist','/compare/sendloop-vs-lemlist',403,true)
) AS v(location, group_label, label, href, sort_order, is_visible)
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_nav_items s WHERE s.location = 'footer' AND s.href = v.href
);

-- Sitemap / SEO registry entries
INSERT INTO public.site_pages (path, title, status, seo_title, meta_description, robots_index, include_in_sitemap, changefreq, priority)
SELECT * FROM (VALUES
  ('/compare/sendloop-vs-instantly','Sendloop vs Instantly','published','Sendloop vs Instantly — Honest Cold Email Platform Comparison','Compare Sendloop and Instantly across campaigns, sending infrastructure, warmup, unified inbox, CRM, automations and analytics.',true,true,'monthly',0.7),
  ('/compare/sendloop-vs-smartlead','Sendloop vs Smartlead','published','Sendloop vs Smartlead — Campaigns, Deliverability and Inbox Compared','A side-by-side look at Sendloop and Smartlead: sequences, sending infrastructure, deliverability controls, inbox, CRM and automations.',true,true,'monthly',0.7),
  ('/compare/sendloop-vs-lemlist','Sendloop vs lemlist','published','Sendloop vs lemlist — Email-First Outbound or Multichannel?','Compare Sendloop and lemlist on email outreach, multichannel sequences, AI personalization, deliverability, inbox, CRM and lead data.',true,true,'monthly',0.7)
) AS v(path, title, status, seo_title, meta_description, robots_index, include_in_sitemap, changefreq, priority)
WHERE NOT EXISTS (SELECT 1 FROM public.site_pages p WHERE p.path = v.path);