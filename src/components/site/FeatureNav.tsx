import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type FeatureNavItem = { id: string; label: string };

/**
 * Sticky in-page navigation for the Features page.
 *
 * Scroll spy uses IntersectionObserver so the active pill always matches the
 * section in view, and clicks scroll smoothly without changing the URL history.
 */
export function FeatureNav({ items }: { items: FeatureNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.2, 0.5] },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  return (
    <div className="sticky top-[4.75rem] z-30 border-y border-border/60 bg-background/85 backdrop-blur-xl">
      <nav
        aria-label="Feature sections"
        className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(item.id)}
            aria-current={active === item.id ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
              active === item.id
                ? "border-primary/40 bg-primary/12 text-primary"
                : "border-border/70 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
