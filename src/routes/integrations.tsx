import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, MessageSquare, Share2, Users, Workflow, Zap } from "lucide-react";

import {
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  PageHero,
  Section,
  WorkflowStrip,
  faqJsonLd,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Badge } from "@/components/ui/badge";

const groups = [
  {
    title: "CRM",
    icon: Users,
    tools: ["HubSpot", "Pipedrive", "Salesforce", "GoHighLevel"],
  },
  { title: "Automation", icon: Workflow, tools: ["Zapier", "Make"] },
  { title: "Calendar", icon: CalendarClock, tools: ["Calendly", "Google Calendar", "Microsoft Calendar"] },
  { title: "Notifications", icon: MessageSquare, tools: ["Slack"] },
  { title: "Data", icon: Share2, tools: ["CSV import", "CSV export"] },
];

const faqs = [
  {
    q: "Do I connect an email provider here?",
    a: "No. Sendloop operates the sending infrastructure. Integrations are for the other tools in your stack.",
  },
  {
    q: "Which integrations are live today?",
    a: "CSV import and export are available now. CRM, automation, calendar and notification connections are marked coming soon until they ship.",
  },
  {
    q: "Can I push replies into my CRM?",
    a: "That is exactly what the CRM connections are being built for — positive replies and meetings sync to your pipeline.",
  },
  {
    q: "Will there be a public API?",
    a: "A public API is on the roadmap. It is not part of the customer dashboard today.",
  },
];

export const Route = createFileRoute("/integrations")({
  head: () => ({
    ...metaFor(
      "Integrations — Sendloop",
      "Connect Sendloop to your CRM, automation tools, calendar and Slack. Sending infrastructure is managed by Sendloop.",
      "/integrations",
    ),
    scripts: [faqJsonLd(faqs)],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Integrations"
        title="Sendloop fits into"
        highlight="the stack you already use"
        description="Sendloop runs your sending infrastructure. Integrations connect the rest of your workflow — CRM, automation, calendar and notifications."
        secondaryCta="Explore Integrations"
        secondaryHref="#product"
      />

      <Section id="product" title="Available and coming soon" description="No email provider setup — ever.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <g.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{g.title}</h3>
              <ul className="mt-4 space-y-2">
                {g.tools.map((tool) => {
                  const live = tool.startsWith("CSV");
                  return (
                    <li key={tool} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{tool}</span>
                      <Badge variant={live ? "secondary" : "outline"} className="shrink-0 text-xs">
                        {live ? "Available" : "Coming soon"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section muted title="How an integration works">
        <WorkflowStrip
          steps={[
            { title: "Reply arrives", text: "A prospect answers and lands in the unified inbox." },
            { title: "Classified", text: "Interested, not interested, out of office or wrong person." },
            { title: "Synced", text: "Positive replies flow to your CRM as contacts and deals." },
            { title: "Team notified", text: "Slack pings the owner so nothing waits a day." },
          ]}
        />
      </Section>

      <TestimonialCarousel page="integrations" />

      <Section>
        <FaqBlock faqs={faqs} description="Questions about connecting Sendloop to your tools." />
      </Section>

      <CtaBlock
        title="Ready to simplify your cold outreach?"
        description="Start free, import your leads, and let Sendloop handle the sending."
        secondaryCta="See How It Works"
        secondaryHref="#product"
      />

      <p className="sr-only">
        <Zap className="size-4" aria-hidden="true" /> Integrations overview
      </p>
    </MarketingLayout>
  );
}
