import { BadgeCheck, Quote, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { placeholderAvatar } from "@/lib/reviews";
import type { Testimonial } from "@/lib/testimonials.functions";

/**
 * The single testimonial card design used everywhere on the marketing site:
 * person first (avatar, name, role & company), star rating, quote mark, the
 * quote itself and an optional result pill.
 */
export function TestimonialCard({
  testimonial: t,
  featured = false,
  className,
}: {
  testimonial: Testimonial;
  featured?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-card p-5 text-left shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] transition-colors duration-200",
        featured
          ? "border-primary/30 shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.5)] sm:p-6"
          : "border-border/70 hover:border-primary/30",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <img
          src={t.avatar_url || placeholderAvatar(`${t.id}-${t.name}`)}
          alt={`${t.name}, ${t.role} at ${t.company}`}
          className="size-12 shrink-0 rounded-full bg-secondary object-cover"
          loading="lazy"
          draggable={false}
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {t.name}
            {t.verified ? (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified customer" />
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[t.role, t.company].filter(Boolean).join(", ")}
          </p>
          {t.bio ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/90">{t.bio}</p>
          ) : null}
        </div>
        {t.company_logo_url ? (
          <img
            src={t.company_logo_url}
            alt={`${t.company} logo`}
            className="ml-auto h-5 w-auto shrink-0 opacity-70"
            loading="lazy"
            draggable={false}
          />
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-1" aria-label={`${t.rating} out of 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn("size-3.5", i < t.rating ? "fill-primary text-primary" : "text-border")}
            aria-hidden="true"
          />
        ))}
      </div>

      <Quote className="mt-3 size-5 text-primary/50" aria-hidden="true" />
      <blockquote
        className={cn(
          "mt-2 flex-1 leading-relaxed text-foreground/90",
          featured ? "text-base sm:text-lg" : "text-sm",
        )}
      >
        “{t.testimonial}”
      </blockquote>

      {t.result ? (
        <p className="mt-4 inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {t.result}
        </p>
      ) : null}
    </figure>
  );
}
