import { useEffect, useRef, useState } from "react";

/**
 * MunchMate — original robot mascot. Pure SVG + CSS, no image assets.
 * Eyes track the cursor when it is nearby; `happy` widens the smile.
 */
export function MunchMateMascot({ size = 64, happy = false }: { size?: number; happy?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

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
        if (dist > 420) return setLook({ x: 0, y: 0 });
        const k = Math.min(dist / 140, 1);
        setLook({ x: (dx / (dist || 1)) * 3.2 * k, y: (dy / (dist || 1)) * 2.6 * k });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const tilt = look.x * 1.4;
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ transform: `rotate(${tilt}deg)`, transition: "transform 0.25s ease-out" }}
    >
      <defs>
        <linearGradient id="mm-head" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--mascot-glow)" />
          <stop offset="1" stopColor="var(--mascot-body)" />
        </linearGradient>
      </defs>
      {/* antenna */}
      <line x1="32" y1="10" x2="32" y2="4" stroke="var(--mascot-body)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="4" r="3" fill="var(--mascot-glow)">
        <animate attributeName="opacity" values="1;0.5;1" dur="2.4s" repeatCount="indefinite" />
      </circle>
      {/* ears */}
      <rect x="4" y="26" width="6" height="14" rx="3" fill="var(--mascot-body)" />
      <rect x="54" y="26" width="6" height="14" rx="3" fill="var(--mascot-body)" />
      {/* head */}
      <rect x="8" y="10" width="48" height="44" rx="16" fill="url(#mm-head)" />
      {/* visor */}
      <rect x="14" y="19" width="36" height="26" rx="11" fill="var(--mascot-visor)" />
      {/* eyes */}
      <g className="munchmate-eyes" style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: "transform 0.12s ease-out" }}>
        {happy ? (
          <>
            <path d="M21 31 q3 -4 6 0" stroke="var(--mascot-glow)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M37 31 q3 -4 6 0" stroke="var(--mascot-glow)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="24" cy="30" rx="3.4" ry="4" fill="var(--mascot-glow)" />
            <ellipse cx="40" cy="30" rx="3.4" ry="4" fill="var(--mascot-glow)" />
            <circle cx="25.2" cy="28.6" r="1" fill="var(--primary-foreground)" />
            <circle cx="41.2" cy="28.6" r="1" fill="var(--primary-foreground)" />
          </>
        )}
      </g>
      {/* smile */}
      <path
        d={happy ? "M23 37 q9 8 18 0" : "M25 38 q7 4.5 14 0"}
        stroke="var(--mascot-glow)"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        style={{ transition: "d 0.2s" }}
      />
      {/* cheeks */}
      <circle cx="18" cy="40" r="2" fill="var(--mascot-glow)" opacity="0.35" />
      <circle cx="46" cy="40" r="2" fill="var(--mascot-glow)" opacity="0.35" />
    </svg>
  );
}
