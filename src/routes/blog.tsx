import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  CtaBlock,
  ResourceList,
  StatStrip,
  QuoteBlock,
  FaqBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "How often do you publish new posts?",
    a: "New long-form posts land every week, with shorter tactical notes and benchmark updates in between. Subscribe below to get them by email.",
  },
  {
    q: "Do you cover tools other than Sendloop?",
    a: "Yes — most posts are platform-agnostic. When we reference specific features they are called out so the underlying tactic still applies elsewhere.",
  },
  {
    q: "Can I contribute a guest post?",
    a: "We occasionally run practitioner interviews and case studies from agencies and in-house teams. Reach out through the contact page with a short pitch.",
  },
  {
    q: "Where do the benchmark numbers come from?",
    a: "Aggregated, anonymized send data across Sendloop workspaces, refreshed quarterly and broken out by industry and list size where sample size allows.",
  },
  {
    q: "Is there an RSS feed?",
    a: "Yes, every category has its own feed alongside the main blog feed, linked from the footer.",
  },
];

export const Route = createFileRoute("/blog")({
  head: () =>
    metaFor(
      "Cold Email Blog — Tactics, Deliverability & Outbound Playbooks",
      "Practical guides on cold email copywriting, deliverability, sequence design, list building and outbound team operations.",
      "/blog",
      faqs,
    ),
  component: Blog,
});

const categories = ["All", "Deliverability", "Copywriting", "Lead Data", "Sequences", "Agency Ops", "Analytics"];

const featured = {
  title: "We Analyzed 1.2M Cold Emails. Here Is What Actually Drives Replies.",
  category: "Analytics",
  date: "August 11, 2026",
  read: "12 min read",
  excerpt:
    "Subject line length, send time, thread structure and personalization depth — we isolated each variable across a year of anonymized send data and ranked them by real impact on reply rate. Word count mattered less than we expected; the number of questions asked in the body mattered more.",
};

const posts = [
  {
    title: "The 3-Email Sequence That Books Meetings",
    text: "A short, specific opener, a value bump, and a graceful breakup. We break down each message line by line and show the reply rates from 1.2M sends.",
    meta: "Sequences · 7 min read",
  },
  {
    title: "SPF, DKIM and DMARC Explained for Sales Teams",
    text: "What each record actually does, the exact DNS entries to publish, and how to verify alignment before you send a single cold email.",
    meta: "Deliverability · 9 min read",
  },
  {
    title: "How Long Should You Warm Up a New Domain?",
    text: "Two to four weeks is the common answer, but the right ramp depends on domain age, provider and how aggressive your volume plans are.",
    meta: "Deliverability · 6 min read",
  },
  {
    title: "Writing Cold Emails That Do Not Sound Like Templates",
    text: "Personalization is not a first name token. Here are five research angles that take 30 seconds per prospect and lift replies substantially.",
    meta: "Copywriting · 8 min read",
  },
  {
    title: "Building a Clean Lead List From Scratch",
    text: "Sourcing, enrichment, verification and suppression — the full workflow for a list that will not burn your sending reputation.",
    meta: "Lead Data · 10 min read",
  },
  {
    title: "Reply Rate Benchmarks by Industry in 2026",
    text: "Median reply rates across SaaS, recruiting, agencies and local services, plus what separates the top decile from everyone else.",
    meta: "Analytics · 5 min read",
  },
  {
    title: "How Agencies Run 40 Client Workspaces Without Chaos",
    text: "Workspace structure, role design, reporting cadence and the automations that keep an outbound agency profitable at scale.",
    meta: "Agency Ops · 7 min read",
  },
  {
    title: "Why Your Follow-Ups Are Hurting Your Reply Rate",
    text: "Sending more is not sending better. Cadence, thread behaviour and stop rules matter more than the number of touches.",
    meta: "Sequences · 6 min read",
  },
  {
    title: "Open Tracking Is Broken — Measure This Instead",
    text: "Privacy proxies inflate opens by up to 40%. Here is how to build a reporting stack around replies, meetings and pipeline instead.",
    meta: "Analytics · 5 min read",
  },
  {
    title: "The Anatomy of a Subject Line That Gets Opened",
    text: "Lowercase, specific, and under 45 characters wins consistently in our data. We show the ten patterns that outperform generic hooks.",
    meta: "Copywriting · 6 min read",
  },
  {
    title: "When to Fire a Client (Agency Edition)",
    text: "Unrealistic volume expectations and refusal to fix a broken domain are the two biggest predictors of a doomed outbound engagement.",
    meta: "Agency Ops · 8 min read",
  },
  {
    title: "Mailbox Rotation: The Math Behind Safe Daily Volume",
    text: "How many mailboxes you actually need for a given list size, and the formula we use internally to keep bounce rate under 2%.",
    meta: "Deliverability · 7 min read",
  },
];

const stats = [
  { value: "1.2M+", label: "Emails analyzed for benchmarks" },
  { value: "180+", label: "Published guides and teardowns" },
  { value: "42K", label: "Newsletter subscribers" },
  { value: "Weekly", label: "New long-form posts" },
];

function Blog() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Blog"
        title="Outbound tactics that"
        highlight="actually get replies"
        description="Deliverability deep dives, copywriting teardowns and operational playbooks from teams sending millions of cold emails."
        primaryCta="Start for Free"
      />


      <Section title="Browse by category">
        <div className="flex flex-wrap gap-2">
          {categories.map((c, i) => (
            <span
              key={c}
              className={
                i === 0
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              }
            >
              {c}
            </span>
          ))}
        </div>

        <article className="surface-card mt-8 grid gap-6 p-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
              Featured · {featured.category}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{featured.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{featured.excerpt}</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{featured.date}</span>
              <span>·</span>
              <span>{featured.read}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/40 p-6">
            <StatStrip stats={stats} />
          </div>
        </article>

        <div className="mt-10">
          <ResourceList items={posts} />
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Looking for step-by-step product instructions instead?{" "}
          <Link to="/docs" className="text-primary underline-offset-4 hover:underline">
            Read the documentation
          </Link>
          .
        </p>
      </Section>

      <Section muted>
        <QuoteBlock
          quote="Sendloop's blog is the only outbound content I actually trust — every claim comes with a number attached."
          name="Priya Nair"
          role="Head of Growth, Fintech scale-up"
        />
      </Section>

      <Section>
        <div className="surface-card flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Mail className="size-6" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Get new posts in your inbox</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            One email a week. No fluff, just tactics and benchmarks from real sends. Unsubscribe anytime.
          </p>
          <form className="mt-2 flex w-full max-w-sm flex-col gap-2 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="you@company.com"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Subscribe
            </button>
          </form>
        </div>
      </Section>

      <Section title="Frequently Asked Questions" muted>
        <FaqBlock faqs={faqs} />
      </Section>

      <TestimonialCarousel page="blog" />

      <CtaBlock
        title="Put these tactics to work"
        description="Create a workspace, connect your provider and launch a campaign built on what already works."
      />
    </MarketingLayout>
  );
}
