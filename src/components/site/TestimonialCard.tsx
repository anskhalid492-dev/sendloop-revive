import { Check, Star } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { placeholderAvatar } from "@/lib/reviews";
import type { Testimonial } from "@/lib/testimonials.functions";

function formatDate(value: string): string | null {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Highlights the saved result phrase inside the quote when it appears verbatim. */
function renderQuote(text: string, highlight: string | null): ReactNode {
  if (!highlight) return text;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/15 px-1 font-semibold text-primary">
        {text.slice(idx, idx + highlight.length)}
      </mark>
      {text.slice(idx + highlight.length)}
    </>
  );
}

/**
 * The single testimonial card design used everywhere on the marketing site:
 * square star rating, verified badge + date, quote, then the person.
 */
export function TestimonialCard({
  testimonial: t,
  featured = false,
  className,
}: {
  testimonial: Testimonial;
  featured?: boolean | undefined;
  className?: string | undefined;
}) {
  const date = t.reviewed_on ? formatDate(t.reviewed_on) : null;
  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-card p-5 text-left transition-colors duration-200",
        featured ? "border-primary/30 sm:p-6" : "border-border/70 hover:border-primary/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "flex size-5 items-center justify-center rounded-[3px]",
                i < t.rating ? "bg-primary" : "bg-muted",
              )}
            >
              <Star className="size-3 fill-primary-foreground text-primary-foreground" aria-hidden="true" />
            </span>
          ))}
        </div>
        {t.verified || date ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {t.verified ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
                <Check className="size-3.5" aria-hidden="true" /> Verified
              </span>
            ) : null}
            {t.verified && date ? <span aria-hidden="true">·</span> : null}
            {date ? <span>{date}</span> : null}
          </p>
        ) : null}
      </div>

      <blockquote
        className={cn(
          "mt-4 flex-1 leading-relaxed text-foreground/90",
          featured ? "text-base sm:text-lg" : "text-sm sm:text-[15px]",
        )}
      >
        “{renderQuote(t.testimonial, t.result)}”
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-3">
        <img
          src={t.avatar_url || placeholderAvatar(`${t.id}-${t.name}`)}
          alt={`${t.name}${t.role ? `, ${t.role}` : ""}${t.company ? ` at ${t.company}` : ""}`}
          className="size-10 shrink-0 rounded-full bg-secondary object-cover"
          loading="lazy"
          draggable={false}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[t.role, t.company].filter(Boolean).join(", ")}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
