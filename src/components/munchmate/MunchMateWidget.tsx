import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

import { getMunchmateStatus } from "@/lib/munchmate.functions";
import { MunchMateMascot } from "./MunchMateMascot";

const MunchMateChat = lazy(() => import("./MunchMateChat"));

/** Floating launcher. The chat panel is lazy-loaded on first open. */
export function MunchMateWidget() {
  const { pathname } = useLocation();
  const status = useQuery({
    queryKey: ["munchmate-status"],
    queryFn: () => getMunchmateStatus(),
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [happy, setHappy] = useState(false);

  if (!status.data?.enabled || pathname.startsWith("/mranuskhalid")) return null;

  const launch = () => {
    setHappy(true);
    setLoaded(true);
    window.setTimeout(() => {
      setOpen(true);
      setHappy(false);
    }, 380);
  };

  return (
    <>
      {loaded ? (
        <Suspense fallback={null}>
          <MunchMateChat open={open} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
      {!open ? (
        <button
          type="button"
          onClick={launch}
          onPointerEnter={() => setLoaded(true)}
          aria-label="Open MunchMate, your MunchReach AI assistant"
          className="group fixed bottom-4 right-4 z-[60] flex items-end gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6 sm:right-6"
        >
          <span className="mb-3 hidden rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm transition-opacity group-hover:opacity-100 sm:block sm:opacity-0">
            Ask MunchMate
          </span>
          <span className={`munchmate-float block drop-shadow-lg ${happy ? "munchmate-pop" : ""}`}>
            <span className="hidden sm:block">
              <MunchMateMascot size={68} happy={happy} />
            </span>
            <span className="sm:hidden">
              <MunchMateMascot size={48} happy={happy} />
            </span>
          </span>
        </button>
      ) : null}
    </>
  );
}
