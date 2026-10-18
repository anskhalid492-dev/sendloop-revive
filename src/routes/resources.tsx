import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Code2,
  FileText,
  GraduationCap,
  LifeBuoy,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { CtaBlock, MarketingLayout, PageHero, Section, metaFor } from "@/components/site/MarketingPage";

const resources = [
  {
    to: "/blog",
    icon: BookOpen,
    title: "Blog",
    text: "Cold email strategy, deliverability and outbound playbooks from the MunchReach team.",
  },
  {
    to: "/docs",
    icon: FileText,
    title: "Documentation",
    text: "Set up domains, mailboxes, campaigns and automations step by step.",
  },
  {
    to: "/api-docs",
    icon: Code2,
    title: "API documentation",
    text: "The MunchReach public API: leads, campaigns, mailboxes, replies and webhooks.",
  },
  {
    to: "/deliverability-guide",
    icon: ShieldCheck,
    title: "Deliverability guide",
    text: "Key factors that can influence email delivery and inbox placement, with practical monitoring guidance.",
  },
  {
    to: "/cold-email-templates",
    icon: Sparkles,
    title: "Cold email templates",
    text: "Proven sequences you can copy into a campaign and personalize with AI.",
  },
  {
    to: "/integrations",
    icon: Plug,
    title: "Integrations",
    text: "Connect Claude, OpenAI, your CRM, Slack, Zapier, Make and more.",
  },
  {
    to: "/user-guide",
    icon: GraduationCap,
    title: "User guide & alerts",
    text: "Product guides, incident notices and platform updates.",
  },
  {
    to: "/help-center",
    icon: LifeBuoy,
    title: "Help center",
    text: "Answers to the questions customers ask us most, plus how to reach support.",
  },
];

export const Route = createFileRoute("/resources")({
  head: () =>
    metaFor(
      "MunchReach Resources — Guides, Docs, API & Templates",
      "Everything you need to run cold outreach on MunchReach: documentation, API reference, deliverability guide, templates, integrations and support.",
      "/resources",
    ),
  component: Resources,
});

function Resources() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Resources"
        title="Everything you need"
        highlight="to run better outbound"
        description="Guides, documentation, the public API reference, templates and integrations — all in one place."
        secondaryCta="Browse resources"
        secondaryHref="#library"
      />

      <Section id="library" title="Resource library" description="Pick the shortest path to what you need.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resources.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="surface-card group flex flex-col p-6 transition-transform hover:-translate-y-0.5"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <item.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBlock
        title="Ready to send your first campaign?"
        description="Import your leads, connect your AI provider and let MunchReach handle the sending."
        secondaryCta="See pricing"
        secondaryHref="/pricing"
      />
    </MarketingLayout>
  );
}
