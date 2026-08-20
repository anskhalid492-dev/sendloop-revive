import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Rocket, Mail, Users, BarChart3, Shield, Terminal } from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  CtaBlock,
  DocSection,
  StepList,
  MockPanel,
  MockRows,
  PainPoints,
  FaqBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "Is the documentation free to read without an account?",
    a: "Yes, every page here is public. You only need an account when you're ready to connect a mailbox or call the API.",
  },
  {
    q: "Do you have documentation for agencies managing multiple clients?",
    a: "Yes — the Agency Ops section under Sending accounts and Workspaces covers multi-workspace structure, client permissions and white-label reporting.",
  },
  {
    q: "How current is this documentation?",
    a: "Docs are updated the same week a feature ships. Each page shows a last-updated date at the bottom so you know it reflects the current product.",
  },
  {
    q: "What if a doc page doesn't answer my question?",
    a: "Use the chat widget inside the app, or visit the Help Center for troubleshooting articles and a direct line to support.",
  },
  {
    q: "Do you have a changelog?",
    a: "Yes, linked from the app footer. Every release lists new features, fixes and any breaking API changes.",
  },
  {
    q: "Can I request a new doc topic?",
    a: "Absolutely — send a note through the contact page and we'll prioritize it, especially for common setup or integration questions.",
  },
];

export const Route = createFileRoute("/docs")({
  head: () =>
    metaFor(
      "Documentation — Setup, Sending, Campaigns & API",
      "Step-by-step documentation for connecting mailboxes, importing leads, building sequences, managing replies and reporting.",
      "/docs",
      faqs,
    ),
  component: Docs,
});

const painPoints = [
  {
    icon: Terminal,
    title: "Scattered setup instructions",
    text: "DNS records, mailbox limits and sequence rules end up spread across forum posts and support tickets instead of one source of truth.",
  },
  {
    icon: Shield,
    title: "Unclear security posture",
    text: "Teams need concrete answers on data isolation and encryption before they'll connect a production mailbox, not just marketing language.",
  },
  {
    icon: Users,
    title: "Onboarding new teammates is slow",
    text: "Without a documented workflow, every new hire relearns the same lessons about warmup, suppression and reply triage the hard way.",
  },
];

const groups = [
  {
    title: "Getting started",
    items: [
      "Create your account and first workspace",
      "Invite teammates and choose roles",
      "Workspace settings and branding",
      "Billing, plans and usage limits",
    ],
  },
  {
    title: "Sending accounts",
    items: [
      "Connect SMTP and IMAP mailboxes",
      "Connect SendGrid, SES, Mailgun, Postmark, Resend and ZeptoMail",
      "Publish SPF, DKIM and DMARC records",
      "Set daily limits, warmup and rotation",
    ],
  },
  {
    title: "Leads and lists",
    items: [
      "Import a CSV and map columns",
      "Duplicate detection and email validation",
      "Custom fields, tags and segments",
      "Suppression and do-not-contact lists",
    ],
  },
  {
    title: "Campaigns",
    items: [
      "Build a multi-step sequence",
      "Variables, fallbacks and spintax",
      "Conditional branching and stop rules",
      "Sending windows and timezone scheduling",
    ],
  },
  {
    title: "Inbox and reporting",
    items: [
      "Triage replies with AI labels",
      "Assign conversations and add notes",
      "Campaign, step and variant analytics",
      "Scheduled client reports and exports",
    ],
  },
  {
    title: "Security and compliance",
    items: [
      "Row-level security and workspace isolation",
      "Credential encryption at rest",
      "GDPR and CAN-SPAM guidance",
      "Data export and deletion requests",
    ],
  },
];

const iconFor = [Rocket, Mail, Users, BookOpen, BarChart3, Shield];

const quickstart = [
  { title: "Create a workspace", text: "Sign up, name your workspace, and invite teammates with the right roles." },
  { title: "Connect a mailbox", text: "Link SMTP/IMAP or a provider like SES or Postmark, then let warmup run for a few days." },
  { title: "Import your list", text: "Upload a CSV, map columns to fields, and let verification flag risky addresses." },
  { title: "Launch a sequence", text: "Build a 3–4 step campaign with variables, set a sending window, and start small." },
];

function Docs() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Documentation"
        title="Everything you need to"
        highlight="set up and scale"
        description="Practical guides for every part of MunchReach, from your first mailbox connection to multi-workspace agency reporting."
        primaryCta="Start for Free"
      />


      <Section title="Quickstart" description="From zero to your first sent sequence in four steps.">
        <StepList steps={quickstart} />
      </Section>

      <Section title="Browse the docs" muted>
        <DocSection
          groups={groups.map((g, i) => ({ ...g, title: g.title }))}
        />
      </Section>

      <Section title="What a connected mailbox looks like">
        <div className="mx-auto max-w-2xl">
          <MockPanel title="workspace.sendloop.app/mailboxes">
            <MockRows
              rows={[
                { left: "sales@acme.com", muted: "SES · warmup active", badge: "Healthy" },
                { left: "hello@acme.com", muted: "SMTP · 42/day limit", badge: "Healthy" },
                { left: "outreach@acmegrowth.io", muted: "Postmark · ramping", badge: "Warming" },
              ]}
            />
          </MockPanel>
        </div>
      </Section>

      <Section title="Popular articles" muted>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            "Why are my emails landing in spam?",
            "How mailbox rotation distributes volume",
            "Setting up a custom tracking domain",
            "Understanding reply detection and stop rules",
            "Migrating from another cold email tool",
            "Giving a client read-only reporting access",
          ].map((a) => (
            <div key={a} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              {a}
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Building an integration? See the{" "}
          <Link to="/api-docs" className="text-primary underline-offset-4 hover:underline">
            API reference
          </Link>
          .
        </p>
      </Section>

      <Section>
        <FaqBlock faqs={faqs}  />
      </Section>

      <TestimonialCarousel page="docs" />

      <CtaBlock
        title="Start sending in ten minutes"
        description="Follow the getting started guide and launch your first sequence today."
      />
    </MarketingLayout>
  );
}
