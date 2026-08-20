import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search, Sparkles, ShieldCheck, X } from "lucide-react";

import { MarketingLayout, Section, FaqBlock, CtaBlock, metaFor } from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { CopyButton } from "@/components/site/CopyButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { stashPendingTemplate } from "@/lib/templates-model";
import {
  COLD_EMAIL_TEMPLATES,
  PERSONALIZATION_TIPS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_VARIABLES,
  WRITING_RULES,
  filterTemplates,
  templateCopyText,
  templateVariables,
  type ColdEmailTemplate,
} from "@/lib/cold-email-template-content";

const faqs = [
  { q: "Can I use these as-is?", a: "Use them as structure, not as script. Replace the observation and proof with something true about your prospect and your results." },
  { q: "How long should a cold email be?", a: "Under 90 words for the first touch and under 40 for follow-ups. Every extra line lowers reply rate." },
  { q: "Should the first email include a link?", a: "Ideally not. Ask for permission to send the link in the reply instead." },
  { q: "How do I personalize at scale?", a: "Use variables with fallbacks plus AI-generated icebreakers from the prospect's website, then spot-check a sample before launch." },
  { q: "Do these templates work for cold outbound in regulated industries?", a: "The structure works everywhere, but check local rules (like CAN-SPAM or GDPR consent requirements) before adapting the copy for regulated sectors." },
  { q: "How many follow-ups should a sequence have?", a: "Three to four touches over 10–14 days is the sweet spot in our data — after that, response rate per additional email drops sharply." },
];

export const Route = createFileRoute("/cold-email-templates")({
  head: () =>
    metaFor(
      "Cold Email Templates | MunchReach",
      "A cold email template library with openers, follow-ups and breakup emails for agencies, SaaS, recruiting and lead generation — with variables and full sequences you can copy.",
      "/cold-email-templates",
      faqs,
    ),
  component: Templates,
});

function EmailPreview({ subject, body, label }: { subject: string; body: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/50 px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label ?? "Email"}
        </span>
        <CopyButton value={`Subject: ${subject}\n\n${body}`} label="Copy" />
      </div>
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">Subject</p>
        <p className="mt-0.5 text-sm font-medium">{subject}</p>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-muted-foreground">
        {body}
      </pre>
    </div>
  );
}

function useTemplateCta() {
  const navigate = useNavigate();
  return async function useInSendloop(template: ColdEmailTemplate) {
    stashPendingTemplate({
      name: template.name,
      subject: template.subject,
      body: template.body,
    });
    const { data } = await supabase.auth.getSession();
    navigate({ to: data.session ? "/campaigns" : "/signup" });
  };
}

function TemplateDialog({
  template,
  onOpenChange,
}: {
  template: ColdEmailTemplate | null;
  onOpenChange: (open: boolean) => void;
}) {
  const useInSendloop = useTemplateCta();
  if (!template) return null;
  const variables = templateVariables(template);

  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{template.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-primary/12 px-2.5 py-0.5 font-medium text-primary">
            {template.category}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">
            {template.step}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{template.useCase}</p>

        <div className="space-y-4">
          <EmailPreview subject={template.subject} body={template.body} label="First email" />
          {template.followUps.map((f) => (
            <EmailPreview key={f.label} subject={f.subject} body={f.body} label={f.label} />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-semibold">Variables used</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {variables.map((v) => (
              <code key={v} className="rounded bg-card px-2 py-1 text-xs text-primary">
                {v}
              </code>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Variables only resolve when the matching field exists on the lead record. Add a fallback
            for any field your list does not fully cover — the campaign preview reports every
            variable that will not resolve before you launch.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => useInSendloop(template)} className="gap-2">
            Use this template in MunchReach <ArrowRight className="size-4" />
          </Button>
          <CopyButton value={templateCopyText(template)} label="Copy full sequence" size="default" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Templates() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [active, setActive] = useState<ColdEmailTemplate | null>(null);

  const results = useMemo(() => filterTemplates(query, category), [query, category]);

  return (
    <MarketingLayout>
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            Templates
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Cold email templates that{" "}
            <span className="text-gradient">start conversations</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {COLD_EMAIL_TEMPLATES.length} templates covering the full sequence — opener, bump, proof
            and breakup — plus variants for agencies, SaaS, recruiting and lead generation.
          </p>
          <div className="relative mt-8">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search cold email templates"
              placeholder="Search templates by name, use case or copy..."
              className="h-14 w-full rounded-xl border border-border bg-card pr-12 pl-12 text-sm outline-none transition-colors focus:border-primary"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <Section muted>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={
                category === c
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              }
            >
              {c}
            </button>
          ))}
        </div>

        {results.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {results.map((t) => (
              <article
                key={t.slug}
                className="surface-card flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/12 px-2.5 py-0.5 font-medium text-primary">
                    {t.category}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">
                    {t.step}
                  </span>
                  {t.followUps.length ? (
                    <span className="text-muted-foreground">
                      +{t.followUps.length} follow-up{t.followUps.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold">{t.name}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{t.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Use case:</span> {t.useCase}
                </p>

                <div className="mt-4 flex-1 rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="mt-0.5 text-sm font-medium">{t.subject}</p>
                  <pre className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm text-muted-foreground">
                    {t.body}
                  </pre>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setActive(t)}>
                    View template
                  </Button>
                  <CopyButton value={templateCopyText(t)} label="Copy template" />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="surface-card mt-8 flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Search className="size-6" />
            </span>
            <h2 className="text-xl font-semibold">No templates found</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Nothing matched that search. Clear it to browse the full library.
            </p>
            <Button
              className="mt-2"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
            >
              Clear search
            </Button>
          </div>
        )}
      </Section>

      <Section title="How variables work" description="Variables only resolve when your lead data has the matching field.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {TEMPLATE_VARIABLES.map((v) => (
              <div
                key={v.token}
                className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-3 last:border-b-0"
              >
                <code className="text-sm text-primary">{v.token}</code>
                <span className="text-right text-sm text-muted-foreground">{v.meaning}</span>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="surface-card p-5">
              <p className="text-sm font-semibold">Always add a fallback</p>
              <p className="mt-2 text-sm text-muted-foreground">
                If a lead has no company on file, an unguarded variable leaves a hole in the
                sentence. The campaign preview lists every unresolved variable before launch.
              </p>
            </div>
            <Link to="/product/templates" className="surface-card group flex items-start gap-3 p-5 transition-colors hover:border-primary/50">
              <Sparkles className="mt-0.5 size-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold transition-colors group-hover:text-primary">
                  AI personalization
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Generate icebreakers from a prospect's site, then spot-check a sample.
                </span>
              </span>
            </Link>
            <Link to="/deliverability-guide" className="surface-card group flex items-start gap-3 p-5 transition-colors hover:border-primary/50">
              <ShieldCheck className="mt-0.5 size-5 text-primary" />
              <span>
                <span className="block text-sm font-semibold transition-colors group-hover:text-primary">
                  Deliverability guide
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Great copy still needs authentication, warmup and a clean list.
                </span>
              </span>
            </Link>
          </div>
        </div>
      </Section>

      <Section title="Personalization tips that actually move reply rate" muted>
        <ul className="grid gap-3 sm:grid-cols-2">
          {PERSONALIZATION_TIPS.map((tip) => (
            <li key={tip} className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {tip}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Writing rules that hold up">
        <div className="grid gap-3 md:grid-cols-2">
          {WRITING_RULES.map((r) => (
            <div key={r} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              {r}
            </div>
          ))}
        </div>
      </Section>

      <Section muted>
        <FaqBlock faqs={faqs} title="Questions about templates" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          More answers in the{" "}
          <Link to="/help-center" className="text-primary underline-offset-4 hover:underline">
            Help Center
          </Link>
          .
        </p>
      </Section>

      <TestimonialCarousel page="cold-email-templates" />

      <CtaBlock
        title="Load these into a live sequence"
        description="Import the full four-step sequence into MunchReach and launch it against your list today."
      />

      <TemplateDialog template={active} onOpenChange={(open) => (open ? null : setActive(null))} />
    </MarketingLayout>
  );
}
