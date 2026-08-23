import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { TestimonialCard } from "@/components/site/TestimonialCard";
import { listTestimonials, type Testimonial } from "@/lib/testimonials.functions";

function chunkColumns<T>(items: T[], columns: number): T[][] {
  const result: T[][] = Array.from({ length: columns }, () => []);
  items.forEach((item, i) => {
    const col = result[i % columns];
    if (col) col.push(item);
  });
  return result;
}

function getThreeColumns<T>(items: T[]): [T[], T[], T[]] {
  const cols = chunkColumns(items, 3);
  return [cols[0] ?? [], cols[1] ?? [], cols[2] ?? []];
}

function ColumnTrack({
  items,
  direction,
  durationSeconds,
}: {
  items: Testimonial[];
  direction: "up" | "down";
  durationSeconds: number;
}) {
  if (items.length === 0) return null;

  const doubled = [...items, ...items];
  const animationClass = direction === "up" ? "animate-scroll-up" : "animate-scroll-down";

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className={`flex flex-col gap-5 ${animationClass} hover:[animation-play-state:paused]`}
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {doubled.map((t, index) => (
          <TestimonialCard key={`${t.id}-${index}`} testimonial={t} />
        ))}
      </div>
    </div>
  );
}

/**
 * The single testimonial section used across the whole marketing site:
 * three vertical columns of review cards that scroll up and down in an
 * infinite loop (column 1 up, column 2 down, column 3 up).
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

  const columns = getThreeColumns(items);

  return (
    <section className="border-y border-border/60 bg-secondary/30 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Loved By Outreach Teams</h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
        ) : null}

        <div
          className="mt-8 grid h-[640px] gap-5 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Customer testimonials"
        >
          <ColumnTrack items={columns[0]} direction="up" durationSeconds={36} />
          <ColumnTrack items={columns[1]} direction="down" durationSeconds={42} />
          <ColumnTrack items={columns[2]} direction="up" durationSeconds={38} />
        </div>
      </div>
    </section>
  );
}
