-- Blog content hub: authors, categories, posts, tags and newsletter subscribers.
CREATE TABLE IF NOT EXISTS public.blog_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_authors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_authors TO authenticated;
GRANT ALL ON public.blog_authors TO service_role;
ALTER TABLE public.blog_authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors are public" ON public.blog_authors FOR SELECT USING (true);
CREATE POLICY "Admins manage authors" ON public.blog_authors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_categories TO authenticated;
GRANT ALL ON public.blog_categories TO service_role;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.blog_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.blog_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blog_post_status') THEN
    CREATE TYPE public.blog_post_status AS ENUM ('draft','scheduled','published','archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blog_content_type') THEN
    CREATE TYPE public.blog_content_type AS ENUM ('article','guide','case_study','template','tutorial','product_update');
  END IF;
END $do$;

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  cover_image_url text,
  category_id uuid REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  author_id uuid REFERENCES public.blog_authors(id) ON DELETE SET NULL,
  content_type public.blog_content_type NOT NULL DEFAULT 'article',
  status public.blog_post_status NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  popular_guide boolean NOT NULL DEFAULT false,
  reading_minutes smallint NOT NULL DEFAULT 5,
  tags text[] NOT NULL DEFAULT '{}',
  seo_title text,
  meta_description text,
  canonical_url text,
  og_image_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON public.blog_posts (category_id);
CREATE INDEX IF NOT EXISTS blog_posts_author_idx ON public.blog_posts (author_id);
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published posts are public" ON public.blog_posts FOR SELECT
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());
CREATE POLICY "Admins read all posts" ON public.blog_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage posts" ON public.blog_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER blog_posts_updated_at BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER blog_authors_updated_at BEFORE UPDATE ON public.blog_authors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL DEFAULT 'blog',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_key
  ON public.newsletter_subscribers (lower(email));
GRANT SELECT ON public.newsletter_subscribers TO service_role;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read subscribers" ON public.newsletter_subscribers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('cold-email','Cold Email','Writing, sending and improving cold outreach.',1) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('deliverability','Deliverability','Authentication, reputation and inbox placement.',2) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('lead-generation','Lead Generation','Sourcing, enriching and verifying B2B lists.',3) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('copywriting','Copywriting','Subject lines, openers and message structure.',4) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('follow-ups','Follow-ups','Cadence, sequencing and stop rules.',5) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('sales','Sales','Turning replies into conversations and pipeline.',6) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('crm','CRM','Pipeline hygiene, stages and process.',7) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('email-warmup','Email Warmup','Ramping new domains and mailboxes safely.',8) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('outbound','Outbound','Strategy, measurement and team operations.',9) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('case-studies','Case Studies','How real teams run outbound.',10) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (slug, name, description, sort_order) VALUES ('product-updates','Product Updates','What shipped in Sendloop.',11) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_authors (slug, name, role, bio) VALUES ('anas-khalid','Anas Khalid','Founder, Sendloop','Builds Sendloop and writes about cold email strategy, sequencing and outbound operations.') ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_authors (slug, name, role, bio) VALUES ('sara-lindqvist','Sara Lindqvist','Deliverability Lead','Works on sending infrastructure, authentication and inbox placement at Sendloop.') ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'cold-emails-that-get-replies', 'How to Write Cold Emails That Actually Get Replies', 'A practical framework for short, personalized emails that earn a response instead of a delete.', 'A practical framework for short, personalized emails that earn a response instead of a delete.', $md$## Start from the reply, not the pitch

Write the sentence you want them to send back before you write anything else. If you cannot imagine a plausible one-line reply, the email is about you rather than them.

Most cold emails fail because they ask the reader to do work: parse a paragraph of positioning, then guess what is being asked.

## Keep it under 90 words

Short emails read as respectful and are far easier to answer on a phone. Cut every sentence that would survive being deleted.

## Personalize the reason, not the greeting

A first-name token is not personalization. A single specific line about why you are writing to this company this week is.

Good angles: a role they are hiring for, a product change they shipped, a market they entered, a metric they published.

## Ask one small question

One question, answerable in a sentence, with no calendar link on the first touch. Interest first, logistics second.

## Test the opener, not the whole email

Change one variable at a time and give each version enough volume to mean something. Opener and ask move reply rate far more than the sign-off.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='cold-email'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'article'::public.blog_content_type, 'published', true, false, 7, ARRAY['copywriting','personalization','reply-rate']::text[],
  'How to Write Cold Emails That Actually Get Replies — Sendloop Blog', 'A practical framework for short, personalized emails that earn a response instead of a delete.', '2026-08-18 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='cold-emails-that-get-replies');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'cold-email-deliverability-guide', 'Cold Email Deliverability Guide', 'Everything that decides whether your email lands in the inbox, in order of impact.', 'Everything that decides whether your email lands in the inbox, in order of impact.', $md$## Authentication comes first

Publish SPF, DKIM and DMARC on the sending domain and verify alignment before a single campaign goes out. Without these, everything else is noise.

## Use a separate sending domain

Keep cold outreach off the domain that carries invoices, password resets and customer conversations. A lookalike domain isolates reputation risk.

## Volume ramps, it does not launch

New mailboxes start at a handful of sends a day and grow gradually. Sudden volume from a cold identity is the single clearest spam signal.

## List quality is a deliverability setting

Bounces above roughly two percent damage reputation quickly. Verify addresses, suppress role accounts, and remove anything you cannot confirm.

## Content still matters

Link count, image-only bodies, tracking domains that nobody recognises and spam-trigger phrasing all drag placement down. Plain text with one link is the safe default.

## Measure placement, not opens

Seed tests and reply rate tell you where mail lands. Open rate is inflated by privacy proxies and should never be the deliverability metric.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='deliverability'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'guide'::public.blog_content_type, 'published', false, true, 12, ARRAY['spf','dkim','dmarc','inbox-placement']::text[],
  'Cold Email Deliverability Guide — Sendloop Blog', 'Everything that decides whether your email lands in the inbox, in order of impact.', '2026-08-17 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='cold-email-deliverability-guide');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'complete-cold-email-guide', 'The Complete Cold Email Guide', 'From offer and list to sequence, sending setup and measurement — the whole system in one place.', 'From offer and list to sequence, sending setup and measurement — the whole system in one place.', $md$## Offer before outreach

Cold email amplifies an offer; it cannot rescue one. Define who the offer is obviously good for and write outreach only to that segment.

## Build the list deliberately

A tight list of a few hundred well-matched companies outperforms tens of thousands of loosely filtered contacts on every metric that matters.

## Set up sending infrastructure

Separate domain, authenticated mailboxes, a warmup period and enough mailboxes to keep per-inbox volume low.

## Design the sequence

An opener, one or two value follow-ups and a close. Stop on reply, and keep follow-ups in the same thread only when it reads naturally.

## Write for one person

Draft the email to a specific named prospect, then generalise only as far as the segment allows.

## Measure and iterate weekly

Reply rate and positive reply rate per segment. Change one variable per week and keep a written log of what you tried.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='cold-email'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'guide'::public.blog_content_type, 'published', false, true, 18, ARRAY['strategy','sequences','fundamentals']::text[],
  'The Complete Cold Email Guide — Sendloop Blog', 'From offer and list to sequence, sending setup and measurement — the whole system in one place.', '2026-08-16 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='complete-cold-email-guide');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'spf-dkim-dmarc-explained', 'SPF, DKIM and DMARC Explained for Sales Teams', 'What each record does, the exact DNS entries to publish, and how to verify alignment.', 'What each record does, the exact DNS entries to publish, and how to verify alignment.', $md$## SPF: who may send for you

An SPF record is a TXT entry listing the servers allowed to send for your domain, ending in a policy such as ~all. Keep it under ten DNS lookups.

## DKIM: proof nothing changed

Your provider gives you a public key to publish as a TXT record at a selector hostname. Receiving servers verify the signature on every message.

## DMARC: what to do on failure

A DMARC record tells receivers how to treat mail that fails SPF or DKIM alignment, and where to send reports. Start at p=none and read the reports before tightening.

## Verify alignment

Send a test to a mailbox you control, open the original headers, and confirm all three pass and that the domains align with your From address.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='deliverability'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'tutorial'::public.blog_content_type, 'published', false, false, 9, ARRAY['dns','authentication','spf','dkim','dmarc']::text[],
  'SPF, DKIM and DMARC Explained for Sales Teams — Sendloop Blog', 'What each record does, the exact DNS entries to publish, and how to verify alignment.', '2026-08-15 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='spf-dkim-dmarc-explained');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'email-warmup-guide', 'Email Warmup Guide', 'How long to warm a new domain, what a safe ramp looks like, and when to stop.', 'How long to warm a new domain, what a safe ramp looks like, and when to stop.', $md$## What warmup actually does

Warmup builds a history of positive interactions from a new identity: mail that is delivered, opened and replied to rather than deleted or reported.

## A realistic ramp

Start around five to ten sends per mailbox per day and increase gradually over two to four weeks. Older domains ramp faster than freshly registered ones.

## Keep warmup running

Reputation decays. Leave a low level of warmup traffic in place while campaigns run rather than switching it off on launch day.

## When to pause

Rising bounces, sudden placement changes or spam complaints mean stop, fix the list or the content, and resume at lower volume.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='email-warmup'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'guide'::public.blog_content_type, 'published', false, true, 8, ARRAY['warmup','domains','volume']::text[],
  'Email Warmup Guide — Sendloop Blog', 'How long to warm a new domain, what a safe ramp looks like, and when to stop.', '2026-08-14 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='email-warmup-guide');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'cold-email-follow-up-guide', 'Cold Email Follow-Up Guide', 'Cadence, thread behaviour and stop rules that lift replies without annoying anyone.', 'Cadence, thread behaviour and stop rules that lift replies without annoying anyone.', $md$## Two to four follow-ups is the useful range

Beyond that, additional touches mostly generate complaints rather than replies.

## Space them sensibly

Three to five business days between touches. Same-day and next-day follow-ups read as automated pressure.

## Each follow-up needs its own reason to exist

Never send 'just bumping this'. Add a proof point, a different angle, or a smaller ask.

## Thread behaviour

Replying in the existing thread helps context but makes an ignored opener more visible. Mix threaded and fresh-subject touches across the sequence.

## Stop rules

Stop on reply, stop on unsubscribe, and consider stopping the whole company when any contact there replies.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='follow-ups'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'guide'::public.blog_content_type, 'published', false, true, 9, ARRAY['cadence','sequences','stop-rules']::text[],
  'Cold Email Follow-Up Guide — Sendloop Blog', 'Cadence, thread behaviour and stop rules that lift replies without annoying anyone.', '2026-08-13 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='cold-email-follow-up-guide');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'build-a-b2b-lead-list', 'How to Build a B2B Lead List', 'Sourcing, enrichment, verification and suppression — the full workflow for a clean list.', 'Sourcing, enrichment, verification and suppression — the full workflow for a clean list.', $md$## Define the segment in writing

Industry, size band, geography, and the trigger that makes now the right time. If a record does not match all four, it does not belong on the list.

## Source from more than one place

Directories, job boards, review sites, association member lists and public filings all produce companies that generic databases miss.

## Enrich only what you will use

Every field you collect must appear in the email or in a filter. Everything else is maintenance cost.

## Verify before you send

Run addresses through verification, drop catch-all and risky results from the first campaign, and keep bounces under two percent.

## Maintain suppression

Unsubscribes, customers, open opportunities and competitors go on a permanent suppression list checked before every import.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='lead-generation'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'guide'::public.blog_content_type, 'published', false, true, 10, ARRAY['list-building','enrichment','verification']::text[],
  'How to Build a B2B Lead List — Sendloop Blog', 'Sourcing, enrichment, verification and suppression — the full workflow for a clean list.', '2026-08-12 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='build-a-b2b-lead-list');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'cold-email-personalization-guide', 'Cold Email Personalization Guide', 'Five research angles that take thirty seconds per prospect and change the reply rate.', 'Five research angles that take thirty seconds per prospect and change the reply rate.', $md$## Hiring signals

An open role tells you what a team is trying to build this quarter and is almost always public.

## Recent product or site changes

A new page, pricing change or launch post gives a concrete, dated reason to be writing now.

## Public numbers

Funding, headcount growth or a published metric lets you frame the message around scale rather than generic benefit.

## Their own words

A conference talk, podcast appearance or long-form post is the fastest route to a line that could not have been sent to anyone else.

## Peer context

Naming a comparable company and the specific outcome is personalization at segment level and scales far better than per-prospect research.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='copywriting'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'guide'::public.blog_content_type, 'published', false, true, 8, ARRAY['personalization','research','copywriting']::text[],
  'Cold Email Personalization Guide — Sendloop Blog', 'Five research angles that take thirty seconds per prospect and change the reply rate.', '2026-08-11 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='cold-email-personalization-guide');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'subject-lines-that-get-opened', 'The Anatomy of a Subject Line That Gets Opened', 'Short, lowercase and specific wins. Here are the patterns that hold up in practice.', 'Short, lowercase and specific wins. Here are the patterns that hold up in practice.', $md$## Short beats clever

Under about forty-five characters survives mobile truncation. Clever wordplay reads as marketing.

## Lowercase reads like a person

Sentence case or lowercase consistently outperforms title case in cold outreach.

## Be specific and concrete

Reference the company, the role or the thing you noticed rather than a benefit claim.

## Avoid the obvious triggers

Free, guarantee, exclamation marks and all caps hurt both placement and credibility.

## Match the body

A subject line that oversells the email is the fastest way to train someone to ignore you.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='copywriting'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'article'::public.blog_content_type, 'published', false, false, 6, ARRAY['subject-lines','copywriting']::text[],
  'The Anatomy of a Subject Line That Gets Opened — Sendloop Blog', 'Short, lowercase and specific wins. Here are the patterns that hold up in practice.', '2026-08-10 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='subject-lines-that-get-opened');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'mailbox-rotation-safe-volume', 'Mailbox Rotation: The Math Behind Safe Daily Volume', 'How many mailboxes a list actually needs, and how to spread sending across them.', 'How many mailboxes a list actually needs, and how to spread sending across them.', $md$## Start from daily volume

Decide the daily send target, divide by a conservative per-mailbox cap, and round up. That is your mailbox count.

## Conservative caps

Thirty to fifty sends per mailbox per day is a sustainable ceiling for most cold outreach after warmup.

## Rotate evenly

Even distribution beats draining one mailbox before touching the next; per-inbox spikes are what get noticed.

## Keep replies with the sender

Whatever the rotation, follow-ups and replies should stay with the mailbox that started the conversation.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='deliverability'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'article'::public.blog_content_type, 'published', false, false, 7, ARRAY['rotation','volume','sending-accounts']::text[],
  'Mailbox Rotation: The Math Behind Safe Daily Volume — Sendloop Blog', 'How many mailboxes a list actually needs, and how to spread sending across them.', '2026-08-09 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='mailbox-rotation-safe-volume');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'stop-tracking-opens', 'Open Tracking Is Broken — Measure This Instead', 'Privacy proxies inflate opens. Build reporting around replies, meetings and pipeline.', 'Privacy proxies inflate opens. Build reporting around replies, meetings and pipeline.', $md$## Why opens broke

Privacy proxies pre-fetch images, so a large share of recorded opens never involved a human.

## Tracking pixels cost placement

Every tracking domain and pixel is another signal for filters to weigh, in exchange for a number you cannot trust.

## Measure replies and meetings

Reply rate, positive reply rate, meetings booked and pipeline created are all observable and all resistant to proxy noise.

## Use seed tests for placement

A small set of monitored mailboxes across major providers tells you where mail lands far more reliably than open rate.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='outbound'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'article'::public.blog_content_type, 'published', false, false, 5, ARRAY['analytics','tracking','reporting']::text[],
  'Open Tracking Is Broken — Measure This Instead — Sendloop Blog', 'Privacy proxies inflate opens. Build reporting around replies, meetings and pipeline.', '2026-08-08 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='stop-tracking-opens');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'three-email-sequence', 'The 3-Email Sequence That Books Meetings', 'A specific opener, a value bump and a graceful close — broken down line by line.', 'A specific opener, a value bump and a graceful close — broken down line by line.', $md$## Email one: the specific opener

One line on why them, one line on what you do for companies like them, one small question. Under ninety words.

## Email two: the value bump

Three to five days later, add a proof point — a comparable outcome, a short teardown, or a resource that stands alone.

## Email three: the graceful close

Acknowledge that timing may be wrong, ask whether you should close the file, and leave the door open. This message frequently outperforms the opener.

## Rules that make it work

Stop on reply, keep sending windows to business hours in the prospect's timezone, and cap contacts per company.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='follow-ups'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'template'::public.blog_content_type, 'published', false, false, 7, ARRAY['sequences','templates','meetings']::text[],
  'The 3-Email Sequence That Books Meetings — Sendloop Blog', 'A specific opener, a value bump and a graceful close — broken down line by line.', '2026-08-07 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='three-email-sequence');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'agency-workspace-playbook', 'How Agencies Run Dozens of Client Workspaces Without Chaos', 'Workspace structure, roles, reporting cadence and the automations that keep it profitable.', 'Workspace structure, roles, reporting cadence and the automations that keep it profitable.', $md$## One workspace per client

Separate workspaces keep leads, sending accounts, suppression and reporting cleanly isolated, which matters when a client leaves.

## Roles, not shared logins

Campaign managers, inbox managers and client viewers each get scoped access. Clients can see results without touching campaigns.

## A fixed reporting cadence

A weekly number and a monthly narrative. Ad-hoc reporting requests are a symptom of a missing cadence.

## Standardise the launch checklist

Domain, authentication, warmup, list verification, sequence review and stop rules — the same checklist for every client, every time.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='case-studies'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'case-study'::public.blog_content_type, 'published', false, false, 8, ARRAY['agency','workspaces','operations']::text[],
  'How Agencies Run Dozens of Client Workspaces Without Chaos — Sendloop Blog', 'Workspace structure, roles, reporting cadence and the automations that keep it profitable.', '2026-08-06 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='agency-workspace-playbook');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'crm-hygiene-for-outbound', 'CRM Hygiene for Outbound Teams', 'Stage definitions, ownership rules and the fields that actually change a forecast.', 'Stage definitions, ownership rules and the fields that actually change a forecast.', $md$## Define stages by evidence

Each stage should require something observable from the prospect, not a feeling from the rep.

## One owner per record

Ambiguous ownership is how prospects receive two different pitches in the same week.

## Keep fields few

If a field never appears in a filter, a report or an email, delete it.

## Review the pipeline on a schedule

Anything untouched past its stage window either moves or closes. Stale pipeline hides the real number.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='crm'),
  (SELECT id FROM public.blog_authors WHERE slug='sara-lindqvist'),
  'article'::public.blog_content_type, 'published', false, false, 6, ARRAY['crm','pipeline','process']::text[],
  'CRM Hygiene for Outbound Teams — Sendloop Blog', 'Stage definitions, ownership rules and the fields that actually change a forecast.', '2026-08-05 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='crm-hygiene-for-outbound');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'sales-handoff-after-the-reply', 'What to Do in the First Hour After a Reply', 'Speed, context and a single clear next step decide whether a reply becomes a meeting.', 'Speed, context and a single clear next step decide whether a reply becomes a meeting.', $md$## Speed is the whole advantage

A reply answered within the hour converts dramatically better than one answered the next day.

## Bring the context with you

The first response should reference what they actually said and what was originally sent, not restart the pitch.

## One clear next step

Offer two concrete times or one short call. Choice beyond that creates delay.

## Log the outcome immediately

Positive, neutral or negative, recorded against the campaign — this is the only feedback loop that improves the next sequence.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='sales'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'article'::public.blog_content_type, 'published', false, false, 5, ARRAY['sales','inbox','process']::text[],
  'What to Do in the First Hour After a Reply — Sendloop Blog', 'Speed, context and a single clear next step decide whether a reply becomes a meeting.', '2026-08-04 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='sales-handoff-after-the-reply');

INSERT INTO public.blog_posts (slug, title, subtitle, excerpt, content, category_id, author_id, content_type, status, featured, popular_guide, reading_minutes, tags, seo_title, meta_description, published_at)
SELECT 'unified-inbox-update', 'Product Update: Unified Inbox Threading Improvements', 'Replies now thread by message headers first, so conversations stay in one place.', 'Replies now thread by message headers first, so conversations stay in one place.', $md$## Header-first threading

Replies are now matched on message identifiers before falling back to subject and participant matching, so conversations stay in a single thread.

## Fewer duplicate conversations

Forwarded replies and auto-responders no longer split an existing thread into separate conversations.

## What you need to do

Nothing. The change applies to newly received replies across all workspaces.$md$,
  (SELECT id FROM public.blog_categories WHERE slug='product-updates'),
  (SELECT id FROM public.blog_authors WHERE slug='anas-khalid'),
  'product-update'::public.blog_content_type, 'published', false, false, 4, ARRAY['product','inbox']::text[],
  'Product Update: Unified Inbox Threading Improvements — Sendloop Blog', 'Replies now thread by message headers first, so conversations stay in one place.', '2026-08-03 09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='unified-inbox-update');
