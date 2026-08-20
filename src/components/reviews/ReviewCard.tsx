import { placeholderAvatar } from "@/lib/reviews";
import { BadgeCheck, Quote, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/reviews";
import type { Testimonial } from "@/lib/testimonials.functions";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

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

function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function ReviewCard({
  review,
  featured = false,
  className,
}: {
  review: Testimonial;
  featured?: boolean;
  className?: string;
}) {
  const date = formatDate(review.reviewed_on);

  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-card p-6 text-left transition-colors",
        featured
          ? "border-primary/30 shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.5)] sm:p-8"
          : "border-border/70 hover:border-primary/25",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Stars rating={review.rating} />
        <span className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {categoryLabel(review.category)}
        </span>
      </div>

      <Quote className="mt-4 size-5 text-primary/50" aria-hidden="true" />
      <blockquote
        className={cn(
          "mt-2 flex-1 leading-relaxed text-foreground/90",
          featured ? "text-lg sm:text-xl" : "text-sm sm:text-base",
        )}
      >
        “{review.testimonial}”
      </blockquote>

      {review.result ? (
        <p className="mt-4 rounded-lg bg-primary/8 px-3 py-2 text-sm font-medium text-primary">
          {review.result}
        </p>
      ) : null}

      <figcaption className="mt-6 flex items-center gap-3 border-t border-border/60 pt-4">
        <img
          src={review.avatar_url || placeholderAvatar(`${review.id}-${review.name}`)}
          alt={`${review.name}, ${review.role} at ${review.company}`}
          className="size-11 shrink-0 rounded-full bg-secondary object-cover"
          loading="lazy"
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {review.name}
            {review.verified ? (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified customer" />
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[review.role, review.company].filter(Boolean).join(", ")}
            {date ? ` · ${date}` : ""}
          </p>
        </div>
        {review.company_logo_url ? (
          <img
            src={review.company_logo_url}
            alt={`${review.company} logo`}
            className="ml-auto h-6 w-auto shrink-0 opacity-70"
            loading="lazy"
          />
        ) : null}
      </figcaption>
    </figure>
  );
}
