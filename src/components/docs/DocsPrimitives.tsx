import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
  return <div className="bg-background text-foreground">{children}</div>;
}

const ledger = [
  { label: "Queued", value: 1248 },
  { label: "Delivered", value: 991 },
  { label: "Replied", value: 74 },
];

function LedgerRow({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {shown.toLocaleString()}
      </span>
    </div>
  );
}

export function DocsHero() {
  return (
    <section className="hero-glow relative overflow-hidden border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-14">
          <div className="lg:col-span-7">
            <dl className="max-w-md space-y-1.5 border-b border-border pb-5 text-sm">
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground">From</dt>
                <dd className="font-medium text-foreground">docs@munchreach.com</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground">Subject</dt>
                <dd className="font-medium text-foreground">Documentation</dd>
              </div>
            </dl>

            <h1 className="mt-7 text-3xl leading-[1.1] font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Everything you need to
              <span className="block text-primary">set up and scale</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Practical guides for every part of MunchReach, from your first mailbox
              connection to multi-workspace agency reporting.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link to="/auth">Start for Free</Link>
              </Button>
              <a
                href="#browse"
                className={`inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline ${focusRing}`}
              >
                Browse the docs
                <span aria-hidden>→</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">
                Sending ledger
              </p>
              <div className="mt-4 border-t border-border">
                {ledger.map((row) => (
                  <LedgerRow key={row.label} {...row} />
                ))}
              </div>
              <div className="mt-6">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="docs-fill h-full w-[79%] rounded-full bg-primary" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
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
  muted,
  children,
}: {
  id?: string;
  title?: string;
  description?: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`border-b border-border/60 ${muted ? "bg-secondary/40" : ""}`}
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {title ? (
          <div className="max-w-2xl">
            <h2 className="text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
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
    <ol className="border-l border-border">
      {steps.map((step, i) => (
        <li key={step.title} className="pb-8 pl-6 last:pb-0 sm:pl-8">
          <span className="text-xs font-semibold text-primary">
            Step {i + 1}
          </span>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
            {step.title}
          </h3>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
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
          <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
          <ul className="mt-3 border-t border-border">
            {group.items.map((item) => (
              <li
                key={item}
                className="border-b border-border py-2.5 text-sm leading-snug text-muted-foreground"
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
  rows: {
    address: string;
    provider: string;
    detail: string;
    status: "Healthy" | "Warming";
  }[];
}) {
  return (
    <div className="max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border bg-secondary/60 px-4 py-2.5 text-xs text-muted-foreground">
        workspace.munchreach.app/mailboxes
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.address}
            className="grid grid-cols-1 gap-1 border-b border-border px-4 py-3.5 last:border-b-0 sm:grid-cols-12 sm:items-center sm:gap-4"
          >
            <span className="text-sm font-medium text-foreground sm:col-span-5">
              {row.address}
            </span>
            <span className="text-xs text-muted-foreground sm:col-span-3">
              {row.provider}
            </span>
            <span className="text-xs text-muted-foreground sm:col-span-3">
              {row.detail}
            </span>
            <span className="sm:col-span-2 sm:text-right">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  row.status === "Healthy"
                    ? "bg-tint-mint text-tint-mint-foreground"
                    : "bg-tint-amber text-tint-amber-foreground"
                }`}
              >
                {row.status}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocsArticleThread({ articles }: { articles: string[] }) {
  return (
    <ol className="border-t border-border">
      {articles.map((article, i) => (
        <li key={article} className="border-b border-border">
          <Link
            to="/help-center"
            className={`group flex items-baseline gap-4 rounded-md px-1 py-4 transition-colors hover:bg-secondary/50 sm:gap-6 ${focusRing}`}
          >
            <span className="text-xs font-semibold tabular-nums text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-base text-foreground">{article}</span>
            <span
              aria-hidden
              className="text-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
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
    <Accordion type="single" collapsible className="border-t border-border">
      {faqs.map((faq) => (
        <AccordionItem key={faq.q} value={faq.q} className="border-b border-border">
          <AccordionTrigger
            className={`py-4 text-left text-base font-medium tracking-tight text-foreground hover:no-underline ${focusRing}`}
          >
            {faq.q}
          </AccordionTrigger>
          <AccordionContent className="max-w-2xl pb-5 text-sm leading-relaxed text-muted-foreground">
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
    <section className="bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <Button asChild size="lg" className="w-fit">
          <Link to="/auth">Start for Free</Link>
        </Button>
      </div>
    </section>
  );
}
