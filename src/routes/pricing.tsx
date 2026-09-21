import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Check,
  Minus,
  Sparkles,
  Zap,
  Building2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarketingLayout, PageHero, Section, FaqBlock } from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { isLifetimePlan } from "@/lib/billing/lifetime";
import { formatMoney } from "@/lib/billing/model";
import { getPlans, type Plan } from "@/lib/plans.functions";
import { PRICING_COMPARISON, type ComparisonValue } from "@/lib/pricing-comparison";
import { cn } from "@/lib/utils";
import { PageFaqs } from "@/components/site/PageFaqs";
import { supabase } from "@/integrations/supabase/client";
import { applySeoOverrides } from "@/lib/page-seo";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";

/**
 * Every pricing CTA leads to the customer Billing / Upgrade page with the
 * chosen plan preserved. Signed-out visitors go through sign-up first and are
 * returned to the same billing destination afterwards.
 */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

function planCtaHref(signedIn: boolean | null, planSlug?: string) {
  const billing = planSlug ? `/billing?plan=${encodeURIComponent(planSlug)}` : "/billing";
  return signedIn ? billing : `/signup?redirect=${encodeURIComponent(billing)}`;
}

const PRICING_TITLE = "MunchReach Pricing — Plans From Free to Agency";
const PRICING_DESCRIPTION =
  "Transparent cold email pricing. Start free, then scale sending, leads and mailboxes with a monthly or yearly plan that fits your team.";

export const Route = createFileRoute("/pricing")({
  head: ({ loaderData }) => {
    // Offers are built from the live plan records only — nothing is invented.
    const offers = (((loaderData as { plans?: Plan[] } | undefined)?.plans ?? []) as Plan[])
      .filter((p) => !p.is_enterprise && typeof p.monthly_price === "number")
      .map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: (p.monthly_price / 100).toFixed(2),
        priceCurrency: "USD",
        url: absoluteUrl("/pricing"),
      }));

    return applySeoOverrides("/pricing", {
      meta: [
        { title: PRICING_TITLE },
        { name: "description", content: PRICING_DESCRIPTION },
        { property: "og:title", content: PRICING_TITLE },
        { property: "og:description", content: PRICING_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: absoluteUrl("/pricing") },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: PRICING_TITLE },
        { name: "twitter:description", content: PRICING_DESCRIPTION },
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/pricing") }],
      scripts: offers.length
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                name: "MunchReach",
                description: PRICING_DESCRIPTION,
                url: absoluteUrl("/pricing"),
                brand: { "@type": "Brand", name: "MunchReach" },
                offers,
              }),
            },
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Pricing", path: "/pricing" },
            ]),
          ]
        : [
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Pricing", path: "/pricing" },
            ]),
          ],
    });
  },
  loader: async ({ context }) => {
    const query = plansQueryOptions();
    const plans = await context.queryClient.ensureQueryData(query);
    return { queryKey: query.queryKey, plans };
  },
  component: PricingPage,
});


function plansQueryOptions() {
  return {
    queryKey: ["public", "plans"],
    queryFn: () => getPlans(),
  };
}

function PricingPage() {
  const { data: allPlans } = useSuspenseQuery(plansQueryOptions());
  // Lifetime deals live on their own landing page and never appear here.
  const plans = allPlans.filter(
    (p) => p.public_on_pricing_page !== false && !isLifetimePlan(p),
  );
  const [yearly, setYearly] = useState(true);
  const signedIn = useSignedIn();

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Pricing"
        title="Simple pricing,"
        highlight="powerful outreach"
        description="Start free and upgrade when you're ready. No hidden fees — just the features you need to send, track, and reply at scale."
        primaryCta="Start for Free"
        primaryHref={planCtaHref(signedIn)}
        secondaryCta="Compare Plans"
        secondaryHref="#compare"
      />

      <Section>
        <div className="mx-auto flex w-full max-w-sm flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full border border-border bg-card px-4 py-2.5 sm:max-w-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <span className={cn("text-sm font-medium", !yearly && "text-foreground")}>Monthly</span>
          <Switch checked={yearly} onCheckedChange={setYearly} aria-label="Toggle yearly billing" />
          <span className={cn("text-sm font-medium", yearly && "text-foreground")}>
            Yearly
          </span>
          {yearly && (
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15">
              20% yearly discount
            </Badge>
          )}
        </div>

        <div className="mt-8 grid gap-5 sm:mt-10 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PricingCard key={plan.id} plan={plan} yearly={yearly} signedIn={signedIn} />
          ))}
        </div>


        <p className="mt-8 text-center text-sm text-muted-foreground">
          Prices in USD. Sending is fully managed by MunchReach — there is nothing to set up or
          maintain on your side.
        </p>
      </Section>

      <Section id="compare" muted title="Compare all features" description="Every plan, side by side.">
        <ComparisonTable plans={plans} />
      </Section>

      <Section>
        <PageFaqs page="pricing" defaults={pricingFaqs} />
      </Section>

      <Section muted>
        <div className="surface-card mx-auto max-w-3xl p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Not sure which plan fits your team?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Start free and upgrade whenever you need more prospects, campaigns or seats. Every plan
            includes managed sending.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <a href={planCtaHref(signedIn)}>Start for Free</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="/help-center">Visit Help Center</a>
            </Button>
          </div>
        </div>
      </Section>
      <TestimonialCarousel page="pricing" />

    </MarketingLayout>
  );
}

function PricingCard({
  plan,
  yearly,
  signedIn,
}: {
  plan: Plan;
  yearly: boolean;
  signedIn: boolean | null;
}) {
  const isTrial = plan.monthly_price === 0;
  const yearlyTotal = plan.yearly_price * 12;
  const displayPrice = yearly && !isTrial ? yearlyTotal : plan.monthly_price;
  const priceSuffix = isTrial ? "free trial" : yearly ? "/year" : "/mo";

  const limits = [
    { icon: Building2, label: "Workspaces", value: plan.max_workspaces },
    { icon: Users, label: "Team members", value: plan.max_users },
    { icon: Zap, label: "Email Accounts", value: plan.max_sending_accounts },
  ];

  const cta = isTrial ? "Start Free Trial" : "Get Started";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border bg-card p-6 shadow-sm transition-all",
        plan.is_popular && "border-primary/40 shadow-glow",
      )}
    >
      {plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground hover:bg-primary">
            <Sparkles className="mr-1 size-3" />
            Most popular
          </Badge>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-extrabold tracking-tight">
          {formatMoney(displayPrice)}
        </span>
        <span className="text-sm text-muted-foreground">{priceSuffix}</span>
      </div>
      {yearly && !isTrial && (
        <p className="mt-1 text-xs text-muted-foreground">
          Paid annually · 20% yearly discount
        </p>
      )}

      <Button className="mt-6 w-full" variant={plan.is_popular ? "default" : "outline"} asChild>
        <a href={planCtaHref(signedIn, plan.slug)}>{cta}</a>
      </Button>

      {/* Leads are a fixed capacity; emails are a monthly allowance on paid
          plans and a one-time total on the free trial. */}
      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-6">
        <div className="rounded-xl bg-secondary/40 p-3">
          <p className="text-lg font-bold leading-tight">
            {plan.max_leads ? plan.max_leads.toLocaleString() : "Unlimited"}
          </p>
          <p className="text-[11px] text-muted-foreground">Lead contacts stored</p>
        </div>
        <div className="rounded-xl bg-secondary/40 p-3">
          <p className="text-lg font-bold leading-tight">
            {plan.max_emails_monthly ? plan.max_emails_monthly.toLocaleString() : "Unlimited"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isTrial ? "Emails (total)" : "Emails / month"}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3 text-sm">
        {limits.map(({ icon: Icon, label, value }) =>
          value ? (
            <li key={label} className="flex items-center gap-2">
              <Icon className="size-4 text-primary" />
              <span className="text-muted-foreground">{label}:</span>
              <span className="ml-auto font-medium">{value.toLocaleString()}</span>
            </li>
          ) : null,
        )}
      </ul>


      <div className="mt-6 space-y-2">
        {displayFeatures(plan)
          .filter((f) => f.included && f.category !== "Workspace & users")
          .slice(0, 5)
          .map((f) => (
            <div key={f.id} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{f.name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/** Only display rows (feature_key === null) belong in the customer-facing table. */
function displayFeatures(plan: Plan) {
  return plan.features.filter((f) => !f.feature_key);
}

function ComparisonTable({ plans }: { plans: Plan[] }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Limits reflect the current plan configuration.
        </p>
        <p className="shrink-0 text-xs font-medium text-muted-foreground md:hidden">
          Swipe to compare →
        </p>
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th className="sticky left-0 z-30 w-[260px] min-w-[260px] border-b border-r border-border bg-card px-5 py-5 text-left text-xs font-semibold uppercase text-muted-foreground">
                Feature
              </th>
              {plans.map((plan) => (
                <th key={plan.id} className="min-w-[128px] border-b border-border px-4 py-5 text-center">
                  <span className="block font-semibold text-foreground">{plan.name}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {plan.monthly_price === 0 ? "Free" : `$${(plan.monthly_price / 100).toFixed(0)}/mo`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRICING_COMPARISON.map((category) => (
              <ComparisonGroup key={category.name} category={category} plans={plans} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonGroup({
  category,
  plans,
}: {
  category: (typeof PRICING_COMPARISON)[number];
  plans: Plan[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={plans.length + 1}
          className="border-b border-border bg-secondary/60 px-5 py-3 text-xs font-bold uppercase text-foreground"
        >
          {category.name}
        </td>
      </tr>
      {category.rows.map((row) => (
        <tr key={`${category.name}-${row.label}`} className="group">
          <td className="sticky left-0 z-10 border-b border-r border-border/70 bg-card px-5 py-3.5 group-hover:bg-secondary/30">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help font-medium text-foreground underline decoration-border underline-offset-4">
                    {row.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs"><p>{row.description}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </td>
          {plans.map((plan) => {
            const value = row.value(plan);
            return (
              <td key={plan.id} className="border-b border-border/70 px-3 py-3.5 text-center group-hover:bg-secondary/20">
                <ComparisonCell value={value} label={row.label} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function ComparisonCell({ value, label }: { value: ComparisonValue; label: string }) {
  if (value === true) {
    return <Check className="mx-auto size-5 text-primary" aria-label={`${label} included`} />;
  }
  if (value === false) {
    return <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label={`${label} unavailable`} />;
  }
  return <span className="font-semibold text-foreground">{value}</span>;
}

const pricingFaqs = [
    {
      q: "Can I change plans later?",
      a: "Yes. You can upgrade or downgrade at any time from your workspace settings. Prorated credits are applied automatically.",
    },
    {
      q: "How are lead and email limits different?",
      a: "Leads are a fixed storage capacity — the total number of contacts your workspace can hold at once. Paid plans include a monthly email allowance; the free trial includes a one-time email allowance.",
    },
    {
      q: "Do I need my own SMTP or email API?",
      a: "No. MunchReach manages the sending infrastructure behind the scenes. You add prospects, build your campaign and launch — we handle delivery.",
    },
    {
      q: "What counts as a lead contact?",
      a: "A lead contact is a unique email address stored in your workspace. We deduplicate by email across all lead lists.",
    },
    {
      q: "What happens on the free trial?",
      a: "The free trial includes a one-time allowance of leads and emails that does not reset. Upgrade whenever you need recurring monthly volume.",
    },
    {
      q: "What happens when I hit a limit?",
      a: "We warn you at 70%, 85% and 95% of an allowance. At 100% the related action is paused until your next cycle or an upgrade — nothing is deleted.",
    },
    {
      q: "Can I get a refund?",
      a: "We offer a 14-day refund on yearly plans if you haven't launched a campaign. Monthly plans can be cancelled anytime.",
    },
  ];


