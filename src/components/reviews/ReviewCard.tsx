import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { TestimonialCard } from "@/components/site/TestimonialCard";
import type { Testimonial } from "@/lib/testimonials.functions";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn(
            "size-4",
            i <= rating ? "fill-primary text-primary" : "text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Reviews use the same card design as every other testimonial on the site.
 */
export function ReviewCard({
  review,
  featured = false,
  className,
}: {
  review: Testimonial;
  featured?: boolean;
  className?: string;
}) {
  return <TestimonialCard testimonial={review} featured={featured} className={className} />;
}
