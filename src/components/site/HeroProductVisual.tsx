import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Eye, LineChart, Mail, Reply, Sparkles } from "lucide-react";

/**
 * Hero product visualization: two compact animated cards —
 * a combined performance card and an AI personalization card.
 * Purely presentational, demo values only.
 */

const METRICS = {
  sent: 10_117,
  openRate: 68.4,
  replies: 117,
  meetings: 24,
};

const CHART_POINTS = [18, 26, 22, 34, 30, 44, 41, 56, 52, 66, 62, 74];

const BODY =
  "Hi [First Name],\n\nI noticed [Company] is growing fast in [Industry].\n\nWant to see how we can help with [AI Personalization]?";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return reduced;
}

/** Eased 0 → 1 progress over `duration` ms. */
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

/** Counts up to `value` with an eased ramp, respecting reduced-motion. */
function useCountUp(value: number, duration = 900, decimals = 0) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const raw = value * eased;
      setDisplay(decimals > 0 ? Math.round(raw * 10 ** decimals) / 10 ** decimals : Math.round(raw));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration, decimals]);

  return decimals > 0 ? display.toFixed(decimals) : display.toLocaleString();
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
      setN((prev) => (prev >= text.length ? prev : prev + 2));
    }, 24);
    return () => window.clearInterval(id);
  }, [text, reduced]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

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

function PerformanceCard({ reduced }: { reduced: boolean }) {
  const t = useProgress(1600, reduced);
  const sent = useCountUp(METRICS.sent, 1400, 0);
  const openRate = useCountUp(METRICS.openRate, 1400, 1);
  const replies = useCountUp(METRICS.replies, 1400, 0);
  const meetings = useCountUp(METRICS.meetings, 1400, 0);

  const { path, area, length, points } = useMemo(() => {
    const w = 320;
    const h = 80;
    const max = Math.max(...CHART_POINTS) * 1.15;
    const pts = CHART_POINTS.map((v, i) => {
      const x = (i / (CHART_POINTS.length - 1)) * w;
      const y = h - (v / max) * h;
      return [x, y] as const;
    });
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { path: d, area: `${d} L${w},${h} L0,${h} Z`, length: 820, points: pts };
  }, []);

  return (
    <div className="relative rounded-3xl border border-border/70 bg-card/95 p-4 shadow-[0_22px_50px_-26px_color-mix(in_oklab,var(--primary)_45%,transparent)] backdrop-blur-[2px] sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 place-items-center rounded-xl bg-primary/12 text-primary">
            <LineChart className="size-4" />
          </span>
          Performance
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[0.65rem] font-medium text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
          Live
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
          <p className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            <Mail className="size-2.5 text-primary" />
            Emails Sent
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight sm:text-xl">{sent}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
          <p className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            <Eye className="size-2.5 text-primary" />
            Open Rate
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-gradient sm:text-xl">
            {openRate}%
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
          <p className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            <Reply className="size-2.5 text-primary" />
            Replies
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight sm:text-xl">{replies}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
          <p className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            <Calendar className="size-2.5 text-primary" />
            Meetings Booked
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight sm:text-xl">{meetings}</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border/60 bg-background/40 p-2.5">
        <svg viewBox="0 0 320 88" className="h-20 w-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#heroArea)" style={{ opacity: t }} />
          <path
            d={path}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - t)}
          />
          {[3, 6, 9, 11].map((idx, i) => {
            const [x, y] = points[idx] ?? [0, 0];
            const visible = t > (i + 1) / 5;
            return (
              <g key={idx} style={{ opacity: visible ? 1 : 0, transition: "opacity .4s ease-out" }}>
                <circle cx={x} cy={y} r="6" fill="var(--primary)" opacity="0.16">
                  <animate attributeName="r" values="4;9;4" dur="2.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
                </circle>
                <circle cx={x} cy={y} r="3" fill="var(--primary)" />
              </g>
            );
          })}
        </svg>
        <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
          <span>Sun</span>
        </div>
      </div>
    </div>
  );
}

function AIPersonalizationCard({ reduced }: { reduced: boolean }) {
  const { shown, done } = useTyped(BODY, reduced);

  return (
    <div className="relative z-10 -mt-4 ml-2 rounded-3xl border border-border/70 bg-card p-4 shadow-[0_26px_60px_-30px_color-mix(in_oklab,var(--primary)_50%,transparent)] sm:-mt-6 sm:ml-8 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 place-items-center rounded-xl bg-primary/12 text-primary">
            <Sparkles className="size-4" />
          </span>
          AI Personalization
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary">
          <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
          {done ? "Ready" : "Generating"}
        </span>
      </div>

      <div className="mt-3 rounded-2xl border border-border/60 bg-background/60 p-3">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Subject</p>
        <p className="text-[0.8rem] font-medium">Quick idea for [Company]</p>
        <p className="mt-2 min-h-[4.5rem] whitespace-pre-line text-[0.75rem] leading-relaxed text-muted-foreground">
          <TypedBody text={shown} />
          {!done && (
            <span className="ml-0.5 inline-block h-3 w-px translate-y-0.5 bg-primary motion-safe:animate-pulse" />
          )}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[0.65rem]">
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
  );
}

export function HeroProductVisual() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="relative w-full select-none" aria-hidden>
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(60%_55%_at_65%_15%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)]" />
      <PerformanceCard reduced={reduced} />
      <AIPersonalizationCard reduced={reduced} />
    </div>
  );
}
