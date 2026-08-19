/**
 * Public referral program landing page.
 *
 * All numbers shown here come from the live program settings — nothing is
 * fabricated. When the program is disabled the page invites people to join
 * the waitlist instead of promising commissions.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Coins,
  Link2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  FeatureBento,
  MarketingLayout,
  PageHero,
  Section,
  StepList,
  metaFor,
} from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicReferralProgram } from "@/lib/referral.functions";
import {
  PAYOUT_METHOD_LABELS,
  describeCommission,
  formatMoney,
  type ReferralProgram,
} from "@/lib/referral-model";

const programQuery = {
  queryKey: ["referral", "public-program"],
  queryFn: () => getPublicReferralProgram(),
  staleTime: 5 * 60 * 1000,
};

const faqs = [
  {
    q: "How does Sendloop referral tracking work?",
    a: "Every referrer gets a unique link. When someone opens it, Sendloop stores the click and a first-party attribution cookie. If that visitor creates an account, the signup is attributed server-side and permanently linked to the referrer.",
  },
  {
    q: "When do I earn a commission?",
    a: "Commissions are created only when Sendloop receives a verified payment event from the billing provider for a referred customer. Trials and free accounts do not generate commissions.",
  },
  {
    q: "What happens if a referred customer refunds or cancels?",
    a: "Refunds, chargebacks and cancellations reverse the related commission automatically, so balances always reflect real revenue.",
  },
  {
    q: "Can I refer myself or create extra accounts?",
    a: "No. Self-referrals are blocked, each account can be attributed only once, and duplicate or suspicious signups are flagged for review. Abuse results in suspension from the program.",
  },
  {
    q: "How do payouts work?",
    a: "Once commissions are approved, you can request a payout from your referral dashboard as soon as you reach the minimum payout amount. Sendloop reviews and marks each payout when it is sent.",
  },
];

export const Route = createFileRoute("/referral")({
  loader: ({ context }) => context.queryClient.ensureQueryData(programQuery),
  head: () =>
    metaFor({
      title: "Sendloop Referral Program — Earn recurring commission",
      description:
        "Refer teams to Sendloop and earn commission on real, verified payments. Transparent tracking, live dashboard, reversal-safe balances and manual-reviewed payouts.",
      path: "/referral",
      faqs,
    }),
  errorComponent: () => (
    <MarketingLayout>
      <Section title="Referral program" subtitle="We could not load the program terms right now. Please refresh the page.">
        <div />
      </Section>
    </MarketingLayout>
  ),
  notFoundComponent: () => (
    <MarketingLayout>
      <Section title="Not found" subtitle="This page does not exist.">
        <div />
      </Section>
    </MarketingLayout>
  ),
  component: ReferralLanding,
});

function ReferralLanding() {
  const { data } = useSuspenseQuery(programQuery);
  const program = data as ReferralProgram | null;
  const live = Boolean(program?.enabled);

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Referral program"
        title="Get paid for every team you bring to Sendloop"
        subtitle={
          live && program
            ? `Earn ${describeCommission(program)}. Tracking is server-side, balances update from verified payments only, and payouts start at ${formatMoney(program.minimum_payout_cents)}.`
            : "The Sendloop referral program is being finalised. Create your referral profile now and your link will be ready the moment commissions go live."
        }
        primary={{ label: live ? "Get my referral link" : "Create my referral profile", to: "/referrals" }}
        secondary={{ label: "See program terms", to: "/terms" }}
      />

      <Section
        title={live ? "What you earn" : "How the program will work"}
        subtitle="Every number below comes from the live program configuration, not marketing estimates."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Coins,
              label: "Commission",
              value: program
                ? program.commission_type === "percentage"
                  ? `${program.commission_percent}%`
                  : formatMoney(program.commission_fixed_cents)
                : "—",
              text: program?.recurring
                ? program.commission_duration_months > 0
                  ? `Recurring for ${program.commission_duration_months} months`
                  : "Recurring for the subscription lifetime"
                : "One-time per paying customer",
            },
            {
              icon: Wallet,
              label: "Minimum payout",
              value: program ? formatMoney(program.minimum_payout_cents) : "—",
              text: `Paid ${program?.payout_schedule ?? "monthly"} after review`,
            },
            {
              icon: Link2,
              label: "Attribution window",
              value: program ? `${program.attribution_window_days} days` : "—",
              text: "From first click to signup",
            },
            {
              icon: ShieldCheck,
              label: "Approval",
              value: program?.approval_mode === "auto" ? "Automatic" : "Reviewed",
              text: program?.approval_delay_days
                ? `Commissions settle after ${program.approval_delay_days} days`
                : "Commissions settle after verification",
            },
          ].map((item) => (
            <Card key={item.label} className="border-border/60">
              <CardContent className="space-y-2 p-6">
                <item.icon className="size-5 text-primary" />
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="How it works" subtitle="Four steps, fully tracked inside Sendloop.">
        <StepList
          steps={[
            { title: "Create your referral profile", text: "Open the Referrals page in your Sendloop dashboard and generate your unique link and code." },
            { title: "Share your link", text: "Post it, email it or embed it. Each visit is recorded so you can see what actually drives signups." },
            { title: "Your referral signs up", text: "The signup is attributed server-side. Self-referrals and duplicate accounts are rejected automatically." },
            { title: "Get paid on real revenue", text: "When the referred customer pays, a commission is recorded. Request a payout once your approved balance clears the minimum." },
          ]}
        />
      </Section>

      <Section title="Built to be fair on both sides" subtitle="No inflated dashboards, no phantom balances.">
        <FeatureBento
          items={[
            { icon: BarChart3, title: "Live performance data", text: "Clicks, signups, converted customers and conversion rate, all calculated from your own tracked events." },
            { icon: BadgeCheck, title: "Verified payments only", text: "Commissions are created from signed billing webhooks, never from client-side events." },
            { icon: ShieldCheck, title: "Refund-safe balances", text: "Refunds, chargebacks and cancellations reverse the matching commission automatically." },
            { icon: Users, title: "Abuse protection", text: "Self-referrals blocked, one attribution per account, and suspicious signups flagged for review." },
            { icon: Wallet, title: "Transparent payouts", text: `Request payouts by ${program?.payout_methods?.map((m) => PAYOUT_METHOD_LABELS[m] ?? m).join(", ") ?? "the enabled payout methods"} and follow each status change.` },
            { icon: Link2, title: "Permanent audit trail", text: "Every attribution, commission and payout decision is logged and visible to you." },
          ]}
        />
      </Section>

      <Section title="Who can join" subtitle="Straightforward eligibility.">
        <BulletList
          items={[
            program?.eligibility ?? "Any Sendloop account in good standing can join the referral program.",
            "Referred accounts must be genuinely new Sendloop customers.",
            "Commissions apply to paid subscriptions, not trials or free usage.",
            "Sendloop may withhold commissions linked to fraud, abuse or policy violations.",
          ]}
        />
        {program?.terms ? <p className="mt-6 whitespace-pre-line text-sm text-muted-foreground">{program.terms}</p> : null}
      </Section>

      <FaqBlock faqs={faqs} />

      <CtaBlock
        title="Start referring today"
        subtitle="Your referral link, live stats and payout requests all live inside your Sendloop dashboard."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/referrals">
                Open referral dashboard <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/signup">Create a free account</Link>
            </Button>
          </div>
        }
      />
    </MarketingLayout>
  );
}
