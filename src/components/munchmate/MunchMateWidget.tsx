import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { getMunchmateStatus } from "@/lib/munchmate.functions";
import { MunchMateMascot } from "./MunchMateMascot";

const MunchMateChat = lazy(() => import("./MunchMateChat"));

const SESSION_KEY = "munchmate.greeted.session";
const LAST_KEY = "munchmate.greeted.at";
const GREET_GAP_MS = 12 * 60 * 60 * 1000; // at most once every 12h, once per visit
const GREET_DELAY_MS = 2500;

function shouldGreet(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return false;
    const last = Number(window.localStorage.getItem(LAST_KEY) ?? 0);
    return !last || Date.now() - last > GREET_GAP_MS;
  } catch {
    return false;
  }
}
function markGreeted() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
    window.localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

/** Floating launcher + one-per-visit greeting. The chat panel is lazy-loaded. */
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
  const [greeting, setGreeting] = useState(false);
  const enabled = Boolean(status.data?.enabled) && !pathname.startsWith("/mranuskhalid");

  useEffect(() => {
    if (!enabled || !shouldGreet()) return;
    const t = window.setTimeout(() => {
      markGreeted();
      setGreeting(true);
    }, GREET_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [enabled]);

  if (!enabled) return null;

  const launch = () => {
    setGreeting(false);
    setHappy(true);
    setLoaded(true);
    window.setTimeout(() => {
      setOpen(true);
      setHappy(false);
    }, 420);
  };

  return (
    <>
      {loaded ? (
        <Suspense fallback={null}>
          <MunchMateChat open={open} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
      {!open ? (
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
          {greeting ? (
            <div
              role="status"
              className="munchmate-bubble relative w-[min(300px,calc(100vw-2rem))] rounded-2xl rounded-br-md border border-border bg-card p-4 pr-8 text-sm text-card-foreground shadow-xl"
            >
              <button
                type="button"
                onClick={() => setGreeting(false)}
                aria-label="Dismiss greeting"
                className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
              <p className="font-semibold text-foreground">Hey! I'm MunchMate 👋</p>
              <p className="text-xs text-muted-foreground">Your little MunchReach sidekick.</p>
              <p className="mt-2 leading-relaxed text-foreground/90">
                Need help finding something, setting up a campaign, or figuring out how a feature works? I've got you!
              </p>
              <p className="mt-1 font-medium text-foreground">What's on your mind?</p>
              <button
                type="button"
                onClick={launch}
                onPointerEnter={() => setLoaded(true)}
                className="mt-3 inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
              >
                Let's chat
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={launch}
            onPointerEnter={() => setLoaded(true)}
            aria-label="Open MunchMate, your MunchReach sidekick"
            className="group flex items-end gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {!greeting ? (
              <span className="mb-3 hidden rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm transition-opacity group-hover:opacity-100 sm:block sm:opacity-0">
                Ask MunchMate
              </span>
            ) : null}
            <span className={`munchmate-float block drop-shadow-xl ${happy ? "munchmate-pop" : ""}`}>
              <span className="hidden sm:block">
                <MunchMateMascot size={72} mood={happy ? "happy" : undefined} lively wave={greeting} />
              </span>
              <span className="sm:hidden">
                <MunchMateMascot size={52} mood={happy ? "happy" : undefined} lively wave={greeting} />
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}
