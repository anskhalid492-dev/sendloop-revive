import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { TestimonialCard } from "@/components/site/TestimonialCard";
import { listTestimonials, type Testimonial } from "@/lib/testimonials.functions";

/**
 * The single testimonial section used across the whole marketing site:
 * a calm three-column grid of review cards, identical on every page.
 */
export function TestimonialCarousel({
  description,
}: {
  page?: string;
  title?: string;
  description?: string;
  /** Kept for API compatibility with existing pages. */
  autoplay?: boolean;
}) {
  const fetchTestimonials = useServerFn(listTestimonials);
  const { data } = useQuery({
    queryKey: ["testimonials", "home"],
    queryFn: () => fetchTestimonials({ data: { page: "home" } }),
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo<Testimonial[]>(() => (data ?? []).slice(0, 9), [data]);

  if (items.length === 0) return null;

  return (
    <section className="border-y border-border/60 bg-secondary/30 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Loved By Outreach Teams</h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
        ) : null}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <TestimonialCard key={t.id} testimonial={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
