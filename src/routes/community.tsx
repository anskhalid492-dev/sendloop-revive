import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Facebook,
  Handshake,
  HeartHandshake,
  Lightbulb,
  MessagesSquare,
  Rocket,
  Share2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { MarketingLayout, Section, metaFor } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/lib/page-seo";
import { DEFAULT_COMMUNITY, safeExternalUrl } from "@/lib/community-model";
import { trackEvent } from "@/lib/site-analytics";

export const Route = createFileRoute("/community")({
  head: () =>
    metaFor(
      "MunchReach Community — Share Your Outbound Wins",
      "Join the MunchReach community: swap cold email playbooks, celebrate wins, get deliverability feedback and learn from other outbound teams.",
      "/community",
    ),
  component: CommunityPage,
});

const benefits = [
  {
    icon: Lightbulb,
    title: "Playbooks that actually shipped",
    text: "Real sequences, subject lines and offers from teams booking meetings this week — not recycled blog theory.",
  },
  {
    icon: MessagesSquare,
    title: "Feedback before you send",
    text: "Post a draft, get honest reactions on copy, targeting and timing from people who send every day.",
  },
  {
    icon: Trophy,
    title: "Wins worth celebrating",
    text: "Closed a deal from a cold email? Share it. Momentum is contagious and the details help everyone else.",
  },
  {
    icon: HeartHandshake,
    title: "Deliverability help, fast",
    text: "Warmup, DNS, bounce spikes — describe the symptom and get pointed at the fix instead of guessing.",
  },
  {
    icon: Handshake,
    title: "Partners and referrals",
    text: "Agencies, founders and SDR teams trade intros, lead sources and subcontracting work in the open.",
  },
  {
    icon: Rocket,
    title: "Early access to what's next",
    text: "Members see new MunchReach features first and shape the roadmap with direct feedback.",
  },
];

const wins = [
  {
    name: "Dana R.",
    role: "Founder, B2B data agency",
    quote:
      "Rewrote our first line after feedback in the group and reply rate went from 3% to 11% on the same list.",
    metric: "11% reply rate",
  },
  {
    name: "Marcus T.",
    role: "SDR lead, SaaS",
    quote:
      "Copied the two-step follow-up structure someone posted. Booked 14 meetings out of a 900-lead campaign.",
    metric: "14 meetings",
  },
  {
    name: "Priya S.",
    role: "Growth consultant",
    quote:
      "Members caught a DNS issue tanking my inbox placement within an hour. Deliverability recovered the same week.",
    metric: "Inbox rate restored",
  },
];

const postIdeas = [
  "The campaign, the numbers and what you changed",
  "A subject line that beat your control",
  "A deliverability problem you solved",
  "A question you're stuck on right now",
];

const steps = [
  {
    title: "Join the group",
    text: "One click, free, no application form. You're in the feed straight away.",
  },
  {
    title: "Introduce your motion",
    text: "Who you sell to, what you send and where you're stuck. Members answer faster when they know the context.",
  },
  {
    title: "Give before you ask",
    text: "Comment on one campaign teardown a week. The people who help get helped first.",
  },
];

const audiences = [
  {
    icon: Rocket,
    title: "Founders doing their own outbound",
    text: "You're the SDR, the copywriter and the closer. Skip the trial-and-error and copy what already works.",
  },
  {
    icon: Users,
    title: "SDR and sales teams",
    text: "Compare sequences, quotas and reply rates with teams running the same playbooks at your scale.",
  },
  {
    icon: Handshake,
    title: "Agencies and consultants",
    text: "Trade lead sources, subcontract overflow work and benchmark client results without leaking client names.",
  },
];

const postTypes = [
  { title: "Campaign teardowns", text: "Drop the sequence, the list and the numbers. Get line-by-line feedback." },
  { title: "Wins and screenshots", text: "Booked meetings, closed deals, reply-rate jumps — with the detail that made it happen." },
  { title: "Deliverability SOS", text: "Bounce spikes, spam placement, DNS and warmup questions answered by people who've fixed them." },
  { title: "List and data sources", text: "Where members find accurate B2B contacts, and which providers are worth the spend." },
  { title: "Offer and positioning help", text: "The offer beats the copy every time. Pressure-test yours before you send 1,000 emails." },
  { title: "Tooling and MunchReach tips", text: "AI personalization prompts, warmup settings, sending schedules and roadmap requests." },
];

const houseRules = [
  "Be specific — numbers, screenshots and context beat opinions.",
  "No pitching in the feed. Take offers to DMs when someone asks.",
  "Never post scraped lists, client names or anyone's personal data.",
  "Disagree with the tactic, not the person.",
  "If someone helps you, come back and post the result.",
];

const faqs = [
  {
    q: "Is it free?",
    a: "Yes. The community is free and open to anyone doing outbound — you don't need a MunchReach subscription to join.",
  },
  {
  q: "Where is it hosted?",
    a: "In the MunchReach Facebook Community, so conversations, notifications and search all work on a platform you already use daily.",
  },
  {
    q: "Do I have to post?",
    a: "No. Plenty of members read for weeks first. When you're ready, a single question is a perfectly good first post.",
  },
  {
    q: "Can I share client results?",
    a: "Absolutely — just anonymise the client and never post contact data or lists that aren't yours to share.",
  },
];


function CommunityPage() {
  const content = useSiteContent();
  const config = content?.community ?? DEFAULT_COMMUNITY;
  const externalUrl = safeExternalUrl(config.external_url);
  const ctaLabel = externalUrl
    ? "Join the Facebook Community"
    : config.cta_label || DEFAULT_COMMUNITY.cta_label;

  const join = (placement: string) => () =>
    trackEvent("community_join_click", { placement, has_destination: Boolean(externalUrl) });

  const JoinButton = ({
    placement,
    size = "lg",
    variant = "default",
    label = ctaLabel,
  }: {
    placement: string;
    size?: "lg" | "default";
    variant?: "default" | "outline";
    label?: string;
  }) =>
    externalUrl ? (
      <Button size={size} variant={variant} asChild>
        <a
          href={externalUrl}
          onClick={join(placement)}
          {...(config.open_in_new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          <Facebook className="size-4" aria-hidden />
          {label}
          <ArrowRight className="size-4" />
        </a>
      </Button>
    ) : (
      <Button size={size} variant={variant} disabled title="Community link coming soon">
        <Facebook className="size-4" aria-hidden />
        Community launching soon
      </Button>
    );

  return (
    <MarketingLayout>
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/10 via-secondary/25 to-background">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Users className="size-3.5 text-primary" /> MunchReach Community
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="hidden sm:block">
              Share Your Wins. Learn From Others.
              <br />
              Grow Your Outbound With the <span className="text-primary">MunchReach Community</span>.
            </span>
            <span className="sm:hidden">
              Share Your Wins. Learn From Others. Grow Your Outbound With the{" "}
              <span className="text-primary">MunchReach Community</span>.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Join founders, sales teams, and outbound professionals sharing campaigns, lessons,
            replies, experiments, and real results. Learn what is working, share what worked for
            you, and help others improve.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <JoinButton placement="hero" />
            <Button size="lg" variant="outline" asChild>
              <a href="#share-your-win">Share your win</a>
            </Button>
          </div>
          {!externalUrl ? (
            <p className="mt-4 text-xs text-muted-foreground">
              We're finalising the community space — check back shortly.
            </p>
          ) : null}
        </div>
      </section>

      <Section
        title="What is the MunchReach Community?"
        description="A free, members-only Facebook Community where people who send outbound for a living compare real numbers, real copy and real fixes — not recycled theory."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((item) => (
            <div key={item.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        muted
        title="How it works"
        description="Three small steps and you're part of the conversation — most people post their first question the same day."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="surface-card p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                {index + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <JoinButton placement="how-it-works" />
        </div>
      </Section>

      <Section
        title="Who it's for"
        description="Different roles, one shared problem: getting replies from people who never asked to hear from you."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {audiences.map((item) => (
            <div key={item.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        muted
        title="What you can post"
        description="The feed stays useful because the posts stay concrete. These are the threads members show up for."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {postTypes.map((item) => (
            <div key={item.title} className="surface-card p-6">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>



      <Section
        muted
        title="Wins from the community"
        description="A sample of the kind of results members post — specific, measurable and repeatable."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {wins.map((win) => (
            <figure key={win.name} className="surface-card flex h-full flex-col p-6">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" /> {win.metric}
              </span>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                “{win.quote}”
              </blockquote>
              <figcaption className="mt-5 text-sm font-semibold">
                {win.name}
                <span className="block text-xs font-normal text-muted-foreground">{win.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section
        id="share-your-win"
        title="Post your win"
        description="Every post helps someone else send a better campaign. Here's what's worth sharing."
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="surface-card p-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Share2 className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">Good posts are specific</h3>
            <ul className="mt-4 space-y-3">
              {postIdeas.map((idea) => (
                <li key={idea} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />
                  {idea}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <JoinButton placement="share-your-win" size="default" label="Post your win" />
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-secondary/40 to-background p-6">
            <div>
              <h3 className="text-lg font-bold">House rules</h3>
              <ul className="mt-4 space-y-2.5">
                {houseRules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <HeartHandshake className="mt-0.5 size-4 shrink-0 text-primary" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6">
              <JoinButton placement="house-rules" size="default" variant="outline" />
            </div>
          </div>
        </div>
      </Section>

      <Section
        muted
        title="Questions before you join"
        description="Everything members usually ask in the first five minutes."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {faqs.map((item) => (
            <div key={item.q} className="surface-card p-6">
              <h3 className="text-base font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </Section>



      <Section muted>
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-primary/12 via-secondary/40 to-background p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Join founders and outbound teams sending with MunchReach
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Free to join. Bring a question or a win — both are welcome.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <JoinButton placement="footer-cta" />
            <Button size="lg" variant="outline" asChild>
              <a href="/pricing">See pricing</a>
            </Button>
          </div>
        </div>
      </Section>
    </MarketingLayout>
  );
}
