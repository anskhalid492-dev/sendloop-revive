import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  PageHero,
  Section,
  StepList,
  metaFor,
} from "@/components/site/MarketingPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INTEGRATIONS_BY_SLUG, categoryLabel } from "@/lib/integrations-catalog";

export const Route = createFileRoute("/integrations/$slug")({
  loader: ({ params }) => {
    if (!INTEGRATIONS_BY_SLUG[params.slug]) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const meta = INTEGRATIONS_BY_SLUG[params.slug];
    if (!meta) {
      return {
        meta: [
          { title: "Integration not found — MunchReach" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    return metaFor(
      `${meta.name} Integration — Cold Email Automation | MunchReach`,
      meta.description.slice(0, 155),
      `https://sendloop.lovable.app/integrations/${meta.slug}`,
      meta.faqs,
    );
  },
  notFoundComponent: IntegrationNotFound,
  errorComponent: IntegrationNotFound,
  component: IntegrationDetail,
});

function IntegrationNotFound() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-xl px-4 py-28 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Integration not found</h1>
        <p className="mt-3 text-muted-foreground">
          That integration does not exist. Browse everything MunchReach connects to instead.
        </p>
        <Button className="mt-8" asChild>
          <Link to="/integrations">All integrations</Link>
        </Button>
      </div>
    </MarketingLayout>
  );
}

function IntegrationDetail() {
  const { slug } = Route.useLoaderData();
  const meta = INTEGRATIONS_BY_SLUG[slug];
  if (!meta) return <IntegrationNotFound />;

  return (
    <MarketingLayout>
      <PageHero
        eyebrow={`${categoryLabel(meta.category)} integration`}
        title={`${meta.name} +`}
        highlight="MunchReach"
        description={meta.description}
        secondaryCta="Connect in your workspace"
        secondaryHref="/settings"
      />

      <Section title={`What the ${meta.name} integration does`}>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="surface-card p-6">
            <BulletList items={meta.features} />
          </div>
          <div className="surface-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Events delivered
            </h3>
            {meta.events.length ? (
              <ul className="mt-4 space-y-2">
                {meta.events.map((e) => (
                  <li key={e} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-primary" />
                    <code className="font-mono text-xs">{e}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                This integration is used inside the app rather than receiving events.
              </p>
            )}
            {meta.inbound ? (
              <Badge variant="secondary" className="mt-4">
                Two-way — can also create leads in MunchReach
              </Badge>
            ) : null}
            <a
              href={meta.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              {meta.name} documentation <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </Section>

      <Section muted title="Setting it up">
        <StepList steps={meta.steps} />
      </Section>

      <Section>
        <FaqBlock faqs={meta.faqs} description={`Common questions about ${meta.name} and MunchReach.`} />
      </Section>

      <CtaBlock
        title={`Connect ${meta.name} to MunchReach`}
        description="Start free, import your leads, and let MunchReach handle the sending."
        secondaryCta="All integrations"
        secondaryHref="/integrations"
      />
    </MarketingLayout>
  );
}
