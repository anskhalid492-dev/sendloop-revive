import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Inbox,
  Layers,
  Mail,
  Repeat,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import {
  BigPreview,
  CtaBlock,
  FaqBlock,
  FeatureBento,
  MarketingLayout,
  MockBars,
  MockPanel,
  MockRows,
  PageHero,
  Section,
  StatStrip,
  WorkflowStrip,
  faqJsonLd,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "Do I need my own sending provider?",
    a: "No. MunchReach runs the sending infrastructure for you — mailboxes, warmup, routing and deliverability monitoring are all included.",
  },
  {
    q: "Can I run multiple sequences at once?",
    a: "Yes. Campaigns run in parallel with shared daily caps per mailbox, so volume stays inside safe limits automatically.",
  },
  {
    q: "How are replies handled?",
    a: "Replies land in the unified inbox, get classified, and automatically stop follow-ups for that contact.",
  },
  {
    q: "Does MunchReach work for agencies?",
    a: "Workspaces keep each client's leads, campaigns, mailboxes and reporting fully separated under one login.",
  },
];

export const Route = createFileRoute("/features")({
  head: () => ({
    ...metaFor(
      "Features — Everything in MunchReach",
      "Sequences, managed sending, warmup, unified inbox, CRM and analytics — the full MunchReach feature set in one place.",
      "/features",
    ),
    scripts: [faqJsonLd(faqs)],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Features"
        title="Everything you need to run"
        highlight="cold outreach end to end"
        description="MunchReach handles your email sending infrastructure so your team can focus on sequences, replies and pipeline."
        secondaryCta="See the Product ↓"
      />

      <BigPreview
        eyebrow="Product"
        title="One workspace, the whole outbound loop"
        description="Build a sequence, launch it, and work replies without leaving MunchReach."
      >
        <MockPanel title="app.munchreach.com/dashboard">
          <MockRows
            rows={[
              { left: "Q3 Founders — Step 2", muted: "412 sent today", badge: "Active", right: "31% reply" },
              { left: "SaaS Ops — Step 1", muted: "180 sent today", badge: "Sending", right: "18% reply" },
              { left: "Agency Partners — Step 3", muted: "96 queued", badge: "Scheduled", right: "—" },
            ]}
          />
          <div className="mt-4">
            <MockBars bars={[{ label: "Sent", value: 92 }, { label: "Delivered", value: 88 }, { label: "Replies", value: 27 }, { label: "Positive", value: 14 }]} />
          </div>
        </MockPanel>
      </BigPreview>

      <Section
        title="The core feature set"
        description="Grouped by the job it does, not by a marketing checklist."
      >
        <FeatureBento
          items={[
            { icon: Mail, title: "Sequence builder", text: "Multi-step campaigns with per-step wait windows, variables and A/B variants." },
            { icon: Repeat, title: "Smart follow-ups", text: "Chase automatically and stop instantly on reply, bounce or unsubscribe." },
            { icon: ShieldCheck, title: "Managed sending", text: "Mailboxes, provider routing and warmup are operated by MunchReach." },
            { icon: Inbox, title: "Unified inbox", text: "Every reply from every mailbox in one shared, assignable inbox." },
            { icon: Users, title: "CRM", text: "Contacts, companies, pipeline stages and tasks tied to campaign history." },
            { icon: BarChart3, title: "Analytics", text: "Sent, delivered, replies, positive replies and per-mailbox performance." },
            { icon: Layers, title: "Workspaces", text: "Client separation, roles and permissions built for agencies." },
            { icon: Sparkles, title: "Templates", text: "Reusable cold emails, follow-ups, subject lines and saved replies." },
          ]}
        />
      </Section>

      <Section muted title="How the pieces fit together">
        <WorkflowStrip
          steps={[
            { title: "Import leads", text: "CSV import with mapping, validation and deduplication." },
            { title: "Build the sequence", text: "Steps, delays, personalization and variants." },
            { title: "MunchReach sends", text: "Routing, throttling and warmup are handled for you." },
            { title: "Work replies", text: "Classify, assign and push to CRM in the unified inbox." },
          ]}
        />
      </Section>

      <Section>
        <StatStrip
          stats={[
            { value: "8", label: "products in one workspace" },
            { value: "0", label: "API keys to configure" },
            { value: "24/7", label: "deliverability monitoring" },
          ]}
        />
      </Section>

      <TestimonialCarousel page="features" />

      <Section muted>
        <FaqBlock faqs={faqs} description="Common questions about the MunchReach feature set." />
      </Section>

      <CtaBlock
        title="Ready to simplify your cold outreach?"
        description="Launch campaigns, automate follow-ups, manage replies and track results from one workspace."
        secondaryCta="See How It Works"
        secondaryHref="#product"
      />
    </MarketingLayout>
  );
}
