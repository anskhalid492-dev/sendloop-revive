ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS rating smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_on date NOT NULL DEFAULT current_date;

CREATE OR REPLACE FUNCTION public.validate_testimonial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  IF NEW.category NOT IN ('agency','saas','sales','recruiting','consulting','other') THEN
    RAISE EXCEPTION 'Unknown review category %', NEW.category;
  END IF;
  IF NEW.reviewed_on > current_date THEN
    RAISE EXCEPTION 'Review date cannot be in the future';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS testimonials_validate ON public.testimonials;
CREATE TRIGGER testimonials_validate
BEFORE INSERT OR UPDATE ON public.testimonials
FOR EACH ROW EXECUTE FUNCTION public.validate_testimonial();

-- Aggregate-only social proof for the public reviews page: counts, never rows.
CREATE OR REPLACE FUNCTION public.public_review_stats()
RETURNS TABLE(customers bigint, emails_sent bigint, campaigns bigint, average_rating numeric, reviews bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.workspaces),
    (SELECT count(*) FROM public.campaign_messages WHERE status = 'sent'),
    (SELECT count(*) FROM public.campaigns WHERE status <> 'draft'),
    (SELECT round(avg(rating)::numeric, 1) FROM public.testimonials WHERE active),
    (SELECT count(*) FROM public.testimonials WHERE active);
$$;

GRANT EXECUTE ON FUNCTION public.public_review_stats() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins manage review media" ON storage.objects;
CREATE POLICY "Admins manage review media" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'review-media' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'review-media' AND public.has_role(auth.uid(), 'admin'));