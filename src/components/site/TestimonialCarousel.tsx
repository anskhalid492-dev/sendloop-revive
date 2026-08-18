import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";

import { cn } from "@/lib/utils";
import { listTestimonials, type Testimonial } from "@/lib/testimonials.functions";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Card({ t, active }: { t: Testimonial; active: boolean }) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col justify-between rounded-2xl border bg-card p-6 transition-all duration-300 sm:p-8",
        active
          ? "border-primary/30 shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.5)]"
          : "border-border/70 opacity-70",
      )}
    >
      <Quote className="size-6 text-primary/60" aria-hidden="true" />
      <blockquote className="mt-4 text-base leading-relaxed text-foreground/90 sm:text-lg">
        “{t.testimonial}”
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        {t.avatar_url ? (
          <img
            src={t.avatar_url}
            alt={`${t.name}, ${t.role} at ${t.company}`}
            className="size-11 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
          >
            {initials(t.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[t.role, t.company].filter(Boolean).join(", ")}
          </p>
        </div>
        {t.company_logo_url ? (
          <img
            src={t.company_logo_url}
            alt={`${t.company} logo`}
            className="ml-auto h-6 w-auto shrink-0 opacity-70"
            loading="lazy"
          />
        ) : null}
      </figcaption>
      {t.result ? (
        <p className="mt-4 inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {t.result}
        </p>
      ) : null}
    </figure>
  );
}

export function TestimonialCarousel({
  page,
  title = "What teams say about Sendloop",
  description,
  autoplay = true,
}: {
  page: string;
  title?: string;
  description?: string;
  autoplay?: boolean;
}) {
  const fetchTestimonials = useServerFn(listTestimonials);
  const { data } = useQuery({
    queryKey: ["testimonials", page],
    queryFn: () => fetchTestimonials({ data: { page } }),
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(() => data ?? [], [data]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragging = useRef<{ startX: number; startScroll: number } | null>(null);

  const scrollTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[i] as HTMLElement | undefined;
    if (child) track.scrollTo({ left: child.offsetLeft - track.offsetLeft, behavior: "smooth" });
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const next = (index + delta + items.length) % items.length;
      setIndex(next);
      scrollTo(next);
    },
    [index, items.length, scrollTo],
  );

  useEffect(() => {
    if (!autoplay || paused || items.length < 2) return;
    const id = window.setInterval(() => go(1), 6000);
    return () => window.clearInterval(id);
  }, [autoplay, paused, items.length, go]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    const closest = children.reduce(
      (best, el, i) =>
        Math.abs(el.offsetLeft - track.offsetLeft - track.scrollLeft) < best.dist
          ? { dist: Math.abs(el.offsetLeft - track.offsetLeft - track.scrollLeft), i }
          : best,
      { dist: Number.POSITIVE_INFINITY, i: 0 },
    );
    setIndex(closest.i);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    dragging.current = { startX: e.clientX, startScroll: track.scrollLeft };
    setPaused(true);
    track.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track || !dragging.current) return;
    track.scrollLeft = dragging.current.startScroll - (e.clientX - dragging.current.startX);
  };
  const endDrag = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track || !dragging.current) return;
    dragging.current = null;
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    onScroll();
    scrollTo(index);
    setPaused(false);
  };

  if (items.length === 0) return null;

  return (
    <section
      className="border-y border-border/60 bg-secondary/30 py-16"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
            {description ? (
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous testimonial"
              className="grid size-11 place-items-center rounded-full border border-border bg-background transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next testimonial"
              className="grid size-11 place-items-center rounded-full border border-border bg-background transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="group"
          aria-roledescription="carousel"
          aria-label="Customer testimonials"
          className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ cursor: "grab", touchAction: "pan-y" }}
        >
          {items.map((t, i) => (
            <div
              key={t.id}
              className="w-[86%] shrink-0 snap-center select-none sm:w-[55%] lg:w-[38%]"
              aria-hidden={i !== index}
            >
              <Card t={t} active={i === index} />
            </div>
          ))}
        </div>

        {items.length > 1 ? (
          <div className="mt-2 flex justify-center gap-2">
            {items.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setIndex(i);
                  scrollTo(i);
                }}
                aria-label={`Go to testimonial ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  i === index ? "w-6 bg-primary" : "w-2 bg-border hover:bg-primary/40",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
