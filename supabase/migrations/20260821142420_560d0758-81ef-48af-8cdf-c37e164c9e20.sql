INSERT INTO public.site_nav_items (location, group_label, label, href, description, icon, is_visible, sort_order)
VALUES
  ('header', 'more', 'AI Personalization', '/ai-personalized-outreach', 'Write a unique opening line for every prospect with your own OpenAI key.', 'Sparkles', true, 0),
  ('footer', 'Products', 'AI Personalization', '/ai-personalized-outreach', NULL, 'Sparkles', true, 10);

INSERT INTO public.site_faqs (page_slug, question, answer, category, sort_order, published) VALUES
  ('ai-personalization', 'Do I need my own OpenAI account?', 'Yes. You connect your own OpenAI API key in the campaign builder, so you choose the model and OpenAI bills you directly at their rates.', 'AI Personalization', 1, true),
  ('ai-personalization', 'Where is my API key stored?', 'It is encrypted before it is saved and only decrypted on our servers when a personalization runs. It is never sent back to the browser and never shown again after you save it.', 'AI Personalization', 2, true),
  ('ai-personalization', 'Which models can I use?', 'GPT-4o mini, GPT-4o, GPT-4.1 mini and GPT-4.1. Start with GPT-4o mini for cost and move up when you want richer copy.', 'AI Personalization', 3, true),
  ('ai-personalization', 'Can the AI invent things about my prospect?', 'The prompt only receives the lead fields you select and the model is instructed to use nothing else. If there is not enough real data it returns nothing rather than guessing.', 'AI Personalization', 4, true),
  ('ai-personalization', 'What happens when a lead has no usable data?', 'You choose per campaign: send with a fallback line, send without the personalization, or hold that lead back until you review it.', 'AI Personalization', 5, true),
  ('ai-personalization', 'Can I edit what the AI writes before sending?', 'Yes. Every generated line appears in the AI tab and can be edited, regenerated or approved before the campaign goes out.', 'AI Personalization', 6, true),
  ('ai-personalization', 'Does MunchReach charge for AI usage?', 'No. MunchReach charges for the outreach platform; AI usage is billed to your own OpenAI account at OpenAI''s rates.', 'AI Personalization', 7, true);