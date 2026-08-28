import { createFileRoute } from "@tanstack/react-router";
import {
  Briefcase,
  Building2,
  Eye,
  FileStack,
  FileX,
  Layers,
  PenLine,
  Repeat,
  Rocket,
  Shuffle,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import {
  BigPreview,
  BulletList,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  FlowRail,
  TemplateDetailMock,
  TemplateLibraryMock,
  TemplateToBuilderMock,
  TemplateToCampaignFlow,
  VariablesMock,
} from "@/components/site/TemplatesProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What exactly is a MunchReach template?",
    a: "A saved outreach structure: a subject, a body and — for multi-step templates — the follow-up steps and their timing. You use it as the starting point for a campaign sequence instead of writing from a blank editor.",
  },
  {
    q: "Can I see the whole sequence before I use a template?",
    a: "Yes. The preview shows every step in order with its subject, body, variables and delay, so you know exactly what would be added to your campaign before you click Use template.",
  },
  {
    q: "Is a template locked once I use it?",
    a: "No. The sequence is copied into your campaign. You can rewrite subjects and bodies, change delays, and add or remove steps — the saved template stays untouched.",
  },
  {
    q: "Which categories can I browse?",
    a: "Cold Outreach, Follow-Ups, SaaS, Agencies, Sales, Recruiting, Lead Generation, Partnership, Breakup and Referral. You can also search across template name, subject and body text.",
  },
  {
    q: "Do templates support personalization variables?",
    a: "Yes. Templates can include variables such as {{first_name}}, {{company}}, {{job_title}} and {{ai_personalization}}, and MunchReach detects every variable a template uses so you can see what data it expects.",
  },
  {
    q: "Can my team save its own templates?",
    a: "Yes. Save any campaign copy as a workspace template with a name, category and description. It appears in the same library beside the official MunchReach templates for every teammate with access.",
  },
];

export const Route = createFileRoute("/product/templates")({
  head: () =>
    metaFor(
      "MunchReach Templates — Start Outbound Campaigns From a Proven Structure",
      "Browse ready-made outreach sequences, preview every step, customize the copy for your audience, and launch — without writing each campaign from a blank page.",
      "/product/templates",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: FileX,
    title: "The blank page",
    text: "Every new campaign starts with an empty subject line and no structure to build on.",
  },
  {
    icon: Shuffle,
    title: "Inconsistent messaging",
    text: "Two reps write the same offer two different ways, so nothing is comparable.",
  },
  {
    icon: Repeat,
    title: "Rewriting the same outreach",
    text: "Copy that worked last quarter gets retyped from memory instead of reused.",
  },
];

const customize = [
  {
    icon: PenLine,
    title: "Change the Copy",
    text: "Customize subject lines and email bodies.",
  },
  {
    icon: Sparkles,
    title: "Make It Yours",
    text: "Adjust variables, messaging, and campaign details.",
  },
  {
    icon: Target,
    title: "Build Around Your Audience",
    text: "Adapt the template to your ICP and offer.",
  },
];

const features = [
  {
    icon: Layers,
    title: "Ready-made sequences",
    text: "Multi-step outreach structures with timing already set.",
  },
  {
    icon: Eye,
    title: "Template previews",
    text: "Read every step, subject and variable before you use it.",
  },
  {
    icon: FileStack,
    title: "Reusable campaign structures",
    text: "Save a structure once and reuse it across campaigns.",
  },
  {
    icon: Sparkles,
    title: "Personalization support",
    text: "Variables and AI personalization work inside template copy.",
  },
  {
    icon: PenLine,
    title: "Editable messaging",
    text: "Every imported step stays fully editable in the builder.",
  },
  {
    icon: Rocket,
    title: "Faster campaign setup",
    text: "Go from library to launch without drafting from zero.",
  },
];

const audiences = [
  {
    icon: Users,
    audience: "Sales Teams",
    scenario: "Reps start from the same approved structure instead of their own draft.",
    outcome: "Launch campaigns faster and keep messaging consistent.",
  },
  {
    icon: Building2,
    audience: "Agencies",
    scenario: "Save a structure per offer, then adapt it for each client account.",
    outcome: "Create repeatable campaign structures for different clients.",
  },
  {
    icon: Briefcase,
    audience: "Founders",
    scenario: "Pick a sequence that already handles the follow-ups and edit the pitch.",
    outcome: "Start outbound without writing every sequence from scratch.",
  },
];

const howItWorks = [
  { title: "Browse", text: "Search the library or filter by category." },
  { title: "Preview", text: "Read the full sequence, step by step." },
  { title: "Customize", text: "Edit copy, variables and timing." },
  { title: "Launch", text: "Add leads, pick mailboxes and start sending." },
];

const details = [
  "Templates cover single emails and full multi-step sequences with follow-up timing",
  "Categories: Cold Outreach, Follow-Ups, SaaS, Agencies, Sales, Recruiting, Lead Generation, Partnership, Breakup, Referral",
  "Search matches template name, subject and body text",
  "Official MunchReach templates and your workspace templates live in the same library",
  "The preview lists every variable a template uses before you insert it",
  "Using a template copies the sequence into the campaign — the original is never modified",
  "Imported steps stay editable: rewrite copy, change delays, add or remove steps",
  "Save any campaign sequence back to the library as a workspace template",
];

const beforeSteps = ["Blank page", "Research", "Write", "Rewrite", "Build sequence", "Launch"];
const afterSteps = ["Choose template", "Customize", "Add leads", "Launch"];

function Page() {
  return (
    <MarketingLayout>
      {/* 1. Hero */}
      <PageHero
        eyebrow="MunchReach Templates"
        title="Start With Outreach"
        highlight="That's Already Built."
        description="Choose a proven campaign structure, customize the message for your audience, and launch without starting every email from a blank page."
        benefits={[
          "Full sequences, not just one email",
          "Preview every step before using it",
          "Editable the moment it lands in your campaign",
        ]}
        primaryCta="Browse Templates"
        secondaryCta="Create a Campaign"
        secondaryHref="/auth"
      >
        <TemplateLibraryMock />
      </PageHero>

      {/* 2. The problem */}
      <Section
        title="Starting Every Campaign From Scratch Takes Too Long."
        description="The slow part of outbound is rarely sending. It's writing the same thing again."
      >
        <PainPoints items={problems} />
      </Section>

      {/* 3. Template library */}
      <BigPreview
        id="library"
        eyebrow="Template library"
        title="Find a Starting Point for Your Campaign"
        description="Search by keyword, filter by category, preview the sequence, then use it."
      >
        <div className="p-4 sm:p-6">
          <TemplateLibraryMock />
        </div>
      </BigPreview>

      {/* 4. Template preview */}
      <Section
        title="See the Entire Sequence Before You Use It"
        description="Open any template to read the initial email and both follow-ups — subject, body, variables and timing — before it touches a campaign."
      >
        <TemplateDetailMock />
      </Section>

      {/* 5. From template to campaign */}
      <Section
        id="workflow"
        title="From Template to Campaign"
        description="Seven steps between picking a structure and sending your first email."
      >
        <div className="space-y-8">
          <div className="overflow-x-auto pb-1">
            <FlowRail
              steps={[
                "Choose template",
                "Review sequence",
                "Customize copy",
                "Add leads",
                "Sending accounts",
                "Schedule",
                "Launch",
              ]}
            />
          </div>
          <TemplateToCampaignFlow />
        </div>
      </Section>

      {/* 6. Customize everything */}
      <Section
        title="Customize Everything"
        description="A template decides where you start, never what you send."
        muted
      >
        <FeatureGrid items={customize} />
      </Section>

      {/* 7. Variables and personalization */}
      <Section
        title="Variables & Personalization"
        description="Templates give you the structure. Variables and AI personalization make the message specific to the person reading it."
      >
        <VariablesMock />
      </Section>

      {/* 8. Template to campaign builder */}
      <BigPreview
        id="builder"
        eyebrow="Template → campaign builder"
        title="A Starting Point, Not a Locked Campaign"
        description="The sequence is imported into your builder as an editable draft."
      >
        <div className="p-4 sm:p-6">
          <TemplateToBuilderMock />
        </div>
      </BigPreview>

      {/* 9. What you get */}
      <Section title="What You Get" description="Everything the template library includes.">
        <FeatureGrid items={features} />
      </Section>

      {/* 10. Before vs after */}
      <Section title="Before vs After" description="Same campaign. Fewer steps to get it live." muted>
        <div className="space-y-8">
          <div className="min-w-0">
            <h3 className="mb-4 text-center text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Before
            </h3>
            <div className="overflow-x-auto pb-1">
              <FlowRail steps={beforeSteps} tone="muted" />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="mb-4 text-center text-sm font-semibold tracking-wide text-primary uppercase">
              After
            </h3>
            <div className="overflow-x-auto pb-1">
              <FlowRail steps={afterSteps} />
            </div>
          </div>
        </div>
      </Section>

      {/* 11. Who it's for */}
      <Section title="Who It's For" description="Three teams, one shared starting point.">
        <UseCaseGrid items={audiences} />
      </Section>

      {/* 12. How it works */}
      <Section title="How It Works" description="Four steps from library to live campaign.">
        <WorkflowStrip steps={howItWorks} />
      </Section>

      {/* 13. Details that matter */}
      <Section title="Details That Matter" muted>
        <BulletList items={details} />
      </Section>

      {/* 14. Loved by outreach teams — unchanged */}
      <TestimonialCarousel page="templates" title="Copy that gets replies" />

      {/* 15. FAQ */}
      <Section muted>
        <PageFaqs page="templates" defaults={faqs} />
      </Section>

      {/* 16. Final CTA */}
      <CtaBlock
        title="Stop Starting Every Campaign From Zero."
        description="Start with a strong structure, customize it for your audience, and launch."
        cta="Browse Templates"
      />
    </MarketingLayout>
  );
}
