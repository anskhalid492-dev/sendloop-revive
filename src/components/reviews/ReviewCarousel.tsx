import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import type { Testimonial } from "@/lib/testimonials.functions";

/**
 * Scroll-snap carousel with pointer dragging, keyboard control and swipe
 * support. Native scrolling keeps the touch behaviour smooth on mobile.
 */
export function ReviewCarousel({ reviews }: { reviews: Testimonial[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const drag = useRef<{ startX: number; startScroll: number; active: boolean }>({
    startX: 0,
    startScroll: 0,
    active: false,
  });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync, reviews.length]);

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  }, []);

  if (reviews.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="region"
        aria-label="Customer reviews carousel"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            scrollBy(1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            scrollBy(-1);
          }
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") return; // native touch scrolling is smoother
          const el = trackRef.current;
          if (!el) return;
          drag.current = { startX: e.clientX, startScroll: el.scrollLeft, active: true };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const el = trackRef.current;
          if (!el || !drag.current.active) return;
          el.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
        }}
        onPointerUp={(e) => {
          drag.current.active = false;
          trackRef.current?.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current.active = false;
        }}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((review) => (
          <div
            key={review.id}
            className="w-[85vw] max-w-md shrink-0 snap-start select-none sm:w-[420px]"
          >
            <ReviewCard review={review} />
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Previous reviews"
          disabled={!canPrev}
          onClick={() => scrollBy(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Next reviews"
          disabled={!canNext}
          onClick={() => scrollBy(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
