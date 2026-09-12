import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-docs-signal focus-visible:ring-offset-2 focus-visible:ring-offset-docs-paper";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts up once on mount. Static under reduced-motion. */
function useCountUp(target: number) {
  const [value, setValue] = useState(target);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (prefersReducedMotion()) return;
    setValue(0);
    const duration = 1100;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

export function DocsPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-docs-paper font-doc text-docs-slate">{children}</div>
  );
}

const ledger = [
  { label: "queued", value: 1248 },
  { label: "delivered", value: 991 },
  { label: "replied", value: 74 },
];

function LedgerRow({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <div className="flex items-baseline justify-between border-b border-white/10 py-2.5">
      <span className="font-docmono text-[0.72rem] text-white/55">{label}</span>
      <span className="font-docmono text-sm tabular-nums text-white/90">
        {shown.toLocaleString()}
      </span>
    </div>
  );
}

export function DocsHero() {
  return (
    <section className="border-b border-docs-rule bg-docs-paper">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-12 sm:px-6 sm:pt-16 sm:pb-20">
        <div className="rounded-md bg-docs-ink px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-7">
              <dl className="space-y-1 border-b border-white/12 pb-5 font-docmono text-[0.72rem] text-white/50">
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0">From:</dt>
                  <dd className="text-white/75">docs@munchreach.com</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0">Subject:</dt>
                  <dd className="text-white/75">Documentation</dd>
                </div>
              </dl>

              <h1 className="mt-7 font-display text-[2.1rem] leading-[1.05] font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.4rem]">
                Everything you need to
                <span className="block text-docs-signal">set up and scale</span>
              </h1>

              <p className="mt-6 max-w-xl text-[0.98rem] leading-relaxed text-white/65">
                Practical guides for every part of MunchReach, from your first mailbox
                connection to multi-workspace agency reporting.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
                <Link
                  to="/auth"
                  className={`inline-flex items-center rounded-full bg-docs-signal px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-docs-ink ${focusRing} focus-visible:ring-offset-docs-ink`}
                >
                  Start for Free
                </Link>
                <a
                  href="#browse"
                  className={`font-docmono text-sm text-white/70 underline-offset-4 hover:text-white hover:underline ${focusRing} focus-visible:ring-offset-docs-ink`}
                >
                  Browse the docs →
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 lg:border-l lg:border-white/12 lg:pl-14">
              <p className="font-docmono text-[0.72rem] text-white/45">ledger</p>
              <div className="mt-4 border-t border-white/10">
                {ledger.map((row) => (
                  <LedgerRow key={row.label} {...row} />
                ))}
              </div>
              <div className="mt-6">
                <div className="h-1.5 w-full overflow-hidden bg-white/10">
                  <div className="docs-fill h-full w-[79%] bg-docs-signal" />
                </div>
                <p className="mt-3 font-docmono text-[0.72rem] text-white/45">
                  79% delivered this cycle
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DocsSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-b border-docs-rule">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {title ? (
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em] text-docs-ink sm:text-[2rem]">
              {title}
            </h2>
            {description ? (
              <p className="mt-3 text-[0.95rem] leading-relaxed text-docs-slate">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={title ? "mt-10" : undefined}>{children}</div>
      </div>
    </section>
  );
}

export function DocsSteps({
  steps,
}: {
  steps: { title: string; text: string }[];
}) {
  return (
    <ol className="border-l border-docs-rule">
      {steps.map((step, i) => (
        <li key={step.title} className="relative pb-8 pl-6 last:pb-0 sm:pl-8">
          <span className="absolute top-1 -left-px h-6 w-px bg-docs-ink" aria-hidden />
          <span className="font-docmono text-[0.72rem] text-docs-signal">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-1.5 font-display text-lg font-semibold tracking-[-0.01em] text-docs-ink">
            {step.title}
          </h3>
          <p className="mt-1.5 max-w-xl text-[0.93rem] leading-relaxed text-docs-slate">
            {step.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function DocsGroups({
  groups,
}: {
  groups: { title: string; items: string[] }[];
}) {
  return (
    <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="font-docmono text-[0.78rem] text-docs-ink">{group.title}</h3>
          <ul className="mt-3 border-t border-docs-rule">
            {group.items.map((item) => (
              <li
                key={item}
                className="border-b border-docs-rule py-2.5 text-[0.9rem] leading-snug text-docs-slate"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsMailboxPanel({
  rows,
}: {
  rows: { address: string; provider: string; detail: string; status: "Healthy" | "Warming" }[];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-docs-rule bg-white">
      <div className="border-b border-docs-rule bg-docs-paper px-4 py-2.5 font-docmono text-[0.72rem] text-docs-slate">
        workspace.munchreach.app/mailboxes
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.address}
            className="grid grid-cols-1 gap-1 border-b border-docs-rule px-4 py-3.5 last:border-b-0 sm:grid-cols-12 sm:items-center sm:gap-4"
          >
            <span className="font-docmono text-[0.85rem] text-docs-ink sm:col-span-5">
              {row.address}
            </span>
            <span className="font-docmono text-[0.75rem] text-docs-slate sm:col-span-3">
              {row.provider}
            </span>
            <span className="font-docmono text-[0.75rem] text-docs-slate sm:col-span-2">
              {row.detail}
            </span>
            <span
              className={`font-docmono text-[0.75rem] sm:col-span-2 sm:text-right ${
                row.status === "Healthy" ? "text-docs-delivered" : "text-docs-warming"
              }`}
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocsArticleThread({ articles }: { articles: string[] }) {
  return (
    <ol className="border-t border-docs-rule">
      {articles.map((article, i) => (
        <li key={article} className="border-b border-docs-rule">
          <Link
            to="/help-center"
            className={`group flex items-baseline gap-4 py-4 transition-colors hover:bg-white sm:gap-6 ${focusRing}`}
          >
            <span className="font-docmono text-[0.72rem] text-docs-signal">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-[0.97rem] text-docs-ink">{article}</span>
            <span
              aria-hidden
              className="font-docmono text-sm text-docs-slate opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              →
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function DocsFaq({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <Accordion type="single" collapsible className="border-t border-docs-rule">
      {faqs.map((faq) => (
        <AccordionItem key={faq.q} value={faq.q} className="border-b border-docs-rule">
          <AccordionTrigger
            className={`py-4 text-left font-display text-[1.02rem] font-medium tracking-[-0.01em] text-docs-ink hover:no-underline ${focusRing}`}
          >
            {faq.q}
          </AccordionTrigger>
          <AccordionContent className="max-w-2xl pb-5 text-[0.93rem] leading-relaxed text-docs-slate">
            {faq.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function DocsCta({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="bg-docs-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em] text-white sm:text-[2rem]">
            {title}
          </h2>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-white/65">{description}</p>
        </div>
        <Link
          to="/auth"
          className={`inline-flex w-fit items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-docs-ink transition-colors hover:bg-docs-signal hover:text-white ${focusRing} focus-visible:ring-offset-docs-ink`}
        >
          Start for Free
        </Link>
      </div>
    </section>
  );
}
