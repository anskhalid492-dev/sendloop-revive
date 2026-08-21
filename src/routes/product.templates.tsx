import { createFileRoute } from "@tanstack/react-router";
import {
  Sparkles,
  FileText,
  Wand2,
  Variable,
  FolderOpen,
  Copy,
  FileX,
  Repeat,
  ShieldAlert,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  StatStrip,
  StepList,
  metaFor,
  BigPreview,
  FeatureBento,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Are the templates free?", a: "Yes, the full library is included on every plan, with no cap on how many you insert into campaigns." },
  { q: "Will my emails look identical to everyone else's?", a: "Templates are starting points — spintax and AI personalization mean every send is worded uniquely, protecting deliverability." },
  { q: "Can I create my own?", a: "Yes, and share them across your workspace as a private team folder that only your members can see." },
  { q: "Do templates include follow-ups?", a: "Most templates ship as a full three to four step sequence, including bump and breakup emails." },
  { q: "How does AI personalization work?", a: "Point it at the prospect's website or LinkedIn and it drafts a one-line icebreaker or rewrites tone, which you can accept, edit or discard." },
  { q: "Can I see which templates perform best?", a: "Yes, every template shows historical reply rate across every campaign that used it, so you can promote winners into your team library." },
];

export const Route = createFileRoute("/product/templates")({
  head: () => metaFor(
    "Cold Email Templates Library — MunchReach",
    "Proven cold email templates with variables, spintax and AI personalization, ready to drop into any sequence.",
    "/product/templates",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: FileX, title: "Staring at a blank first email", text: "Every new campaign starts from a blinking cursor, and the first draft always takes an hour longer than it should." },
  { icon: Repeat, title: "The same wording, every send", text: "Copy-pasted templates with no variation get fingerprinted by spam filters and blend into every other cold email in the inbox." },
  { icon: ShieldAlert, title: "No idea what's actually working", text: "Your best rep has a template that converts twice as well, but it's buried in their sent folder instead of the team library." },
];

const solutionRows = [
  {
    eyebrow: "Library",
    title: "Start from a template gallery, not a blank page",
    text: "Browse proven sequences by industry, offer type and sequence step, then insert one directly into a campaign with variables already wired up.",
    bullets: ["Grouped by industry and offer type", "Full 3-4 step sequences, not single emails", "One-click insert into any campaign step"],
    visual: (
      <MockPanel title="Template gallery">
        <MockRows rows={[
          { left: "SaaS — Free trial expiring", muted: "4-step sequence", right: "38% reply" },
          { left: "Agency — Case study drop", muted: "3-step sequence", right: "29% reply" },
          { left: "Recruiter — Passive candidate", muted: "3-step sequence", right: "24% reply" },
          { left: "Local services — Referral ask", muted: "2-step sequence", right: "31% reply" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Personalization",
    title: "Variables, spintax and AI keep every send unique",
    text: "Merge fields with safe fallbacks, spintax phrase variants, and AI-generated icebreakers mean no two prospects get the exact same wording.",
    bullets: ["{{first_name}}, {{company}}, custom fields with fallbacks", "Spintax variants reduce fingerprinting", "AI icebreaker drawn from the prospect's website"],
    visual: (
      <MockPanel title="Editing — Step 1 email">
        <MockRows rows={[
          { left: "Subject", right: "Quick one, {{first_name}}?" },
          { left: "Icebreaker", muted: "AI-generated from acme.com", right: "Ready" },
          { left: "Spintax variants", right: "3 active" },
          { left: "Spam-word check", right: "Passed", badge: "Clean" },
        ]} />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Team library",
    title: "Promote your best-performing templates automatically",
    text: "Every template tracks its own reply rate across every campaign it's used in, so the whole team can find and reuse what actually works.",
    visual: (
      <MockPanel title="Team library — Top performers">
        <MockRows rows={[
          { left: "\"Saw your Series B\" opener", right: "41% reply", badge: "Top" },
          { left: "Breakup email v2", right: "18% reply" },
          { left: "Referral-based intro", right: "27% reply" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Sparkles, title: "Curated library", text: "Templates grouped by industry, offer type and sequence position." },
  { icon: FileText, title: "One-click insert", text: "Drop any template into a campaign step and edit inline." },
  { icon: Wand2, title: "Variables and fallbacks", text: "first_name, company, industry and custom fields with safe defaults." },
  { icon: Variable, title: "AI rewriting", text: "Adjust tone, shorten, or generate an icebreaker from the prospect's website." },
  { icon: FolderOpen, title: "Team templates", text: "Save your best performers and share them across the workspace." },
  { icon: Copy, title: "Version history", text: "Keep track of what changed and roll back a template at any time." },
];

const steps = [
  { title: "Browse the library", text: "Filter by use case, industry and sequence step." },
  { title: "Insert into a step", text: "The template arrives with variables already wired up." },
  { title: "Personalize", text: "Add your offer, proof and a single clear call to action." },
  { title: "Track and iterate", text: "Promote the templates with the best reply rate into your team library." },
];

const stats = [
  { value: "120+", label: "Templates in the library" },
  { value: "4 steps", label: "Avg. sequence length included" },
  { value: "3.4x", label: "Faster campaign launch vs. blank draft" },
  { value: "38%", label: "Top-performing template reply rate" },
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow={"Templates"}
        title={"Proven outreach templates,"}
        highlight={"ready to send"}
        description={"Start from a library of cold email templates for agencies, recruiters, SaaS and local services — then adapt them with variables, spintax and AI personalization."}
        secondaryCta="Browse Templates"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Template library"
        title="Write less, send better"
        description="Cold emails, follow-ups and subject lines you can reuse in a click."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="How MunchReach solves it" description="A gallery of proven sequences, personalized automatically.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="How it works" muted>
        <StepList steps={steps} />
      </Section>
      <Section>
        <StatStrip stats={stats} />
      </Section>
      <TestimonialCarousel page="templates" title="Copy that gets replies" />
      <Section title="Details that matter">
        <BulletList items={["Templates for step one, bump and breakup emails", "Spintax variants to reduce fingerprinting", "Preview rendered against a real prospect", "Deliverability linting for spam trigger words", "Shared team folders", "Export and import templates as JSON"]} />
      </Section>
      <Section muted>
        <PageFaqs page="templates" defaults={faqs} />
      </Section>
      <CtaBlock title={"Start from a template that already works"} description={"Skip the blank page and launch a proven sequence today."} />
    </MarketingLayout>
  );
}
