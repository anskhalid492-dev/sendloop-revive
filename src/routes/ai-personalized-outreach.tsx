import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  Braces,
  Building2,
  Copy,
  Gauge,
  KeyRound,
  ListChecks,
  MapPin,
  PenLine,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  BulletList,
  CtaBlock,
  FeatureBento,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  StepList,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import { PageFaqs } from "@/components/site/PageFaqs";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "Do I need my own OpenAI account?",
    a: "Yes. You connect your own OpenAI API key in the campaign builder, so you choose the model and OpenAI bills you directly at their rates.",
  },
  {
    q: "Where is my API key stored?",
    a: "It is encrypted before it is saved and only ever decrypted on our servers when a personalization runs. It is never sent back to the browser and is never shown again after you save it.",
  },
  {
    q: "Which models can I use?",
    a: "GPT-4o mini, GPT-4o, GPT-4.1 mini and GPT-4.1. Start with GPT-4o mini for cost, switch to a larger model when you want richer copy.",
  },
  {
    q: "Can the AI invent things about my prospect?",
    a: "The prompt only receives the lead fields you select, and the model is instructed to use nothing else. If there is not enough real data, it returns nothing rather than guessing.",
  },
  {
    q: "What happens when a lead has no usable data?",
    a: "You decide per campaign: send with a fallback line, send without the personalization, or hold that lead back until you review it.",
  },
  {
    q: "Can I edit what the AI writes before sending?",
    a: "Yes. Every generated line is listed in the AI tab and can be edited, regenerated or approved before the campaign goes out.",
  },
  {
    q: "Does it slow down launching a campaign?",
    a: "No. Generation runs in a background queue in small batches, and you can watch progress live while you finish the rest of the setup.",
  },
];

export const Route = createFileRoute("/ai-personalized-outreach")({
  head: () =>
    metaFor(
      "AI Personalized Cold Outreach — Bring Your Own OpenAI Key | MunchReach",
      "Write a unique opening line for every prospect using your own OpenAI API key. Real lead data only, full editing control, and no per-credit markup from MunchReach.",
      "/ai-personalized-outreach",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  {
    icon: Copy,
    title: "Templates read like templates",
    text: '"Hi {{first_name}}, I came across {{company}}" is the same email everyone else is sending this morning.',
  },
  {
    icon: Gauge,
    title: "Manual research does not scale",
    text: "Researching each prospect properly takes minutes per lead, which caps a rep at a few dozen quality emails a day.",
  },
  {
    icon: Wallet,
    title: "AI add-ons get expensive",
    text: "Per-credit AI pricing turns every experiment into a billing decision, so teams stop testing new angles.",
  },
];

const solutionRows = [
  {
    eyebrow: "Your key, your model",
    title: "Connect your own OpenAI account in under a minute",
    text: "MunchReach does not resell AI credits. Paste your OpenAI API key once in the campaign builder, pick a model, and every personalization runs on your account at OpenAI's own rates.",
    bullets: [
      "Encrypted at rest and never returned to the browser",
      "Choose GPT-4o mini, GPT-4o, GPT-4.1 mini or GPT-4.1",
      "Disconnect or rotate the key whenever you want",
    ],
    visual: (
      <MockPanel title="Campaign builder — AI tab">
        <MockRows
          rows={[
            {
              left: "OpenAI connection",
              muted: "Key ending •••• 8f2c",
              right: "Verified",
              badge: "Connected",
            },
            { left: "Model", muted: "Billed by OpenAI directly", right: "gpt-4o-mini" },
            { left: "Storage", muted: "Encrypted, server-side only", right: "Protected" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Grounded generation",
    title: "The model only sees facts that exist on the lead",
    text: "You pick which fields the AI may use. Anything blank on the record is simply not passed to the model, so there is nothing to hallucinate from.",
    bullets: [
      "Name, job title, company, website, industry and location",
      "Company description, lead notes and your custom fields",
      "Explicit instruction to return nothing rather than invent",
    ],
    visual: (
      <MockPanel title="Facts passed to the model">
        <MockRows
          rows={[
            { left: "Job title", right: "Head of Growth" },
            { left: "Company", right: "Northwind Labs" },
            { left: "Location", right: "Austin, TX" },
            { left: "Lead note", right: "Hiring 3 SDRs this quarter" },
            { left: "Funding round", muted: "Not on record", right: "Not sent", badge: "Excluded" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Human control",
    title: "Review, edit and approve before anything sends",
    text: "Every generated line lands in a reviewable list. Edit the wording, regenerate a weak one, or hold a lead back — the campaign only sends what you accepted.",
    bullets: [
      "Inline editing of any generated opener",
      "Regenerate a single lead without touching the rest",
      "Hold mode blocks launch until pending leads are resolved",
    ],
    visual: (
      <MockPanel title="Generated openers — Q4 Outbound">
        <MockRows
          rows={[
            {
              left: "maya@northwindlabs.com",
              muted: "Hiring 3 SDRs this quarter…",
              right: "Ready",
              badge: "Completed",
            },
            {
              left: "d.okafor@brightpath.io",
              muted: "Edited by you",
              right: "Ready",
              badge: "Approved",
            },
            {
              left: "tom@fielded.co",
              muted: "Awaiting generation",
              right: "In queue",
              badge: "Queued",
            },
          ]}
        />
      </MockPanel>
    ),
  },
];

const signals = [
  {
    icon: UserRound,
    title: "Person",
    text: "First name, last name and job title, used naturally instead of dropped into a bracket.",
  },
  {
    icon: Building2,
    title: "Company",
    text: "Company name, website and description when you have them on the record.",
  },
  {
    icon: MapPin,
    title: "Location",
    text: "City, state and country for regional angles and timing references.",
  },
  {
    icon: ListChecks,
    title: "Industry",
    text: "Industry field or your own equivalent custom field, when it is filled in.",
  },
  {
    icon: PenLine,
    title: "Lead notes",
    text: "The latest note on the lead, so research your team already did gets reused.",
  },
  {
    icon: Braces,
    title: "Custom fields",
    text: "Anything you imported with your CSV can be offered to the model as context.",
  },
];

const steps = [
  {
    title: "Connect your OpenAI key",
    text: "Add the key once per workspace in the AI tab. We verify it with OpenAI before saving it.",
  },
  {
    title: "Describe the angle",
    text: "Write plain-English instructions, pick a tone, length and language, and choose which lead fields the model may use.",
  },
  {
    title: "Preview on a real lead",
    text: "Generate against an actual record from your list and refine the instructions until the output sounds like you.",
  },
  {
    title: "Generate for the whole list",
    text: "Queue the campaign's recipients. A background worker processes them in small batches so nothing overloads your OpenAI account.",
  },
  {
    title: "Review and launch",
    text: "Edit anything that needs a human touch, then launch. The {{ai_personalization}} variable is replaced per lead at send time.",
  },
];

const controls = [
  "Three depth levels — light, balanced and deep — that change how much context the model receives",
  "Five tones from professional to curious, plus any output language",
  "Length caps of one line, two lines or a short paragraph",
  "An example output field so the model matches your writing style",
  "Fallback behaviour per campaign: fallback text, skip the variable, or hold the lead",
  "Automatic retries and per-workspace rate handling so a busy list finishes cleanly",
];

const useCases = [
  {
    icon: Users,
    audience: "Agencies",
    scenario: "Run outbound for several clients, each with a different voice and offer.",
    outcome: "Per-campaign instructions keep every client sounding like themselves.",
  },
  {
    icon: Sparkles,
    audience: "Founders",
    scenario: "Send the first 200 cold emails yourself without spending a week researching.",
    outcome: "Real openers per prospect in an afternoon, at OpenAI cost only.",
  },
  {
    icon: ShieldCheck,
    audience: "Sales teams",
    scenario: "Need volume without risking a made-up claim reaching a buyer.",
    outcome: "Grounded generation plus human approval before anything sends.",
  },
];

const beforeAfter = {
  before: [
    "One template blasted to the whole list",
    "Hours of manual research for a handful of good emails",
    "AI credits resold to you with a markup",
    "No way to check what the AI wrote before it sends",
  ],
  after: [
    "A unique opener per prospect from data you already have",
    "Bulk generation in a background queue while you work",
    "Your own OpenAI key, billed at OpenAI's rates",
    "Every line reviewable and editable before launch",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="AI Personalization"
        title="Cold email that sounds like you researched"
        highlight="every single prospect"
        description="Connect your own OpenAI key and MunchReach writes a unique opening line for each lead from the data on their record — reviewed by you, sent by your campaign."
        secondaryCta="See Pricing"
      />

      <BigPreview title="Same campaign, different first line for every lead">
        <MockPanel title="Step 1 · Intro email preview">
          <MockRows
            rows={[
              {
                left: "Maya · Head of Growth, Northwind Labs",
                muted:
                  "Hiring three SDRs this quarter usually means the outbound motion is about to get louder.",
                right: "Generated",
                badge: "Completed",
              },
              {
                left: "Daniel · Founder, Brightpath",
                muted:
                  "Running growth and product at the same time is the part most founder-led teams underestimate.",
                right: "Generated",
                badge: "Completed",
              },
              {
                left: "Tom · Sales Lead, Fielded",
                muted:
                  "Leading sales in Austin for a field-service platform is a very specific kind of busy.",
                right: "Generated",
                badge: "Completed",
              },
            ]}
          />
        </MockPanel>
      </BigPreview>

      <Section title="Why personalization usually breaks down">
        <PainPoints items={painPoints} />
      </Section>

      <Section
        title="How MunchReach does it differently"
        description="Your AI account, your data, your final say."
      >
        <SolutionSplit rows={solutionRows} />
      </Section>

      <Section
        title="Signals it can use"
        description="Only fields that actually hold data for that lead."
      >
        <FeatureBento items={signals} />
      </Section>

      <Section title="From key to campaign in five steps" muted>
        <StepList steps={steps} />
      </Section>

      <Section
        title="Controls you keep"
        description="Personalization you can tune, not a black box."
      >
        <BulletList items={controls} />
      </Section>

      <Section title="Before and after" description="What changes on your next send." muted>
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>

      <Section title="Who it is for">
        <UseCaseGrid items={useCases} />
      </Section>

      <Section title="Works with the rest of MunchReach" muted>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              to: "/features",
              title: "All features",
              text: "Everything included in the platform, in one place.",
            },
            {
              to: "/product/campaigns",
              title: "Campaigns",
              text: "Drop the AI variable into any step of a sequence.",
            },
            {
              to: "/how-it-works",
              title: "How it works",
              text: "The full path from domain setup to first reply.",
            },
            {
              to: "/integrations",
              title: "Integrations",
              text: "Push and pull lead data from the tools you already use.",
            },
            {
              to: "/product/crm",
              title: "CRM",
              text: "Notes and custom fields become personalization material.",
            },
            {
              to: "/pricing",
              title: "Pricing",
              text: "Plans for sending — AI is billed by OpenAI, not by us.",
            },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <h3 className="text-base font-semibold">{link.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{link.text}</p>
            </Link>
          ))}
        </div>
      </Section>

      <TestimonialCarousel page="ai-personalization" title="Teams personalizing at scale" />

      <Section muted>
        <PageFaqs page="ai-personalization" defaults={faqs} />
      </Section>

      <CtaBlock
        title="Personalize your next campaign"
        description="Connect your OpenAI key, preview on a real lead, and send openers worth replying to."
      />
    </MarketingLayout>
  );
}
