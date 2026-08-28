import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Clock,
  Globe,
  Languages,
  ListChecks,
  MessageSquareText,
  Rocket,
  Ruler,
  ShieldQuestion,
  Sparkles,
  Type,
  Users,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import {
  AiPersonalizationScreen,
  BulkRunMock,
  BuilderIntegrationMock,
  DetailList,
  NumberedSteps,
  ToneMatrix,
  TransformationFlow,
} from "@/components/site/AiPersonalizationProductMocks";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What does AI Personalization actually generate?",
    a: "A short personalized snippet for each lead — one sentence, two sentences or a short paragraph, depending on the length you choose. It is inserted wherever you place the {{ai_personalization}} variable in your email.",
  },
  {
    q: "Where does the AI get its information?",
    a: "Only from the lead fields you enable: first name, job title, company, website, industry, location, company description, lead notes and custom fields. It does not browse the web, so it cannot invent funding rounds, headcounts or news.",
  },
  {
    q: "What happens if a lead does not have enough data?",
    a: "You decide up front. Use your fallback text in place of the AI line, skip personalization and send the rest of the email as written, or hold that lead back until personalization succeeds.",
  },
  {
    q: "Can I review or edit the generated lines before sending?",
    a: "Yes. Every snippet is stored against the lead with its status and the fields it used, and you can preview and edit lines before the campaign sends.",
  },
  {
    q: "What happens if generation fails for some leads?",
    a: "Failures are recorded separately from limited-data results, and you can retry just those leads. Leads that already have personalization are skipped on a re-run, so retrying only fills the gaps.",
  },
  {
    q: "Does it work with follow-up steps too?",
    a: "Yes — the {{ai_personalization}} variable can be placed in any step of the sequence, and the same snippet and fallback behaviour applies when that step sends.",
  },
];

export const Route = createFileRoute("/ai-personalized-outreach")({
  head: () =>
    metaFor(
      "AI Personalization — Personalized Cold Email at Scale | MunchReach",
      "Turn lead data into relevant, natural-sounding personalization automatically, then insert it into your outbound campaigns with full control over tone, length, language and fallback.",
      "/ai-personalized-outreach",
      faqs,
    ),
  component: Page,
});

const problems = [
  {
    icon: Clock,
    title: "Manual research takes too long",
    text: "Reading a website and writing one relevant line takes minutes. Multiply that by a thousand leads and the list never goes out.",
  },
  {
    icon: MessageSquareText,
    title: "Generic AI sounds robotic",
    text: "Unconstrained AI writes flattery and invented facts. Prospects recognise it instantly and it costs you the reply.",
  },
  {
    icon: ListChecks,
    title: "Personalization breaks when you scale",
    text: "Leads have uneven data. Without a fallback rule, half your list gets an awkward empty gap where the personal line should be.",
  },
];

const steps = [
  {
    title: "Choose your campaign",
    text: "Open the AI panel inside the campaign builder. It works on that campaign's lead list, so the personalization matches the audience you are actually sending to.",
  },
  {
    title: "Tell AI what to look for",
    text: "Pick the writing framework, tone, length and language, choose which lead fields the AI may read, and write your own instructions.",
  },
  {
    title: "Generate personalization",
    text: "Run it across the list. Progress, coverage, limited-data results and failures are all shown while it works.",
  },
  {
    title: "Insert it into your email",
    text: "Drop {{ai_personalization}} anywhere in the sequence. At send time each lead's own line is substituted, with your fallback rule applied when there isn't one.",
  },
];

const controls = [
  {
    icon: MessageSquareText,
    title: "Custom instructions",
    text: "Write the brief yourself: “mention how they likely handle outbound today, no compliments, no invented facts.”",
  },
  {
    icon: ListChecks,
    title: "Lead data selection",
    text: "Enable only the fields you trust — for example job title, company and industry, but not free-text notes.",
  },
  {
    icon: Type,
    title: "Tone",
    text: "Professional, friendly, direct, conversational or curious. The same lead data reads very differently across them.",
  },
  {
    icon: Ruler,
    title: "Length",
    text: "One sentence for a tight opener, two sentences for a little context, or a short paragraph for a warmer email.",
  },
  {
    icon: Languages,
    title: "Language",
    text: "Generate in the language the list is written for, so a German list does not get English openers.",
  },
  {
    icon: ShieldQuestion,
    title: "Fallback text",
    text: "Choose fallback text, skip the line entirely, or hold the lead back — no empty gaps in a live email.",
  },
];

const tones = [
  {
    tone: "Friendly",
    trait: "Warm, still concise",
    example: "Nice to see Northwind pushing into logistics tooling — I imagine growth sits with a small team right now.",
  },
  {
    tone: "Professional",
    trait: "Neutral, business-first",
    example: "Northwind operates in a space where outbound is usually managed across several mailboxes.",
  },
  {
    tone: "Direct",
    trait: "No filler",
    example: "You run growth at Northwind, so outbound volume is probably your constraint, not the message.",
  },
  {
    tone: "Conversational",
    trait: "Sounds typed, not templated",
    example: "Guessing outbound at Northwind still lives half in a spreadsheet and half in someone's inbox.",
  },
  {
    tone: "Curious",
    trait: "Opens with a question",
    example: "How is the Northwind team splitting outbound between reps right now?",
  },
  {
    tone: "Consultative",
    trait: "Problem → Solution framing",
    example: "Logistics software teams usually hit a wall on reply handling before they hit one on volume.",
  },
];

const frameworks = [
  {
    tone: "Offer-driven",
    trait: "Relevance first",
    example: "For a team selling into operations, the hard part is usually keeping outreach relevant at volume.",
  },
  {
    tone: "Short & punchy",
    trait: "Straight to the point",
    example: "Founder-led outbound at Loomtide — that usually means it happens between everything else.",
  },
  {
    tone: "High-energy sales",
    trait: "Momentum without hype",
    example: "Northwind is moving fast — outbound is the part that usually can't keep up.",
  },
];

const scale = [
  {
    eyebrow: "Bulk generation",
    title: "Generate across the whole list, not one lead at a time",
    text: "Start a run on the campaign's leads and the work is batched in the background while you keep building the sequence.",
    bullets: [
      "Requests are batched and processed in parallel rather than one after another",
      "Progress and coverage update as the run works through the list",
      "Leads that already have personalization are skipped automatically",
    ],
    visual: <BulkRunMock />,
  },
  {
    eyebrow: "Failures and retries",
    title: "A failed lead does not break the campaign",
    text: "Technical failures are tracked separately from limited-data results, so you can see the difference between “no line yet” and “not much to work with”.",
    bullets: [
      "Failed generations are recorded with their error and can be retried on their own",
      "Limited-data snippets are labelled so you can review them before launch",
      "At send time, any lead still without a line follows your fallback rule",
    ],
    visual: <BuilderIntegrationMock />,
  },
];

const audiences = [
  {
    icon: Users,
    audience: "Sales teams",
    scenario: "Reps who need relevant openers without spending the morning researching accounts.",
    outcome: "Research time goes into the conversation, not the first line.",
  },
  {
    icon: Building2,
    audience: "Agencies",
    scenario: "Different clients, different offers, different tone requirements per campaign.",
    outcome: "Framework, tone and instructions are configured per campaign.",
  },
  {
    icon: Rocket,
    audience: "Founders doing outbound",
    scenario: "One person writing, sending and following up on everything.",
    outcome: "A personalized list goes out without a full writing session.",
  },
];

const details = [
  { title: "Per-campaign configuration", text: "Framework, tone, length, language, fields and instructions are saved on the campaign, not globally." },
  { title: "Field-level control", text: "The AI only ever sees the lead fields you enable for that campaign." },
  { title: "Quality labelling", text: "Each snippet is marked completed, limited data or fallback, with the fields it used." },
  { title: "Editable output", text: "Generated lines are stored per lead and can be reviewed and edited before sending." },
  { title: "Reuse on re-runs", text: "Existing personalization is kept, so a second run only covers the leads that are missing." },
  { title: "Send-time resolution", text: "The variable resolves as each email sends, applying the fallback rule when no line exists." },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="AI Personalization"
        title="Personalize Every Email"
        highlight="Without Writing Every Line."
        description="Turn lead data into relevant, natural-sounding personalization automatically — then use it directly inside your outbound campaigns."
        benefits={["Your instructions", "Your tone and length", "Your fallback rule"]}
        primaryCta="Try AI Personalization"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <Section
        muted
        title="Personalization works. Doing it manually doesn't scale."
        description="The bottleneck is never the idea — it's the hour per hundred leads."
      >
        <PainPoints items={problems} />
      </Section>

      <BigPreview
        id="product"
        eyebrow="Inside the product"
        title="Every control on one screen"
        description="Framework, tone, length, language, fields, instructions, fallback, live preview and coverage."
      >
        <AiPersonalizationScreen />
      </BigPreview>

      <Section id="how-it-works" muted title="How it works">
        <NumberedSteps steps={steps} />
      </Section>

      <Section
        title="Personalization controls"
        description="Six settings decide what the AI writes and what happens when it can't."
      >
        <FeatureGrid items={controls} />
      </Section>

      <Section
        muted
        title="Writing styles and tones"
        description="Same lead, same data — different tone, different email. These are general writing characteristics, not impersonations of specific people."
      >
        <ToneMatrix items={tones} />
        <div className="mt-6">
          <ToneMatrix items={frameworks} />
        </div>
      </Section>

      <Section
        title="A real example, end to end"
        description="Lead record → allowed fields → generated line → variable → final email."
      >
        <TransformationFlow />
      </Section>

      <Section muted title="Scale without the manual work">
        <SolutionSplit rows={scale} />
      </Section>

      <Section
        title="It lives inside the campaign builder"
        description="Open the AI panel from the sequence step you are editing, configure it, generate, and preview the finished email — without leaving the builder. If a lead has no personalization when the email sends, your fallback rule decides what happens."
      >
        <BuilderIntegrationMock />
      </Section>

      <Section muted title="Before and after">
        <BeforeAfter
          beforeTitle="Without AI personalization"
          afterTitle="With MunchReach"
          before={[
            "Generic opener reused across the whole list",
            "Manual research on every account that matters",
            "Slow — the list ships days after it was built",
            "Inconsistent quality between reps and days",
          ]}
          after={[
            "Lead data becomes the raw material",
            "AI writes the opener under your instructions",
            "The campaign inserts it at send time",
            "Personalized outreach across the full list",
          ]}
        />
      </Section>

      <Section title="Who it's for">
        <UseCaseGrid items={audiences} />
      </Section>

      <Section muted title="Details that matter">
        <DetailList items={details} />
      </Section>

      <TestimonialCarousel page="ai-personalization" title="What our customers are saying" />

      <Section muted>
        <PageFaqs page="ai-personalization" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Make every outbound email feel like it was written for one person."
        description="Configure the framework, tone and fallback once, then let the campaign do the writing for every lead on the list."
        cta="Try AI Personalization"
      />
    </MarketingLayout>
  );
}

/* Icons referenced only through the config arrays above. */
void Sparkles;
void Globe;
