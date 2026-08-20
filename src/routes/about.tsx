import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Compass,
  Files,
  Flag,
  HeartHandshake,
  Inbox,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  FeatureGrid,
  StatStrip,
  PainPoints,
  CtaBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";


export const Route = createFileRoute("/about")({
  head: () =>
    metaFor(
      "About Sendloop — Why We Built It and Where It's Going",
      "Sendloop started inside a five-person outbound agency drowning in mailboxes. This is the story, what we learned, and what we're building next.",
      "/about",
    ),
  component: About,
});

const problems = [
  { icon: Inbox, title: "Mailbox chaos", text: "Ten SDRs, ten inboxes, zero visibility into what actually got a reply." },
  { icon: AlertTriangle, title: "Reputation roulette", text: "One bad list could burn a domain that took months to warm up." },
  { icon: Files, title: "Spreadsheet glue", text: "Leads, sequences and replies stitched together with CSVs and manual copy-paste." },
];

const values = [
  { icon: Target, title: "Replies over volume", text: "Anyone can send more email. We optimise for conversations that turn into pipeline." },
  { icon: ShieldCheck, title: "Deliverability first", text: "Every feature is judged on whether it protects or damages sender reputation." },
  { icon: HeartHandshake, title: "Respect the recipient", text: "Honest opt-outs, honest claims and suppression that actually works." },
  { icon: Sparkles, title: "Boring reliability", text: "Sending is infrastructure. It should be predictable, observable and dull." },
];

const milestones = [
  {
    year: "2023",
    title: "The spark",
    text: "Sendloop started as an internal tool for a five-person outbound agency drowning in mailboxes — built to answer one question nobody could answer: which message actually got the reply?",
  },
  {
    year: "2024",
    title: "Public launch",
    text: "Opened to the public with multi-provider sending, warmup and suppression lists. Bringing your own domains and mailboxes was the default from day one.",
  },
  {
    year: "2025",
    title: "Unified inbox",
    text: "Launched the shared inbox with AI reply classification and auto-categorisation, so replies stopped being the step where outbound quietly broke.",
  },
  {
    year: "2026",
    title: "Scale",
    text: "Multi-workspace agency mode, public API and reporting for 2,000+ teams — the same product, now running other people's client rosters.",
  },
];

const lessons = [
  {
    icon: ShieldCheck,
    title: "Reputation is the product",
    text: "Every feature that raised volume without protecting inbox placement made results worse. Warmup, per-mailbox limits and automatic pausing came out of that.",
  },
  {
    icon: Inbox,
    title: "The reply is the hard part",
    text: "Sending was never the bottleneck. Handling what comes back — quickly, as a team, without losing context — is where deals are won or dropped.",
  },
  {
    icon: Files,
    title: "Separate tools separate the truth",
    text: "Once campaign data, replies and contacts lived in different systems, nobody trusted the reporting. Consolidating them was the only fix that held.",
  },
];

const stats = [
  { value: "2,000+", label: "Teams sending with Sendloop" },
  { value: "180M", label: "Emails delivered" },
  { value: "96.4%", label: "Median inbox placement" },
  { value: "<1 day", label: "Median support response" },
];

function About() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Our story"
        title="We built the outbound stack"
        highlight="we wished we had"
        description="Sendloop began inside an agency drowning in mailboxes, spreadsheets and missed replies. We fixed it for ourselves first, then opened it to everyone."
      />

      <Section title="Where it started">
        <div className="mx-auto max-w-3xl space-y-4 text-muted-foreground">
          <p>
            In 2023 we were a five-person outbound agency. Sending was never the problem — we had mailboxes, we had
            lists, we had volume. What we didn't have was an answer to the simplest question a client could ask:
            <em> which message got that reply, and can we do it again?</em>
          </p>
          <p>
            The sequencer knew about sends. A separate provider knew about deliverability. A warmup service knew about
            mailbox health. Replies sat in ten different inboxes, and the pipeline lived in a spreadsheet somebody
            updated on Fridays. Every report was a reconciliation exercise.
          </p>
          <p>
            So we built an internal tool that put the campaign, the mailbox, the reply and the contact in the same
            place. It wasn't ambitious. It just meant we stopped guessing.
          </p>
        </div>
      </Section>

      <Section muted title="The problem we wanted to solve">
        <PainPoints items={problems} />
      </Section>

      <Section title="How it evolved" description="Four moments that shaped what Sendloop is today.">
        <ol className="relative mx-auto max-w-3xl space-y-5 sm:before:absolute sm:before:bottom-8 sm:before:left-[15px] sm:before:top-8 sm:before:w-px sm:before:bg-border">
          {milestones.map((m) => (
            <li key={m.year} className="relative flex gap-5">
              <span className="relative z-10 mt-6 hidden size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card sm:flex">
                <span className="size-2.5 rounded-full bg-primary" />
              </span>
              <div className="surface-card flex-1 p-6">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{m.year}</span>
                <h3 className="mt-2 text-lg font-semibold">{m.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{m.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section muted title="What we learned">
        <FeatureGrid items={lessons} />
      </Section>

      <Section title="Why we're building Sendloop differently">
        <div className="mx-auto max-w-3xl space-y-4 text-muted-foreground">
          <p>
            Most outbound tools rent you their infrastructure and keep the reputation. We took the opposite position:
            you verify your own domains, you connect your own mailboxes, and the credentials stay encrypted and yours.
            If you ever leave, the assets that make your email land leave with you.
          </p>
          <p>
            The second difference is scope. Campaigns, unified inbox, CRM, warmup, analytics and automation are one
            product because they're one workflow. Nothing gets exported between stages, so the numbers agree with each
            other by construction.
          </p>
          <p>
            The third is restraint. AI writes personalization and classifies replies. It does not make sending
            decisions for you, and it does not pretend a bad list is a copy problem.
          </p>
        </div>
      </Section>

      <Section muted title="Vision, mission and belief">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            {
              icon: Compass,
              title: "Our vision",
              body: "Outbound email as dependable infrastructure — a channel teams can plan around instead of a game of chance.",
            },
            {
              icon: Flag,
              title: "Our mission",
              body: "Give every team the controls and evidence to know why a message landed, bounced or got a reply — and to fix it before reputation damage happens.",
            },
            {
              icon: RouteIcon,
              title: "What we believe",
              body: "That reputation belongs to the sender, that replies matter more than opens, and that the recipient's inbox is not ours to waste.",
            },
          ].map((c) => (
            <div key={c.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <c.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The principles we hold to">
        <FeatureGrid items={values} />
      </Section>

      <Section muted title="By the numbers">
        <StatStrip stats={stats} />
      </Section>

      <Section title="Where we're going">
        <div className="mx-auto max-w-3xl space-y-4 text-muted-foreground">
          <p>
            The near-term work is depth, not surface area: richer automation across every object in the workspace,
            deeper integrations so outcomes flow back into the systems teams already run, and reporting that agencies
            can hand to a client without editing it first.
          </p>
          <p>
            Underneath that, the same commitment we started with — infrastructure you own, deliverability treated as a
            first-class feature, and a product that is predictable enough to be boring.
          </p>
          <blockquote className="rounded-2xl border border-border bg-card p-6 text-foreground">
            <p className="text-base font-medium">
              &ldquo;We built Sendloop because we needed it. Every decision since has been made the same way: would we
              trust this with our own clients' domains?&rdquo;
            </p>
            <footer className="mt-3 text-sm text-muted-foreground">— The Sendloop team</footer>
          </blockquote>
        </div>
      </Section>

      <TestimonialCarousel page="about" />


      <CtaBlock
        title="Come build pipeline with us"
        description="Create a free workspace and see why outbound teams switch to Sendloop."
      />
    </MarketingLayout>
  );
}
