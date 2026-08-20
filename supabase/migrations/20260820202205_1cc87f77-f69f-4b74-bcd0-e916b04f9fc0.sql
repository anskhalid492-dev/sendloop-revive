update public.testimonials set
  testimonial = replace(testimonial, 'Sendloop', 'MunchReach'),
  result = replace(coalesce(result,''), 'Sendloop', 'MunchReach'),
  bio = replace(coalesce(bio,''), 'Sendloop', 'MunchReach')
where (testimonial || coalesce(result,'') || coalesce(bio,'')) like '%Sendloop%';