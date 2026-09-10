import { useEffect, useState } from "react";
import { BadgeCheck, Building2, CheckCircle2, Send, Sparkles } from "lucide-react";

/**
 * Hero product visualization: floating slices of the real MunchReach UI that
 * tell the outbound story — verified leads → campaign → AI personalization →
 * reply. Purely presentational, demo data only.
 */

const LEADS = [
  { name: "Bright Smile Dental", email: "hello@brightsmile.com" },
  { name: "Modern Skin Co.", email: "hello@modernskin.com" },
  { name: "Northstar Roofing", email: "hello@northstarroofing.com" },
];

const BODY =
  "Hi Sarah,\n\nI came across Bright Smile Dental while researching dental practices in Austin.\n\nI noticed you offer cosmetic and general dentistry, and I had a quick idea that could help...";

/** Reveal steps one after another, respecting reduced-motion. */
function useSequence(count: number, delay = 450) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(count);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= count) window.clearInterval(id);
    }, delay);
    return () => window.clearInterval(id);
  }, [count, delay]);
  return step;
}

function useTyped(text: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    const id = window.setInterval(() => {
      setN((prev) => {
        if (prev >= text.length) {
          window.clearInterval(id);
          return prev;
        }
        return prev + 2;
      });
    }, 18);
    return () => window.clearInterval(id);
  }, [text]);
  return text.slice(0, n);
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{children}</span>
  );
}

export function HeroProductVisual() {
  const verified = useSequence(LEADS.length, 420);
  const typed = useTyped(BODY);
  const replyIn = useSequence(1, 2600) === 1;

  return (
    <div className="relative w-full select-none" aria-hidden>
      {/* soft depth behind the stack */}
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(60%_50%_at_60%_20%,hsl(var(--primary)/0.14),transparent_70%)]" />

      <div className="relative space-y-4">
        {/* CARD 1 — Verified leads */}
        <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.45)] backdrop-blur-[2px] sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BadgeCheck className="size-4 text-primary" />
              Verified Leads
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-medium text-emerald-600">
              Lead verified
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {LEADS.map((lead, i) => (
              <li
                key={lead.email}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.82rem] font-medium">{lead.name}</span>
                  <span className="block truncate text-[0.72rem] text-muted-foreground">{lead.email}</span>
                </span>
                <CheckCircle2
                  className={`size-4 shrink-0 text-emerald-500 transition-all duration-500 ${
                    i < verified ? "scale-100 opacity-100" : "scale-75 opacity-0"
                  }`}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* connector */}
        <div className="mx-auto h-5 w-px bg-gradient-to-b from-primary/40 to-primary/5" />

        {/* CARD 2 — Campaign */}
        <div className="ml-0 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-[0_14px_34px_-24px_hsl(var(--primary)/0.4)] sm:ml-8 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Send className="size-4 text-primary" />
              Campaign
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-medium text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              Active
            </span>
          </div>
          <p className="mt-2 text-[0.82rem] font-medium">US Dental Outreach</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["Email 1", "Follow-up 1", "Follow-up 2"].map((step, i) => (
              <div key={step} className="rounded-lg border border-border/60 bg-background/60 px-2 py-1.5">
                <span className="block truncate text-[0.68rem] text-muted-foreground">{step}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-primary/10">
                  <span
                    className="block h-full rounded-full bg-primary/70 transition-[width] duration-1000"
                    style={{ width: `${[92, 58, 24][i]}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* connector */}
        <div className="mx-auto h-5 w-px bg-gradient-to-b from-primary/40 to-primary/5" />

        {/* CARD 3 — AI personalization */}
        <div className="relative rounded-2xl border border-border/70 bg-card/95 p-4 shadow-[0_22px_50px_-26px_hsl(var(--primary)/0.5)] sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-6 place-items-center rounded-lg bg-primary/12 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              AI-Personalized Email
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[0.68rem] font-medium text-primary">
              AI
            </span>
          </div>
          <p className="mt-3 text-[0.72rem] text-muted-foreground">Subject</p>
          <p className="text-[0.82rem] font-medium">Quick idea for Bright Smile</p>
          <p className="mt-3 whitespace-pre-line text-[0.78rem] leading-relaxed text-muted-foreground">
            {typed}
            <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-primary motion-safe:animate-pulse" />
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[0.68rem]">
            <Tag>[Company]</Tag>
            <Tag>[Industry]</Tag>
            <Tag>[Location]</Tag>
          </div>
        </div>
      </div>

      {/* CARD 4 — New reply */}
      <div
        className={`pointer-events-none absolute -bottom-4 right-0 w-[15rem] max-w-[85%] rounded-xl border border-border/70 bg-card p-3 shadow-[0_20px_44px_-22px_hsl(var(--primary)/0.55)] transition-all duration-700 sm:-right-4 ${
          replyIn ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-[0.7rem] font-semibold text-emerald-600">
            SR
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              New reply
            </span>
            <span className="block truncate text-[0.74rem] text-muted-foreground">
              “Yes, let's discuss this.”
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
