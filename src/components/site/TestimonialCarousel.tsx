import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Quote, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { placeholderAvatar } from "@/lib/reviews";
import { listTestimonials, type Testimonial } from "@/lib/testimonials.functions";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function ReviewCard({ t }: { t: Testimonial }) {
  return (
    <figure className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] transition-colors duration-200 hover:border-primary/30">
      <div className="flex items-start gap-3">
        <img
          src={t.avatar_url || placeholderAvatar(`${t.id}-${t.name}`)}
          alt={`${t.name}, ${t.role} at ${t.company}`}
          className="size-12 shrink-0 rounded-full bg-secondary object-cover"
          loading="lazy"
          draggable={false}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t.name}</p>
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
            className={cn(
              "size-3.5",
              i < t.rating ? "fill-primary text-primary" : "text-border",
            )}
            aria-hidden="true"
          />
        ))}
      </div>

      <Quote className="mt-3 size-5 text-primary/50" aria-hidden="true" />
      <blockquote className="mt-2 text-sm leading-relaxed text-foreground/90">
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

/**
 * A vertical, drag-scrollable review column. The list is duplicated so the
 * gentle auto-scroll can wrap seamlessly; dragging pauses the motion.
 */
function ReviewColumn({
  items,
  speed,
  direction,
}: {
  items: Testimonial[];
  speed: number;
  direction: 1 | -1;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const drag = useRef<{ y: number; top: number } | null>(null);

  // Seamless wrap: keep scrollTop inside the first copy of the list.
  useEffect(() => {
    const el = ref.current;
    if (!el || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const half = el.scrollHeight / 2;
      let next = el.scrollTop + direction * speed * dt;
      if (next >= half) next -= half;
      if (next < 0) next += half;
      el.scrollTop = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, speed, direction]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { y: e.clientY, top: el.scrollTop };
    setPaused(true);
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const half = el.scrollHeight / 2;
    let next = drag.current.top - (e.clientY - drag.current.y);
    if (next >= half) next -= half;
    if (next < 0) next += half;
    el.scrollTop = next;
  };
  const endDrag = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = null;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    setPaused(false);
  };

  const loop = [...items, ...items];

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => !drag.current && setPaused(false)}
      className="flex max-h-[34rem] flex-col gap-5 overflow-y-auto overscroll-contain select-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ cursor: "grab", touchAction: "pan-x" }}
    >
      {loop.map((t, i) => (
        <ReviewCard key={`${t.id}-${i}`} t={t} />
      ))}
    </div>
  );
}

export function TestimonialCarousel({
  page,
  title = "What teams say about Sendloop",
  description,
}: {
  page: string;
  title?: string;
  description?: string;
  /** Kept for API compatibility with existing pages. */
  autoplay?: boolean;
}) {
  const fetchTestimonials = useServerFn(listTestimonials);
  const { data } = useQuery({
    queryKey: ["testimonials", page],
    queryFn: () => fetchTestimonials({ data: { page } }),
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(() => data ?? [], [data]);

  // Spread reviews across three columns that drift in alternating directions.
  const columns = useMemo(() => {
    const cols: Testimonial[][] = [[], [], []];
    items.forEach((t, i) => cols[i % 3]!.push(t));
    return cols.filter((c) => c.length > 0);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section className="border-y border-border/60 bg-secondary/30 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {description ?? "Drag any column up or down to read more stories."}
          </p>
        </div>

        <div className="relative mt-8">
          <div className="sm:hidden">
            <ReviewColumn items={items} speed={18} direction={1} />
          </div>
          <div className="hidden gap-5 sm:grid sm:grid-cols-3">
            {columns.map((col, i) => (
              <ReviewColumn
                key={i}
                items={col}
                speed={18 + i * 5}
                direction={i % 2 === 0 ? 1 : -1}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-secondary/60 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-secondary/60 to-transparent" />
        </div>
      </div>
    </section>
  );
}
