import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, LineChart, Sparkles } from "lucide-react";

/**
 * Hero product visualization: two animated slices of the MunchReach UI —
 * a combined performance card and an AI personalization card.
 * Purely presentational, demo values only.
 */

const OPEN_RATE = 68.4;
const MEETINGS = 24;

const CHART_POINTS = [18, 26, 22, 34, 30, 44, 41, 56, 52, 66, 62, 74];

const MEETING_EVENTS = [3, 6, 9, 11];

const BODY =
  "Hi [First Name],\n\nI came across [Company] while researching the [Industry] space, and noticed how much of your growth still comes from referrals.\n\nWe help teams like yours turn cold outreach into real conversations — want a quick look?";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return reduced;
}

/** Eased 0 → 1 progress over `duration` ms, restarting on mount. */
function useProgress(duration: number, reduced: boolean) {
  const [t, setT] = useState(reduced ? 1 : 0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [duration, reduced]);
  return t;
}

function useTyped(text: string, reduced: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((prev) => {
        if (prev >= text.length) return prev;
        return prev + 2;
      });
    }, 22);
    return () => window.clearInterval(id);
  }, [text, reduced]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

/** Renders the email body with dynamic fields highlighted as chips. */
function TypedBody({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\]?)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[") ? (
          <span
            key={i}
            className="rounded-md bg-primary/10 px-1 py-0.5 font-medium text-primary motion-safe:animate-pulse"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function HeroProductVisual() {
  const reduced = usePrefersReducedMotion();
  const t = useProgress(1800, reduced);
  const { shown, done } = useTyped(BODY, reduced);

  const openRate = (OPEN_RATE * t).toFixed(1);
  const meetings = Math.round(MEETINGS * t);

  const { path, area, length } = useMemo(() => {
    const w = 320;
    const h = 96;
    const max = Math.max(...CHART_POINTS) * 1.15;
    const pts = CHART_POINTS.map((v, i) => {
      const x = (i / (CHART_POINTS.length - 1)) * w;
      const y = h - (v / max) * h;
      return [x, y] as const;
    });
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return {
      path: d,
      area: `${d} L${w},${h} L0,${h} Z`,
      length: 900,
      points: pts,
    };
  }, []);

  const chartPoints = useMemo(() => {
    const w = 320;
    const h = 96;
    const max = Math.max(...CHART_POINTS) * 1.15;
    return CHART_POINTS.map((v, i) => [
      (i / (CHART_POINTS.length - 1)) * w,
      h - (v / max) * h,
    ]) as [number, number][];
  }, []);

  return (
    <div className="relative w-full select-none" aria-hidden>
      <div className="pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-[radial-gradient(60%_55%_at_65%_15%,hsl(var(--primary)/0.16),transparent_70%)]" />

      {/* CARD 1 — Combined performance */}
      <div className="relative rounded-3xl border border-border/70 bg-card/95 p-5 shadow-[0_26px_60px_-30px_hsl(var(--primary)/0.55)] backdrop-blur-[2px] sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-xl bg-primary/12 text-primary">
              <LineChart className="size-4" />
            </span>
            Performance
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-600">
            <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            Live
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">Open Rate</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-gradient">
              {openRate}%
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              <CalendarCheck className="size-3.5" />
              Meetings Booked
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">{meetings}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-3">
          <svg viewBox="0 0 320 104" className="h-24 w-full overflow-visible" preserveAspectRatio="none">
            <defs>
              <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#heroArea)" style={{ opacity: t }} />
            <path
              d={path}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={length}
              strokeDashoffset={length * (1 - t)}
            />
            {MEETING_EVENTS.map((idx, i) => {
              const [x, y] = chartPoints[idx] ?? [0, 0];
              const visible = t > (i + 1) / (MEETING_EVENTS.length + 1);
              return (
                <g key={idx} style={{ opacity: visible ? 1 : 0, transition: "opacity .5s ease-out" }}>
                  <circle cx={x} cy={y} r="7" fill="hsl(var(--primary))" opacity="0.16">
                    <animate
                      attributeName="r"
                      values="5;10;5"
                      dur="2.4s"
                      begin={`${i * 0.4}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle cx={x} cy={y} r="3.5" fill="hsl(var(--primary))" />
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex justify-between text-[0.62rem] text-muted-foreground">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
            <span>Sun</span>
          </div>
        </div>
      </div>

      {/* CARD 2 — AI personalization (overlapping for depth) */}
      <div className="relative z-10 -mt-4 ml-0 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_30px_70px_-30px_hsl(var(--primary)/0.6)] sm:-mt-6 sm:ml-10 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-xl bg-primary/12 text-primary">
              <Sparkles className="size-4" />
            </span>
            AI Personalization
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.68rem] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
            {done ? "Ready" : "Generating"}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-border/60 bg-background/60 p-3.5">
          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Subject</p>
          <p className="text-[0.85rem] font-medium">Quick idea for [Company]</p>
          <p className="mt-3 min-h-[7.5rem] whitespace-pre-line text-[0.8rem] leading-relaxed text-muted-foreground">
            <TypedBody text={shown} />
            {!done && (
              <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-primary motion-safe:animate-pulse" />
            )}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[0.68rem]">
          {["[First Name]", "[Company]", "[Industry]", "[AI Personalization]"].map((field) => (
            <span
              key={field}
              className="rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
            >
              {field}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
