import { createFileRoute } from "@tanstack/react-router";
import {
  Target,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Inbox,
  AlertTriangle,
  Files,
} from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  FeatureGrid,
  StepList,
  StatStrip,
  QuoteBlock,
  PainPoints,
  FaqBlock,
  CtaBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "Is Sendloop a big company or a small team?",
    a: "We're a focused, remote-first team. Small enough to ship fast, big enough to run infrastructure for thousands of teams.",
  },
  {
    q: "Do you build your own sending infrastructure?",
    a: "We integrate with best-in-class providers and layer our own warmup, rotation and deliverability monitoring on top.",
  },
  {
    q: "Who is Sendloop built for?",
    a: "Agencies, SDR teams and founders doing cold outbound who care about inbox placement as much as volume.",
  },
  {
    q: "Do you offer an agency or white-label plan?",
    a: "Yes — multi-workspace agency mode with client-level reporting is available on our Agency plan.",
  },
  {
    q: "How can I reach the team?",
    a: "Use the contact page, or email us directly — most messages get a reply within one business day.",
  },
];

export const Route = createFileRoute("/about")({
  head: () =>
    metaFor(
      "About Sendloop — The Team Behind Better Cold Email",
      "We build cold email infrastructure for agencies and sales teams who care about deliverability, reply quality and clean data.",
      "/about",
      faqs,
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
  { title: "2023 — The spark", text: "Started as an internal tool for a five-person outbound agency drowning in mailboxes." },
  { title: "2024 — Public launch", text: "Opened to the public with multi-provider sending, warmup and suppression lists." },
  { title: "2025 — Unified inbox", text: "Launched the shared inbox with AI reply classification and auto-categorisation." },
  { title: "2026 — Scale", text: "Multi-workspace agency mode, public API and reporting for 2,000+ teams." },
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
        eyebrow="About"
        title="We build the outbound stack"
        highlight="we wished we had"
        description="Sendloop started inside an agency drowning in mailboxes, spreadsheets and missed replies. We built the tool that fixed it, then opened it to everyone."
        primaryCta="Start for Free"
        secondaryCta="Our Story"
        secondaryHref="#product"
      />


      <Section title="Our mission" muted>
        <p className="max-w-3xl text-muted-foreground">
          Make outbound email a reliable, repeatable channel — not a game of chance. We want every team on Sendloop to
          know exactly why a message landed, bounced or got a reply, and to have the controls to fix it before reputation
          damage happens.
        </p>
      </Section>

      <Section title="What we believe">
        <FeatureGrid items={values} />
      </Section>

      <Section title="How we got here" muted>
        <StepList steps={milestones} />
      </Section>

      <Section title="By the numbers">
        <StatStrip stats={stats} />
      </Section>

      <Section muted>
        <QuoteBlock
          quote="We moved eleven client accounts to Sendloop in a weekend and our reply rate went up in the first month. It's the first tool that treats deliverability as a first-class feature."
          name="Priya Nair"
          role="Founder, Outbound Collective"
        />
      </Section>

      <Section title="Frequently Asked Questions">
        <FaqBlock faqs={faqs} />
      </Section>

      <TestimonialCarousel page="about" />

      <CtaBlock title="Come build pipeline with us" description="Create a free workspace and see why outbound teams switch to Sendloop." />
    </MarketingLayout>
  );
}
