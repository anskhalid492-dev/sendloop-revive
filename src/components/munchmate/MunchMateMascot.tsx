import { useEffect, useId, useRef, useState } from "react";

export type MascotMood = "idle" | "happy" | "curious" | "surprised" | "cheeky" | "thinking";

/**
 * MunchMate — a soft, rounded cartoon sidekick (pure SVG + CSS, no assets).
 * Eyes follow the cursor, it blinks, smiles when the cursor is near and,
 * when `lively`, occasionally pulls a curious / surprised / cheeky face or waves.
 */
export function MunchMateMascot({
  size = 64,
  mood,
  lively = false,
  wave = false,
}: {
  size?: number;
  mood?: MascotMood | undefined;
  lively?: boolean;
  wave?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [near, setNear] = useState(false);
  const [idleMood, setIdleMood] = useState<MascotMood>("idle");
  const [waving, setWaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy);
        setNear(dist < 220);
        if (dist > 600) return setLook({ x: 0, y: 0 });
        const k = Math.min(dist / 160, 1);
        setLook({ x: (dx / (dist || 1)) * 2.4 * k, y: (dy / (dist || 1)) * 2 * k });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  // Occasional, subtle personality moments.
  useEffect(() => {
    if (!lively || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t: number;
    const tick = () => {
      t = window.setTimeout(() => {
        const r = Math.random();
        if (r < 0.3) {
          setWaving(true);
          window.setTimeout(() => setWaving(false), 1400);
        } else {
          setIdleMood(r < 0.55 ? "curious" : r < 0.75 ? "cheeky" : "surprised");
          window.setTimeout(() => setIdleMood("idle"), 1600);
        }
        tick();
      }, 7000 + Math.random() * 9000);
    };
    tick();
    return () => window.clearTimeout(t);
  }, [lively]);

  const m: MascotMood = mood ?? (idleMood !== "idle" ? idleMood : near ? "happy" : "idle");
  const showWave = wave || waving;
  const tilt = look.x * 1.2 + (m === "curious" || m === "thinking" ? -7 : 0);

  const mouth =
    m === "happy"
      ? "M24 41 q8 8 16 0 q-8 3 -16 0z"
      : m === "surprised"
        ? ""
        : m === "cheeky"
          ? "M25 41 q8 5 15 -2"
          : m === "thinking"
            ? "M27 42 q5 1 10 -1"
            : m === "curious"
              ? "M27 42 q5 2.5 10 0"
              : "M25 40.5 q7 5.5 14 0";

  const browL = m === "surprised" ? "M19 21 q4 -3.5 8 -1" : m === "curious" || m === "thinking" ? "M19 22 q4 -3 8 -0.5" : "M19 23.5 q4 -2.5 8 0";
  const browR = m === "surprised" ? "M37 20 q4 -2 8 1" : m === "curious" || m === "thinking" ? "M37 20 q4 -2.5 8 0.5" : m === "cheeky" ? "M37 24 q4 -1 8 1" : "M37 23.5 q4 -2.5 8 0";

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`f${uid}`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="var(--mascot-skin-light)" />
          <stop offset="0.65" stopColor="var(--mascot-skin)" />
          <stop offset="1" stopColor="var(--mascot-skin-shade)" />
        </radialGradient>
        <linearGradient id={`h${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--mascot-glow)" />
          <stop offset="1" stopColor="var(--mascot-body)" />
        </linearGradient>
      </defs>
      <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: "32px 40px", transition: "transform 0.35s cubic-bezier(.3,1.4,.5,1)" }}>
        {/* ground shadow */}
        <ellipse cx="32" cy="62" rx="15" ry="2" fill="var(--mascot-ink)" opacity="0.12" />
        {/* ears */}
        <circle cx="9" cy="35" r="5" fill={`url(#f${uid})`} />
        <circle cx="55" cy="35" r="5" fill={`url(#f${uid})`} />
        {/* head */}
        <ellipse cx="32" cy="34" rx="23" ry="24" fill={`url(#f${uid})`} />
        {/* hair: soft swoosh + cowlick */}
        <path d="M10 30 C9 14 22 7 33 8 C45 8 55 15 54 29 C49 21 42 17 34 19 C30 15 22 15 17 20 C14 23 12 26 10 30Z" fill={`url(#h${uid})`} />
        <path d="M31 9 C30 4 35 1 39 3 C35 4 34 6 34 9Z" fill="var(--mascot-body)" />
        <ellipse cx="22" cy="14" rx="5" ry="2" fill="var(--mascot-skin-light)" opacity="0.45" transform="rotate(-20 22 14)" />
        {/* brows */}
        <path d={browL} stroke="var(--mascot-ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" style={{ transition: "d 0.25s" }} />
        <path d={browR} stroke="var(--mascot-ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" style={{ transition: "d 0.25s" }} />
        {/* eyes */}
        {m === "happy" ? (
          <>
            <path d="M19 31 q4 -5 8 0" stroke="var(--mascot-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M37 31 q4 -5 8 0" stroke="var(--mascot-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="munchmate-eyes">
            {[23, 41].map((cx, i) => {
              const wink = m === "cheeky" && i === 0;
              const ry = m === "surprised" ? 5.6 : 5;
              return wink ? (
                <path key={cx} d={`M${cx - 4} 31 q4 -3 8 0`} stroke="var(--mascot-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              ) : (
                <g key={cx}>
                  <ellipse cx={cx} cy="30.5" rx="4.4" ry={ry} fill="var(--mascot-white)" />
                  <g style={{ transform: `translate(${look.x}px, ${look.y + (m === "thinking" ? -1.6 : 0)}px)`, transition: "transform 0.12s ease-out" }}>
                    <circle cx={cx} cy="31" r={m === "surprised" ? 2.4 : 2.9} fill="var(--mascot-ink)" />
                    <circle cx={cx + 1.1} cy="29.7" r="1" fill="var(--mascot-white)" />
                  </g>
                </g>
              );
            })}
          </g>
        )}
        {/* nose */}
        <ellipse cx="32" cy="36.5" rx="1.8" ry="1.2" fill="var(--mascot-skin-shade)" />
        {/* mouth */}
        {m === "surprised" ? (
          <ellipse cx="32" cy="43" rx="2.6" ry="3" fill="var(--mascot-ink)" />
        ) : m === "happy" ? (
          <path d={mouth} fill="var(--mascot-ink)" stroke="var(--mascot-ink)" strokeWidth="1.4" strokeLinejoin="round" />
        ) : (
          <path d={mouth} stroke="var(--mascot-ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
        )}
        {/* cheeks */}
        <ellipse cx="16" cy="38" rx="3.4" ry="2.2" fill="var(--mascot-cheek)" opacity={m === "happy" || m === "cheeky" ? 0.75 : 0.45} />
        <ellipse cx="48" cy="38" rx="3.4" ry="2.2" fill="var(--mascot-cheek)" opacity={m === "happy" || m === "cheeky" ? 0.75 : 0.45} />
        {/* waving hand */}
        {showWave ? (
          <g className="munchmate-wave" style={{ transformOrigin: "56px 54px" }}>
            <circle cx="58" cy="48" r="5" fill={`url(#f${uid})`} />
            <rect x="55" y="40" width="2.4" height="6" rx="1.2" fill="var(--mascot-skin)" />
            <rect x="58" y="39.5" width="2.4" height="6.5" rx="1.2" fill="var(--mascot-skin)" />
            <rect x="61" y="41" width="2.2" height="5.5" rx="1.1" fill="var(--mascot-skin)" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
