import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Check,
  Minus,
  HelpCircle,
  ArrowRight,
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
import { getPlans, type Plan, type PlanFeature } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";
import { PageFaqs } from "@/components/site/PageFaqs";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — MunchReach" },
      {
        name: "description",
        content:
          "Simple, transparent pricing for cold email outreach. Start free, then scale with Starter, Growth or Agency plans.",
      },
      { property: "og:title", content: "Pricing — MunchReach" },
      {
        property: "og:description",
        content:
          "Simple, transparent pricing for cold email outreach. Start free, then scale with Starter, Growth or Agency plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    const query = plansQueryOptions();
    await context.queryClient.ensureQueryData(query);
    return { queryKey: query.queryKey };
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
  const { data: plans } = useSuspenseQuery(plansQueryOptions());
  const [yearly, setYearly] = useState(true);

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Pricing"
        title="Simple pricing,"
        highlight="powerful outreach"
        description="Start free and upgrade when you're ready. No hidden fees — just the features you need to send, track, and reply at scale."
        primaryCta="Start for Free"
        secondaryCta="Compare Plans"
        secondaryHref="#compare"
      />

      <Section>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <span className={cn("text-sm font-medium", !yearly && "text-foreground")}>Monthly</span>
          <Switch checked={yearly} onCheckedChange={setYearly} aria-label="Toggle yearly billing" />
          <span className={cn("text-sm font-medium", yearly && "text-foreground")}>
            Yearly
          </span>
          {yearly && (
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15">
              Save up to 20%
            </Badge>
          )}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-4">
          {plans.map((plan) => (
            <PricingCard key={plan.id} plan={plan} yearly={yearly} />
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
              <a href="/signup">Start for Free</a>
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

function PricingCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const price = yearly ? plan.yearly_price : plan.monthly_price;
  const yearlyTotal = plan.yearly_price * 12;
  const isTrial = plan.monthly_price === 0;

  const limits = [
    { icon: Building2, label: "Workspaces", value: plan.max_workspaces },
    { icon: Users, label: "Team members", value: plan.max_users },
    { icon: Zap, label: "Sending accounts", value: plan.max_sending_accounts },
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
          ${(price / 100).toFixed(0)}
        </span>
        <span className="text-sm text-muted-foreground">/mo</span>
      </div>
      {yearly && price > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          ${(yearlyTotal / 100).toLocaleString()} billed yearly
        </p>
      )}

      <Button className="mt-6 w-full" variant={plan.is_popular ? "default" : "outline"} asChild>
        <a href={"/signup"}>{cta}</a>
      </Button>

      {/* Leads are a fixed capacity; emails are an allowance that resets each
          billing cycle (a one-time total on the free trial). */}
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
  const categoryOrder = [
    "Workspace & users",
    "Leads & sending",
    "Deliverability",
    "Product",
    "Support",
  ];
  const found = Array.from(new Set(plans.flatMap((p) => displayFeatures(p).map((f) => f.category))));
  const categories = [
    ...categoryOrder.filter((c) => found.includes(c)),
    ...found.filter((c) => !categoryOrder.includes(c)),
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-6 py-4 text-left font-medium text-muted-foreground">Feature</th>
            {plans.map((p) => (
              <th key={p.id} className="px-6 py-4 text-center font-semibold">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const base = plans[0] ? displayFeatures(plans[0]) : [];
            const rows = base.filter((f) => f.category === category);
            return (
              <FragmentGroup
                key={category}
                category={category}
                rows={rows}
                plans={plans}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({
  category,
  rows,
  plans,
}: {
  category: string;
  rows: PlanFeature[];
  plans: Plan[];
}) {
  return (
    <>
      <tr className="bg-secondary/40">
        <td
          colSpan={plans.length + 1}
          className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {category}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.name} className="border-b border-border/60 last:border-0">
          <td className="px-6 py-3.5">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help items-center gap-1.5">
                    {row.name}
                    <HelpCircle className="size-3.5 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>Included on plans where marked.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </td>
          {plans.map((plan) => {
            const feature = displayFeatures(plan).find((f) => f.name === row.name);
            return (
              <td key={plan.id} className="px-6 py-3.5 text-center">
                {feature?.included ? (
                  feature.value ? (
                    <span className="font-semibold text-foreground">{feature.value}</span>
                  ) : (
                    <Check className="mx-auto size-5 text-primary" />
                  )
                ) : (
                  <Minus className="mx-auto size-4 text-muted-foreground/60" />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

const pricingFaqs = [
    {
      q: "Can I change plans later?",
      a: "Yes. You can upgrade or downgrade at any time from your workspace settings. Prorated credits are applied automatically.",
    },
    {
      q: "How are lead and email limits different?",
      a: "Leads are a fixed storage capacity — the total number of contacts your workspace can hold at once. Emails are an allowance that resets at the start of every billing cycle.",
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


