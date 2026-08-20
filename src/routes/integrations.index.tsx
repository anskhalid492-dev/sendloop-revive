import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import {
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  PageHero,
  Section,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Badge } from "@/components/ui/badge";
import { INTEGRATIONS, INTEGRATION_CATEGORIES, categoryLabel } from "@/lib/integrations-catalog";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "Do I connect an email provider here?",
    a: "No. MunchReach operates the sending infrastructure. Integrations connect the other tools in your stack — AI, CRM, automation, calendar, notifications and spreadsheets.",
  },
  {
    q: "Where do I connect an integration?",
    a: "Inside your workspace under Settings → Integrations. Only workspace owners and admins can connect or disconnect.",
  },
  {
    q: "Are my API keys safe?",
    a: "Keys are encrypted before they are stored and are never returned to the browser — you only ever see a masked hint.",
  },
  {
    q: "Can data flow back into MunchReach?",
    a: "Yes. Zapier and Make can push new leads into your workspace through a private inbound URL that is unique to your connection.",
  },
];

export const Route = createFileRoute("/integrations/")({
  head: () =>
    metaFor(
      "Integrations — Connect MunchReach to your stack | MunchReach",
      "Connect MunchReach to OpenAI, Slack, Zapier, Make, HubSpot, GoHighLevel, Calendly and Google Sheets. Encrypted credentials, event logs and two-way automation.",
      "https://sendloop.lovable.app/integrations",
      faqs,
    ),
  component: IntegrationsDirectory,
});

function IntegrationsDirectory() {
  const [category, setCategory] = useState<string>("all");

  const items = useMemo(
    () => (category === "all" ? INTEGRATIONS : INTEGRATIONS.filter((i) => i.category === category)),
    [category],
  );

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Integrations"
        title="MunchReach fits into"
        highlight="the stack you already use"
        description="MunchReach runs your sending infrastructure. Integrations connect everything around it — AI copy, CRM records, automation platforms, calendars, Slack alerts and spreadsheets."
        secondaryCta="Browse integrations"
        secondaryHref="#directory"
      />

      <Section
        id="directory"
        title="Every MunchReach integration"
        description="Connect in a minute from Settings → Integrations. No email provider setup — ever."
      >
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", label: "All" }, ...INTEGRATION_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                category === c.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.slug}
              to="/integrations/$slug"
              params={{ slug: item.slug }}
              className="surface-card group flex flex-col p-6 transition-transform hover:-translate-y-0.5"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <item.icon className="size-5" />
              </span>
              <div className="mt-4 flex items-center gap-2">
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {categoryLabel(item.category)}
                </Badge>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.tagline}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Learn more
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section muted title="How an integration works">
        <WorkflowStrip
          steps={[
            { title: "Connect", text: "Paste your key or webhook URL — MunchReach verifies it live." },
            { title: "Choose events", text: "Pick the MunchReach events that should be delivered." },
            { title: "Automatic delivery", text: "Replies, leads and meetings flow to your tools instantly." },
            { title: "Full log", text: "Every attempt is logged, with one-click retry on failures." },
          ]}
        />
      </Section>

      <TestimonialCarousel page="integrations" />

      <Section>
        <FaqBlock faqs={faqs} description="Questions about connecting MunchReach to your tools." />
      </Section>

      <CtaBlock
        title="Ready to simplify your cold outreach?"
        description="Start free, import your leads, and let MunchReach handle the sending."
        secondaryCta="See how it works"
        secondaryHref="/features"
      />
    </MarketingLayout>
  );
}
