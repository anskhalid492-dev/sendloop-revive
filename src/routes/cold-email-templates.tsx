import { createFileRoute } from "@tanstack/react-router";
import { FileWarning, Copy, Repeat } from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  CtaBlock,
  FaqBlock,
  PainPoints,
  StatStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

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
      "Free Cold Email Templates That Get Replies",
      "Copy-and-paste cold email templates for agencies, SaaS, recruiters and local services, with follow-ups and breakup emails.",
      "/cold-email-templates",
      faqs,
    ),
  component: Templates,
});

const painPoints = [
  { icon: FileWarning, title: "Generic templates get ignored", text: "Copy-pasted openers with obvious mail-merge tokens are instantly recognizable and get deleted before the second line." },
  { icon: Copy, title: "Starting from a blank page every time", text: "Without a proven structure, teams spend hours rewriting the same opener instead of iterating on what already converts." },
  { icon: Repeat, title: "Sequences that fizzle after email one", text: "Most templates online are single emails, not a full sequence with the follow-up logic that actually drives replies over time." },
];

const stats = [
  { value: "6", label: "Ready-to-use templates" },
  { value: "4", label: "Steps in a full sequence" },
  { value: "<90", label: "Recommended words, first touch" },
  { value: "3–4", label: "Ideal follow-up count" },
];

const categories = ["All", "Agencies", "SaaS", "Recruiting", "Local Services", "Follow-ups"];

const templates = [
  {
    name: "The specific observation opener",
    use: "Step 1 · Agencies",
    subject: "your {{company}} careers page",
    body: `Hi {{first_name}},\n\nNoticed {{company}} is hiring three SDRs this quarter — usually that means pipeline targets went up before headcount could catch up.\n\nWe run outbound for teams in that exact gap and typically book 8–12 qualified meetings a month while the team ramps.\n\nWorth a 10-minute look?\n\n{{sender_name}}`,
  },
  {
    name: "The result-first pitch",
    use: "Step 1 · SaaS",
    subject: "cutting onboarding time at {{company}}",
    body: `Hi {{first_name}},\n\nWe cut onboarding time from 21 days to 6 for {{similar_company}}, which took their month-one churn down by a third.\n\nIf {{company}} is measuring time-to-value, I can show you exactly how in 10 minutes.\n\nOpen to it?\n\n{{sender_name}}`,
  },
  {
    name: "The soft bump",
    use: "Step 2 · Any",
    subject: "(reply in thread)",
    body: `Hi {{first_name}},\n\nBumping this in case it slipped past — happy to send a two-minute overview instead of a call if that is easier.\n\n{{sender_name}}`,
  },
  {
    name: "The proof follow-up",
    use: "Step 3 · Any",
    subject: "(reply in thread)",
    body: `Hi {{first_name}},\n\nSharing a short case study from {{similar_company}} — same team size, same problem, 3x reply rate in six weeks.\n\nIf the timing is wrong, tell me when to check back.\n\n{{sender_name}}`,
  },
  {
    name: "The breakup",
    use: "Step 4 · Any",
    subject: "(reply in thread)",
    body: `Hi {{first_name}},\n\nI will stop here so I am not cluttering your inbox. If outbound moves up the priority list at {{company}}, reply to this thread and I will pick it back up.\n\nAll the best,\n{{sender_name}}`,
  },
  {
    name: "The candidate outreach",
    use: "Step 1 · Recruiting",
    subject: "{{role}} at {{client_company}}",
    body: `Hi {{first_name}},\n\nYour work on {{project}} lines up closely with a {{role}} role I am hiring for — remote, {{salary_range}}, small team with real ownership.\n\nWant the full brief?\n\n{{sender_name}}`,
  },
  {
    name: "The local service referral angle",
    use: "Step 1 · Local Services",
    subject: "quick question about {{company}}'s bookings",
    body: `Hi {{first_name}},\n\nA few businesses near {{city}} mentioned they're missing calls during peak hours. If that's true for {{company}} too, we've built a simple fix that pays for itself in a week.\n\nMind if I send the two-minute version?\n\n{{sender_name}}`,
  },
  {
    name: "The re-engagement email",
    use: "Follow-up · Any",
    subject: "still relevant?",
    body: `Hi {{first_name}},\n\nIt's been a while since we last spoke about {{topic}} — has anything changed on your end that would make this worth revisiting?\n\n{{sender_name}}`,
  },
];

const personalizationTips = [
  "Pull one fact from their website, LinkedIn post or job listing — not their industry in general",
  "Reference a trigger event: funding, hiring, a launch, a review, or a leadership change",
  "Use variables with a sensible fallback so a missing field never breaks the sentence",
  "Keep the personalization line first, not buried after your pitch",
  "Validate a sample of 20 personalized rows manually before sending the full batch",
  "Avoid personalization that just restates the company name back to them",
];

function Templates() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Templates"
        title="Free cold email templates"
        highlight="that earn replies"
        description="A full sequence you can copy today: opener, bump, proof and breakup — plus industry variants for agencies, SaaS and recruiting."
        primaryCta="Use These in Sendloop"
      />


      <Section title="At a glance">
        <StatStrip stats={stats} />
      </Section>

      <Section title="Browse by category">
        <div className="flex flex-wrap gap-2">
          {categories.map((c, i) => (
            <span
              key={c}
              className={
                i === 0
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              }
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <article key={t.name} className="surface-card flex flex-col p-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">{t.use}</span>
              <h2 className="mt-2 text-lg font-semibold">{t.name}</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Subject:</span> {t.subject}
              </p>
              <pre className="mt-3 flex-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {t.body}
              </pre>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Personalization tips that actually move reply rate" muted>
        <ul className="grid gap-3 sm:grid-cols-2">
          {personalizationTips.map((tip) => (
            <li key={tip} className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {tip}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Writing rules that hold up">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            "One idea, one ask, one call to action",
            "Lead with the prospect, not your company",
            "Replace adjectives with numbers",
            "Write at a sixth-grade reading level",
            "No attachments and at most one link",
            "Make the reply easy: yes or not now",
          ].map((r) => (
            <div key={r} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              {r}
            </div>
          ))}
        </div>
      </Section>

      <Section muted>
        <FaqBlock faqs={faqs} title="Questions about templates" />
      </Section>

      <TestimonialCarousel page="cold-email-templates" />

      <CtaBlock
        title="Load these into a live sequence"
        description="Import the full four-step sequence into Sendloop and launch it against your list today."
      />
    </MarketingLayout>
  );
}
