import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  FileText,
  Flame,
  Gauge,
  Inbox,
  Infinity as InfinityIcon,
  Lock,
  Mailbox,
  MessageSquare,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

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
 * Lifetime Deal sales page.
 *
 * Deliberately excluded from the public pricing page: the plan row carries
 * `billing_type = 'lifetime'` and `public_on_pricing_page = false`, and this
 * route is the only place the offer is presented. Checkout runs through the
 * normal billing flow (one-time Stripe payment), so entitlements, invoices and
 * refunds behave exactly like every other paid plan — nothing here hardcodes a
 * Stripe price; the plan row is read from the database.
 */

const FAQS = [
  {
    q: 'What does "lifetime" mean?',
    a: "Lifetime access to the MunchReach plan you purchase — the platform and the limits listed on this page — for as long as you keep using MunchReach. There is no renewal date.",
  },
  {
    q: "Is this really a one-time payment?",
    a: "Yes. You pay once through secure Stripe checkout and the lifetime plan is applied to your workspace. No subscription is created.",
  },
  {
    q: "Will I be charged again?",
    a: "No. The lifetime purchase is a one-time charge. You would only be charged again if you chose to buy something else, such as moving to a higher monthly plan.",
  },
  {
    q: "What exactly is included?",
    a: "Campaigns and sequences, automated follow-ups, the unified inbox, lead management, sending accounts, inbox warmup, deliverability monitoring, analytics and reply tracking, automations, templates, AI personalization with your own key, workspaces and usage tracking.",
  },
  {
    q: "How many leads can I store?",
    a: "The lifetime plan includes 15,000 stored contacts.",
  },
  {
    q: "How many emails are included?",
    a: "10,000 emails per month, every month, with no recurring bill.",
  },
  {
    q: "Can I connect my own sending accounts?",
    a: "Yes. You connect your own mailboxes and sending domains — up to 10 connected email accounts on the lifetime plan.",
  },
  {
    q: "Does this include warmup?",
    a: "Yes. Inbox warmup runs on your connected mailboxes and is included in the lifetime plan, along with deliverability monitoring.",
  },
  {
    q: "Will I get future product improvements?",
    a: "Yes — you receive the improvements we ship to the features included in your plan.",
  },
  {
    q: "How does the Lifetime plan appear in my account?",
    a: "It appears in Settings → Billing as your active plan, with your entitlements and payment history, exactly like any other paid plan.",
  },
  {
    q: "What happens after payment?",
    a: "Stripe confirms the payment, our webhook records it, and your workspace is upgraded to the lifetime plan automatically. Your invoice is available in Settings → Billing.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. You can move to any monthly or annual plan at any time from Settings → Billing if you outgrow the lifetime limits.",
  },
  {
    q: "What happens if I reach my plan limits?",
    a: "Usage is metered per billing cycle. When you reach a limit, sending or importing pauses for that resource until the cycle resets — or you can upgrade to a larger plan.",
  },
  {
    q: "How does the Stripe payment work?",
    a: "Clicking Get Lifetime Access opens a secure Stripe checkout session for a one-time payment in USD. MunchReach never sees or stores your card details.",
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

const FEATURES = [
  {
    icon: Send,
    title: "Cold email campaigns",
    text: "Build targeted campaigns with personalized variables and send them from your own mailboxes.",
  },
  {
    icon: Repeat,
    title: "Automated follow-ups",
    text: "Follow-up steps send on their own and stop the moment a prospect replies.",
  },
  {
    icon: Workflow,
    title: "Campaign sequences",
    text: "Multi-step sequences with delays, variants and per-step settings.",
  },
  {
    icon: Inbox,
    title: "Unified inbox",
    text: "Every reply from every mailbox lands in one threaded inbox with full history.",
  },
  {
    icon: Users,
    title: "Lead management",
    text: "Import, segment and organize prospects into lists with custom fields and notes.",
  },
  {
    icon: Mailbox,
    title: "Sending accounts",
    text: "Connect multiple mailboxes and rotate sending across them automatically.",
  },
  {
    icon: Flame,
    title: "Email warmup",
    text: "Continuous warmup keeps your mailboxes trusted and out of the spam folder.",
  },
  {
    icon: ShieldCheck,
    title: "Deliverability monitoring",
    text: "SPF, DKIM and DMARC checks with domain alerts when something breaks.",
  },
  {
    icon: BarChart3,
    title: "Campaign analytics",
    text: "Sends, deliveries, opens, clicks, replies and bounces per campaign and per mailbox.",
  },
  {
    icon: MessageSquare,
    title: "Reply tracking",
    text: "Replies are matched back to the campaign and prospect that produced them.",
  },
  {
    icon: Zap,
    title: "Automations",
    text: "Trigger follow-ups, CRM stage changes and tasks from prospect activity.",
  },
  {
    icon: Bot,
    title: "AI personalization",
    text: "Generate a unique opening line per prospect using your own OpenAI key.",
  },
  {
    icon: Building2,
    title: "Workspaces",
    text: "Invite teammates, assign roles and keep client work separated.",
  },
  {
    icon: FileText,
    title: "Templates",
    text: "Save and reuse proven outreach copy across campaigns.",
  },
  {
    icon: Gauge,
    title: "Usage tracking",
    text: "See exactly how much of your sending and contact allowance you have used.",
  },
];

const PROBLEMS = [
  "Paying for multiple disconnected tools",
  "Paying monthly just to send campaigns",
  "Manually following up with prospects",
  "Switching between inboxes and campaign tools",
  "Losing track of replies",
  "Paying more as your outreach grows",
];

const COMPARISON: { label: string; lifetime: string; stack: string }[] = [
  { label: "Campaigns", lifetime: "Included", stack: "Separate sending tool" },
  { label: "Automated follow-ups", lifetime: "Included", stack: "Separate tool or manual" },
  { label: "Unified inbox", lifetime: "Included", stack: "Your mailbox clients" },
  { label: "Warmup", lifetime: "Included", stack: "Usually a separate subscription" },
  { label: "Analytics", lifetime: "Included", stack: "Split across tools" },
  { label: "Lead management", lifetime: "Included", stack: "Spreadsheets or a separate CRM" },
  { label: "Automations", lifetime: "Included", stack: "Separate automation tool" },
  { label: "Templates", lifetime: "Included", stack: "Docs and snippets" },
  { label: "Multiple sending accounts", lifetime: "Up to 10", stack: "Priced per mailbox" },
  { label: "Lifetime access", lifetime: "One payment", stack: "Monthly, forever" },
];

const AUDIENCES = [
  { icon: Building2, label: "Agencies", text: "Run outbound for your agency and your clients from separated workspaces." },
  { icon: Sparkles, label: "Founders", text: "Own your pipeline without hiring an outbound team first." },
  { icon: Users, label: "Sales teams", text: "Keep campaigns, replies and prospect activity in one shared workspace." },
  { icon: Send, label: "Lead generation companies", text: "Send at volume across multiple mailboxes with warmup running." },
  { icon: FileText, label: "Freelancers", text: "Fill your calendar with a repeatable outreach system." },
  { icon: Workflow, label: "B2B service companies", text: "Reach the accounts you want and follow up automatically." },
  { icon: MessageSquare, label: "Consultants", text: "Stay in conversation with prospects without manual chasing." },
];

const USE_CASES = [
  {
    title: "Agency outbound",
    text: "Run campaigns for your own agency and manage every reply in one place, with separate workspaces per client.",
  },
  {
    title: "B2B lead generation",
    text: "Build targeted campaigns from your lead lists and automate the follow-up sequence end to end.",
  },
  {
    title: "Founder-led sales",
    text: "Spend less time managing outreach mechanics and more time talking to interested prospects.",
  },
  {
    title: "Sales teams",
    text: "Keep campaigns, replies and prospect activity organized and visible to the whole team.",
  },
];

const AFTER_PURCHASE = [
  { step: "Step 1", title: "Click Get Lifetime Access", text: "You are taken straight to checkout." },
  { step: "Step 2", title: "Complete secure Stripe checkout", text: "A single one-time payment in USD." },
  { step: "Step 3", title: "Your workspace is upgraded", text: "The lifetime plan is applied automatically." },
  { step: "Step 4", title: "Start using your plan", text: "Connect mailboxes, import leads and launch." },
];

const TRUST = [
  { icon: CreditCard, label: "Secure Stripe checkout" },
  { icon: InfinityIcon, label: "One-time payment" },
  { icon: ShieldCheck, label: "No recurring subscription" },
  { icon: Zap, label: "Automatic plan activation" },
  { icon: Lock, label: "Encrypted credentials where applicable" },
];

const FLOW = ["Leads", "Campaign", "Follow-ups", "Reply", "Conversation", "Customer"];

export const Route = createFileRoute("/lifetime")({
  head: () => ({
    meta: [
      { title: "MunchReach Lifetime Deal — Get Lifetime Access" },
      {
        name: "description",
        content:
          "Run cold email campaigns, follow-ups, warmup and a unified inbox for one payment. MunchReach Lifetime, no recurring subscription.",
      },
      { property: "og:title", content: "MunchReach Lifetime Deal — Get Lifetime Access" },
      {
        property: "og:description",
        content:
          "One-time payment. Lifetime access to campaigns, warmup, unified inbox, analytics and automations.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://munchreach.com/lifetime" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://munchreach.com/lifetime" }],
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

/** Shows the sticky bar only once the visitor has scrolled past the hero. */
function useScrolledPastHero() {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > 720);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return past;
}

function LifetimePage() {
  const { data: plans } = useSuspenseQuery(lifetimeQueryOptions());
  const signedIn = useSignedIn();
  const showSticky = useScrolledPastHero();

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
      {/* 1 — HERO */}
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="text-center lg:text-left">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
              <Crown className="mr-1.5 size-3.5" /> Lifetime Deal
            </Badge>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Stop Paying Monthly for the Tools You Need to{" "}
              <span className="text-gradient">Win More Customers.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
              MunchReach gives you the tools to find prospects, launch campaigns, automate
              follow-ups, and manage conversations — with lifetime access for one payment.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground lg:justify-start">
              <span className="font-semibold text-foreground">Pay once.</span>
              <span className="font-semibold text-foreground">Use MunchReach for life.</span>
              <span className="font-semibold text-foreground">No monthly software bill.</span>
            </div>
          </div>

          <div className="surface-card mx-auto w-full max-w-md border-primary/40 p-7 ring-2 ring-primary/15">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              MunchReach Lifetime
            </p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-5xl font-extrabold tracking-tight">
                {formatMoney(priceCents)}
              </span>
              {compareCents > 0 ? (
                <span className="pb-2 text-lg text-muted-foreground line-through">
                  {formatMoney(compareCents)}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              One-time payment
            </p>
            {compareCents > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Compare-at {formatMoney(compareCents)} — what the same entitlements cost over a year
                of monthly billing.
              </p>
            ) : null}

            <Button size="lg" className="mt-6 w-full" asChild>
              <a href={ctaHref}>Get Lifetime Access</a>
            </Button>

            <ul className="mt-5 space-y-2 text-sm">
              {[
                "One-time payment",
                "No recurring subscription",
                "Secure Stripe checkout",
                "Lifetime access to the purchased plan",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">
              This is a limited lifetime offer and is not listed on our pricing page. Pricing may
              change at any time — the plan you buy today keeps its terms.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — PROBLEM */}
      <Section
        muted
        title="Your outbound stack shouldn't cost a fortune every month."
        description="Most teams end up renting five tools to run one workflow — and the bill grows with every prospect they add."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p} className="surface-card p-6 text-sm">
              <span className="flex size-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Zap className="size-4" />
              </span>
              <p className="mt-4 font-medium">{p}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-lg font-semibold">
          MunchReach brings the core outbound workflow together in one workspace.
        </p>
      </Section>

      {/* 3 — WHAT YOU GET */}
      <Section
        id="whats-included"
        title="Everything you need to turn cold outreach into conversations."
        description="The same production platform paying subscribers use — included in your lifetime licence."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 4 — HOW IT WORKS */}
      <Section
        muted
        title="How MunchReach works"
        description="Three steps from a list of prospects to real conversations."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              n: "01",
              title: "Add your prospects",
              text: "Import and organize the leads you want to reach.",
            },
            {
              n: "02",
              title: "Launch your campaigns",
              text: "Create sequences and automate follow-ups.",
            },
            {
              n: "03",
              title: "Manage the conversations",
              text: "See replies, manage prospects, and move interested leads forward from one workspace.",
            },
          ].map((s) => (
            <div key={s.n} className="surface-card p-8">
              <span className="text-4xl font-extrabold text-primary/30">{s.n}</span>
              <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 5 — WHY MUNCHREACH */}
      <Section
        title="One workspace for your outbound engine."
        description="Prospecting + campaigns + follow-ups + inbox + warmup + analytics, running as a single system instead of five subscriptions."
      >
        <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          {FLOW.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div className="surface-card flex-1 px-6 py-4 text-center text-sm font-semibold uppercase tracking-wide">
                {step}
              </div>
              {i < FLOW.length - 1 ? (
                <span aria-hidden="true" className="text-primary">
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {/* 6 — LIFETIME VALUE */}
      <Section
        muted
        title="Why pay every month?"
        description="Instead of adding another recurring SaaS subscription to your stack, get lifetime access to the purchased MunchReach plan with one payment."
      >
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          <div className="surface-card p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Zap className="size-4" /> Monthly plan
            </div>
            <p className="mt-3 text-4xl font-bold">
              {reference ? formatMoney(reference.monthly_price) : "—"}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>Billed every month, forever</li>
              <li>Cancel any time — access ends with the period</li>
              <li>Cost grows with every month you keep sending</li>
            </ul>
          </div>
          <div className={cn("surface-card border-primary/50 p-8 ring-2 ring-primary/20")}>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <InfinityIcon className="size-4" /> Lifetime deal
            </div>
            <p className="mt-3 text-4xl font-bold">
              {formatMoney(priceCents)}
              <span className="text-sm font-normal text-muted-foreground"> once</span>
            </p>
            {compareCents > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Compare-at <span className="line-through">{formatMoney(compareCents)}</span>
              </p>
            ) : null}
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>One payment, no renewal</li>
              <li>Keeps working for as long as you use MunchReach</li>
              <li>Includes warmup, unified inbox, analytics and automations</li>
            </ul>
            <Button className="mt-6 w-full" asChild>
              <a href={ctaHref}>Claim the lifetime deal</a>
            </Button>
          </div>
        </div>

        <div className="surface-card mx-auto mt-8 max-w-4xl p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Limits & features in your lifetime licence
          </h3>
          <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
            {INCLUDED.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 border-b border-border/60 py-3"
              >
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* 7 — COMPARISON */}
      <Section
        title="MunchReach Lifetime vs a typical outbound tool stack"
        description="Most of these capabilities exist somewhere in your current stack — the difference is that here they are one workspace and one payment."
      >
        <div className="surface-card mx-auto max-w-5xl overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40">
                <th className="px-6 py-4 font-semibold">Capability</th>
                <th className="px-6 py-4 font-semibold text-primary">MunchReach Lifetime</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground">
                  Typical outbound stack
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-border/50 last:border-0">
                  <td className="px-6 py-4 font-medium">{row.label}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-2 text-primary">
                      <CheckCircle2 className="size-4" /> {row.lifetime}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{row.stack}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 8 — WHO IS THIS FOR */}
      <Section
        muted
        title="Built for people who need more conversations, not more software."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <div key={a.label} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <a.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{a.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 9 — USE CASES */}
      <Section
        title="How teams use MunchReach"
        description="Practical ways the lifetime plan pays for itself."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {USE_CASES.map((u) => (
            <div key={u.title} className="surface-card p-8">
              <h3 className="text-lg font-semibold">{u.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{u.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 10 — SOCIAL PROOF */}
      <section className="border-y border-border/60 bg-secondary/40 py-16">
        <div className="mx-auto w-full max-w-[110rem] px-4 sm:px-8">
          <TestimonialCarousel />
        </div>
      </section>

      {/* 11 — AFTER PURCHASE */}
      <Section
        title="Get access in minutes."
        description="The lifetime plan is applied to your workspace automatically after a successful payment."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AFTER_PURCHASE.map((s) => (
            <div key={s.step} className="surface-card p-6">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {s.step}
              </span>
              <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 12 — TRUST */}
      <Section muted title="Checkout you can trust">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {TRUST.map((t) => (
            <div key={t.label} className="surface-card flex items-center gap-3 p-5">
              <t.icon className="size-5 shrink-0 text-primary" />
              <span className="text-sm font-medium">{t.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 13 — FAQ */}
      <Section>
        <FaqBlock
          faqs={FAQS}
          eyebrow="Lifetime FAQ"
          title="Questions about the lifetime deal"
          description="What you pay, what you get, and what happens next."
        />
      </Section>

      {/* 14 — FINAL CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-28 pt-16 sm:px-6">
        <div className="hero-glow surface-card px-6 py-16 text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" />
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to build your outbound engine?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Get MunchReach Lifetime today and stop adding another monthly outbound tool to your
            stack.
          </p>
          <p className="mt-8 text-5xl font-extrabold tracking-tight">{formatMoney(priceCents)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            One-time payment
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <a href={ctaHref}>Get Lifetime Access</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="/contact-support">Talk to us first</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Secure checkout • One-time payment • No recurring subscription
          </p>
        </div>
      </section>

      {/* 15 — STICKY CTA */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 transition-all duration-300",
          showSticky ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
        )}
      >
        <div className="mx-auto mb-4 flex w-[min(64rem,calc(100%-1.5rem))] flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-5 py-3 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] backdrop-blur-xl">
          <p className="text-sm font-semibold">
            MunchReach Lifetime — {formatMoney(priceCents)} one-time
          </p>
          <Button size="sm" asChild>
            <a href={ctaHref}>Get Lifetime Access</a>
          </Button>
        </div>
      </div>
    </MarketingLayout>
  );
}
