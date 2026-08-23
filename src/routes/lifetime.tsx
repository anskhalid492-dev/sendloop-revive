import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Infinity as InfinityIcon, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketingLayout, Section, FaqBlock, faqJsonLd } from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { getPlans, type Plan } from "@/lib/plans.functions";
import {
  LIFETIME_PLAN_SLUG,
  isLifetimePlan,
  lifetimeCompareAtCents,
  lifetimePriceCents,
} from "@/lib/billing/lifetime";
import { formatMoney } from "@/lib/billing/model";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Lifetime Deal landing page.
 *
 * Deliberately excluded from the public pricing page: the plan row carries
 * `billing_type = 'lifetime'` and `public_on_pricing_page = false`, and this
 * route is the only place the offer is presented. Checkout runs through the
 * normal billing flow (one-time Stripe payment), so entitlements, invoices and
 * refunds behave exactly like every other paid plan.
 */

const FAQS = [
  {
    q: "Is this really a one-time payment?",
    a: "Yes. You pay once and keep access to your MunchReach workspace with the lifetime entitlements below. There is no monthly or annual renewal.",
  },
  {
    q: "What does “lifetime” cover?",
    a: "Lifetime access to the MunchReach platform and the limits listed on this page, including all core product improvements we ship to those features.",
  },
  {
    q: "Can I upgrade later if I outgrow the limits?",
    a: "Yes. You can move to any monthly or annual plan at any time from Settings → Billing, and your lifetime licence stays on the account.",
  },
  {
    q: "Do I still need my own mailboxes and domains?",
    a: "You connect your own sending mailboxes and domains, exactly like on the regular plans. MunchReach handles sending, warmup, tracking and replies.",
  },
  {
    q: "How do I get an invoice?",
    a: "An invoice is generated automatically after payment and is available in Settings → Billing, along with your payment history.",
  },
  {
    q: "What is your refund policy?",
    a: "Contact support@munchreach.com within 14 days of purchase and we will review your request under our standard refund policy.",
  },
];

const INCLUDED: { label: string; value: string }[] = [
  { label: "Contacts stored", value: "15,000" },
  { label: "Emails per month", value: "10,000" },
  { label: "Connected email accounts", value: "10" },
  { label: "Campaigns", value: "Unlimited" },
  { label: "Sequences & follow-ups", value: "Unlimited" },
  { label: "Inbox warmup", value: "Included" },
  { label: "Unified inbox", value: "Included" },
  { label: "Analytics & reporting", value: "Included" },
  { label: "Automations", value: "Included" },
  { label: "Integrations & API", value: "Included" },
];

export const Route = createFileRoute("/lifetime")({
  head: () => ({
    meta: [
      { title: "MunchReach Lifetime Deal — Pay Once, Send Forever" },
      {
        name: "description",
        content:
          "A one-time payment for lifetime access to MunchReach cold outreach: 10,000 emails a month, 15,000 contacts, 10 mailboxes, warmup, unified inbox and automations.",
      },
      { property: "og:title", content: "MunchReach Lifetime Deal — Pay Once, Send Forever" },
      {
        property: "og:description",
        content:
          "One-time payment. Lifetime access to campaigns, warmup, unified inbox, analytics and automations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: [faqJsonLd(FAQS)],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(lifetimeQueryOptions());
  },
  component: LifetimePage,
});

function lifetimeQueryOptions() {
  return { queryKey: ["public", "plans"], queryFn: () => getPlans() };
}

function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

function LifetimePage() {
  const { data: plans } = useSuspenseQuery(lifetimeQueryOptions());
  const signedIn = useSignedIn();

  const plan: Plan | undefined =
    plans.find((p) => p.slug === LIFETIME_PLAN_SLUG) ?? plans.find((p) => isLifetimePlan(p));

  const priceCents = lifetimePriceCents(plan);
  const compareCents = lifetimeCompareAtCents(plan);
  const billingHref = `/billing?plan=${encodeURIComponent(plan?.slug ?? LIFETIME_PLAN_SLUG)}`;
  const ctaHref = signedIn ? billingHref : `/signup?redirect=${encodeURIComponent(billingHref)}`;

  const monthlyPlans = plans.filter(
    (p) => !isLifetimePlan(p) && p.public_on_pricing_page !== false && p.monthly_price > 0,
  );
  const reference = monthlyPlans[0];

  return (
    <MarketingLayout>
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
            <Sparkles className="mr-1.5 size-3.5" /> Lifetime Deal
          </Badge>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Pay once.{" "}
            <span className="text-gradient">Send cold email forever.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            One payment for lifetime access to MunchReach — campaigns, inbox warmup, the unified
            inbox, analytics and automations. No monthly bill, no renewal, no surprise invoices.
          </p>

          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-end justify-center gap-3">
              <span className="text-5xl font-extrabold tracking-tight">
                {formatMoney(priceCents)}
              </span>
              <span className="pb-2 text-sm text-muted-foreground">one-time</span>
            </div>
            {compareCents > 0 ? (
              <p className="text-sm text-muted-foreground">
                <span className="line-through">{formatMoney(compareCents)}</span> if billed yearly
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <a href={ctaHref}>Get Lifetime Access</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#whats-included">See What's Included</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Secure one-time payment · Invoice included · 14-day refund window
          </p>
        </div>
      </section>

      <Section
        id="whats-included"
        title="Everything in your lifetime licence"
        description="The same production platform paying subscribers use — with limits that fit a serious solo operator or small outbound team."
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="surface-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Limits & features
            </h3>
            <dl className="mt-4 divide-y divide-border/60">
              {INCLUDED.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm font-semibold">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="surface-card flex flex-col p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Why it's worth it
            </h3>
            <ul className="mt-4 flex-1 space-y-3 text-sm">
              {[
                "No recurring bill — your outreach cost is fixed forever.",
                "Warmup runs continuously so your mailboxes stay out of spam.",
                "Every reply lands in one unified inbox with full thread history.",
                "Automations and follow-ups keep sequences moving without you.",
                "Upgrade to a monthly plan any time if you outgrow the limits.",
              ].map((text) => (
                <li key={text} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6" size="lg" asChild>
              <a href={ctaHref}>Get Lifetime Access — {formatMoney(priceCents)}</a>
            </Button>
          </div>
        </div>
      </Section>

      <Section
        muted
        title="Lifetime vs monthly"
        description="The same platform. One is a subscription, the other is a single payment."
      >
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          <div className="surface-card p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Zap className="size-4" /> Monthly plan
            </div>
            <p className="mt-3 text-3xl font-bold">
              {reference ? formatMoney(reference.monthly_price) : "—"}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Billed every month, forever</li>
              <li>Cancel any time — access ends with the period</li>
              <li>Cost grows with every month you keep sending</li>
            </ul>
          </div>
          <div className={cn("surface-card border-primary/50 p-6 ring-2 ring-primary/20")}>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <InfinityIcon className="size-4" /> Lifetime deal
            </div>
            <p className="mt-3 text-3xl font-bold">
              {formatMoney(priceCents)}
              <span className="text-sm font-normal text-muted-foreground"> once</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>One payment, no renewal</li>
              <li>Keeps working for as long as you use MunchReach</li>
              <li>Includes warmup, unified inbox, analytics and automations</li>
            </ul>
            <Button className="mt-6 w-full" asChild>
              <a href={ctaHref}>Claim the lifetime deal</a>
            </Button>
          </div>
        </div>
      </Section>

      <Section>
        <TestimonialCarousel />
      </Section>

      <Section muted>
        <FaqBlock
          faqs={FAQS}
          eyebrow="Lifetime FAQ"
          title="Questions about the lifetime deal"
          description="What you pay, what you get, and what happens next."
        />
      </Section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="hero-glow surface-card px-6 py-14 text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" />
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            One payment. Lifetime outreach.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Claim your MunchReach lifetime licence today and never think about an outreach
            subscription again.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <a href={ctaHref}>Get Lifetime Access — {formatMoney(priceCents)}</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="/contact-support">Talk to us first</a>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
