import { createFileRoute } from "@tanstack/react-router";
import {
  BrainCircuit,
  Layers,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  PencilLine,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";

import {
  BeforeAfter,
  CtaBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  Section,
  UseCaseGrid,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  {
    q: "What does AI Campaign Writer actually produce?",
    a: "A campaign strategy — angle, value proposition, main pain point, recommended offer, CTA approach and tone — followed by a complete email sequence — you choose how many follow-ups you want, up to nine — where each step has its own purpose instead of repeating the first email.",
  },
  {
    q: "Which AI does it use?",
    a: "Your own connected AI provider. MunchReach supports OpenAI and Claude today; the campaign writer uses the key your workspace connected, and the provider in use is shown while you generate.",
  },
  {
    q: "Does it invent results or testimonials?",
    a: "No. If you have not provided proof, it says proof is missing rather than creating statistics, guarantees or customer results.",
  },
  {
    q: "How is it different from AI Personalization?",
    a: "The campaign writer creates the campaign: the offer messaging, the emails and the sequence. AI Personalization then tailors that campaign for each individual lead using their own data. They work together and stay separate.",
  },
  {
    q: "Can it write the copy straight into a campaign I already have?",
    a: "Yes. Pick one of your existing campaigns, click Add to campaign, and the subject lines, email bodies, variables and step order are written into it. No duplicate campaign is created, and live campaigns are left alone until you pause them.",
  },
  {
    q: "What is a pain point variable?",
    a: "Choose how many pain points the AI should write for each lead, then drop {{pain_point}} into your copy. Every lead gets a pain point written from their own business information — never one generic line reused for everybody.",
  },
  {
    q: "What does Recreate do?",
    a: "It writes a genuinely different version of that email — new subject line, new opening, new structure — while keeping your audience, objective, offer, tone, variables and follow-up count. If you prefer the new version, Use this version puts it straight into the campaign step.",
  },
  {
    q: "Will it overwrite my existing sequence?",
    a: "Not without asking. If your campaign already has email content, applying a generated campaign shows a confirmation first, so you can cancel or replace.",
  },
  {
    q: "Does it send emails?",
    a: "Never. It writes campaign content inside the builder. Sending stays with your own connected mailboxes, your schedule and your sending limits.",
  },
  {
    q: "Which personalization variables can it use?",
    a: "Only the variables MunchReach already supports, such as first name, last name, company, job title and industry, plus your own campaign variables. It cannot invent variables that would break at send time.",
  },
];

export const Route = createFileRoute("/products/ai-campaign-writer")({
  head: () =>
    metaFor(
      "AI Campaign Writer for Cold Outreach | MunchReach",
      "Create stronger cold outreach campaigns with AI. Build offers, messaging angles, email sequences, follow-ups, CTAs, and personalized campaigns with MunchReach AI Campaign Writer.",
      "/products/ai-campaign-writer",
      faqs,
    ),
  component: Page,
});

const howItWorks = [
  {
    title: "Describe your offer",
    text: "Write what you sell, who it is for and the problem you solve. Add as many of the optional details as you like — the writer works with whatever you give it.",
  },
  {
    title: "Review the strategy",
    text: "Before any email is written you get the angle, value proposition, main pain point, recommended offer, CTA approach and tone.",
  },
  {
    title: "Generate the sequence",
    text: "Choose exactly how many follow-ups you want. Each email is written for its own purpose: open the conversation, add a new angle, answer an objection, then close politely.",
  },
  {
    title: "Apply to your campaign",
    text: "Preview every email, edit anything, recreate a single step, then add the sequence to any campaign you already have in one click.",
  },
];

const strategyFeatures = [
  {
    icon: BrainCircuit,
    title: "Strategy before copy",
    text: "The writer works out positioning, the real problem, the objections and the best call to action first, then writes emails that follow from it.",
  },
  {
    icon: Target,
    title: "Multiple messaging angles",
    text: "Ask for several angles that fit your actual offer, compare them, then pick the one you want the campaign built around.",
  },
  {
    icon: Lightbulb,
    title: "Improve my offer",
    text: "See your current offer next to a stronger version, with short reasons why. If you have no proof, it says so instead of inventing any.",
  },
  {
    icon: ListChecks,
    title: "Campaign check",
    text: "Get honest feedback on weak offers, generic messaging, unclear value, weak CTAs, repetition and follow-ups that just restate step one — then rewrite from it.",
  },
];

const controls = [
  {
    icon: PencilLine,
    title: "Tone and style",
    text: "Professional, conversational, friendly, direct, premium or founder-to-founder, in short, balanced or detailed length.",
  },
  {
    icon: Wand2,
    title: "Approach and CTA",
    text: "Problem-focused, outcome-focused, offer-focused, insight-led, curiosity-driven or direct — with a soft ask, a question, a call, a reply request or your own CTA.",
  },
  {
    icon: Layers,
    title: "Follow-up count and pain points",
    text: "Pick the initial email plus up to nine follow-ups, and how many pain points the AI writes for each individual lead.",
  },
  {
    icon: Sparkles,
    title: "Recreate and reuse",
    text: "Recreate any email as a genuinely different version, then use this version to drop it straight into the matching campaign step.",
  },
];

const together = [
  {
    icon: MessagesSquare,
    audience: "AI Campaign Writer",
    scenario: "Builds the campaign: offer messaging, angle, emails and the follow-up sequence.",
    outcome: "A campaign worth sending",
  },
  {
    icon: Sparkles,
    audience: "AI Personalization",
    scenario: "Takes that campaign and writes a relevant line for each individual lead from their own data.",
    outcome: "Relevance per lead",
  },
  {
    icon: ShieldCheck,
    audience: "Your sending setup",
    scenario: "Your own connected mailboxes, schedule, limits and warmup send the campaign — the writer never sends anything itself.",
    outcome: "You stay in control",
  },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="AI Campaign Writer"
        title="AI Campaign Writer"
        description="Turn your offer into outreach campaigns people actually want to respond to. Describe what you sell and the problem you solve, and the writer builds the strategy, the messaging and a complete sequence you can edit and send."
        benefits={[
          "Strategy, offer and sequence in one place",
          "Uses your own connected AI provider",
          "Never invents results or testimonials",
        ]}
        primaryCta="Try AI Campaign Writer"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />

      <Section
        id="how-it-works"
        title="How it works"
        description="Four steps from a description of your offer to a sequence in your campaign."
      >
        <WorkflowStrip steps={howItWorks} />
      </Section>

      <Section
        muted
        title="AI builds your campaign strategy"
        description="You see the thinking that matters — the angle, the pain point, the offer and the ask — not a wall of chat."
      >
        <FeatureGrid items={strategyFeatures} />
      </Section>

      <Section
        title="Generate complete sequences"
        description="Every step has a different job, so your follow-ups earn replies instead of repeating themselves."
      >
        <FeatureGrid items={controls} />
        <div className="mt-10">
          <BeforeAfter
            beforeTitle="Writing from scratch"
            afterTitle="With AI Campaign Writer"
            before={[
              "A blank page and a deadline",
              "Follow-ups that repeat the first email",
              "Offer buried in the third paragraph",
              "Guessing which angle will land",
            ]}
            after={[
              "Strategy first, then copy that follows it",
              "Each step adds a new reason to reply",
              "Clear offer, clear ask, sensible length",
              "Several angles to compare before you commit",
            ]}
          />
        </div>
      </Section>

      <Section
        muted
        title="AI Campaign Writer and AI Personalization"
        description="Two features that work together and stay separate."
      >
        <UseCaseGrid items={together} />
      </Section>

      <Section
        title="Connected AI providers"
        description="The campaign writer runs on the AI provider your workspace connects — OpenAI or Claude. Your key stays on our servers, is stored encrypted and is never exposed in the browser. Email delivery providers are a completely separate part of MunchReach and are never used for AI."
      >
        <FeatureGrid
          items={[
            {
              icon: ShieldCheck,
              title: "Your key, your account",
              text: "Bring your own OpenAI or Claude key. Generation is billed by your provider, and the provider in use is shown while you generate.",
            },
            {
              icon: Layers,
              title: "Fits your plan",
              text: "Access follows your MunchReach plan and AI allowance — the same allowance AI Personalization uses. No separate billing.",
            },
          ]}
        />
      </Section>

      <Section
        muted
        title="How it fits into MunchReach"
        description="The writer lives in the campaign builder next to AI Personalization. Variables, templates, spintax, preview and test sends all work exactly as before, and generated copy only uses variables MunchReach supports. Your generated strategy is saved with the campaign, so you can come back to it later."
      >
        <div />
      </Section>

      <PageFaqs page="/products/ai-campaign-writer" defaults={faqs} />

      <CtaBlock
        title="Write your next campaign in minutes"
        description="Describe your offer once and get a strategy, messaging angles and a full sequence you can edit and send from your own mailboxes."
        cta="Try AI Campaign Writer"
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
    </MarketingLayout>
  );
}
