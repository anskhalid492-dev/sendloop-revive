import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Braces,
  Building2,
  CheckCircle2,
  Gauge,
  KeyRound,
  ListChecks,
  MapPin,
  PenLine,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";

import {
  MarketingLayout,
  MockPanel,
  MockRows,
  Section,
  metaFor,
} from "@/components/site/MarketingPage";
import { PageFaqs } from "@/components/site/PageFaqs";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Button } from "@/components/ui/button";

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
      "AI Cold Email Personalization With Your OpenAI Key",
      "Write a unique opener for every prospect with your own OpenAI key. Real lead data, full editing control, no per-credit markup.",
      "/ai-personalized-outreach",
      faqs,
    ),
  component: Page,
});

/* ---------------------------------------------------------------- helpers */

type Tint = "sky" | "amber" | "rose" | "mint" | "violet";

const tintCard: Record<Tint, string> = {
  sky: "bg-tint-sky text-tint-sky-foreground",
  amber: "bg-tint-amber text-tint-amber-foreground",
  rose: "bg-tint-rose text-tint-rose-foreground",
  mint: "bg-tint-mint text-tint-mint-foreground",
  violet: "bg-tint-violet text-tint-violet-foreground",
};

function ColorCard({
  tint,
  title,
  text,
  children,
  className = "",
}: {
  tint: Tint;
  title: string;
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-3xl p-7 ${tintCard[tint]} ${className}`}
    >
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-sm opacity-80">{text}</p>
      {children ? <div className="mt-6 flex-1">{children}</div> : null}
    </div>
  );
}

/** Small email-like card used inside the colorful bento tiles. */
function NoteCard({
  from,
  line,
  tag,
}: {
  from: string;
  line: string;
  tag?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/80 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">{from}</span>
        {tag ? (
          <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
            {tag}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{line}</p>
    </div>
  );
}

function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/50 px-4 py-3">
        <span className="size-2.5 rounded-full bg-destructive/50" />
        <span className="size-2.5 rounded-full bg-warning/60" />
        <span className="size-2.5 rounded-full bg-success/60" />
        <span className="ml-3 truncate rounded-md bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">
          app.munchreach.com / campaigns / q4-outbound / ai
        </span>
      </div>
      <div className="bg-background p-4 sm:p-6">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ data */

const heroChips = [
  "Your own OpenAI key",
  "Grounded in real lead data",
  "Editable before send",
  "No per-credit markup",
];

const featureBlocks = [
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
  { icon: UserRound, title: "Person", text: "First name, last name and job title." },
  { icon: Building2, title: "Company", text: "Company name, website and description." },
  { icon: MapPin, title: "Location", text: "City, state and country for regional angles." },
  { icon: ListChecks, title: "Industry", text: "Industry or your own equivalent field." },
  { icon: PenLine, title: "Lead notes", text: "The latest note your team already wrote." },
  { icon: Braces, title: "Custom fields", text: "Anything you imported with your CSV." },
];

const steps = [
  {
    icon: KeyRound,
    title: "Connect your OpenAI key",
    text: "Add the key once per workspace in the AI tab. We verify it with OpenAI before saving it.",
  },
  {
    icon: Wand2,
    title: "Describe the angle",
    text: "Plain-English instructions, tone, length and language — plus the lead fields the model may use.",
  },
  {
    icon: Sparkles,
    title: "Preview on a real lead",
    text: "Generate against an actual record from your list and refine until it sounds like you.",
  },
  {
    icon: Gauge,
    title: "Generate for the whole list",
    text: "A background worker processes recipients in small batches so nothing overloads your account.",
  },
  {
    icon: Send,
    title: "Review and launch",
    text: "Edit what needs a human touch, then launch. The variable is replaced per lead at send time.",
  },
];

const controls = [
  "Three depth levels — light, balanced and deep",
  "Five tones from professional to curious, any output language",
  "Length caps of one line, two lines or a short paragraph",
  "An example output field so the model matches your style",
  "Per-campaign fallback: fallback text, skip, or hold the lead",
  "Automatic retries and per-workspace rate handling",
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

const relatedLinks = [
  { to: "/features", title: "All features", text: "Everything included in the platform." },
  { to: "/how-it-works", title: "How it works", text: "Domain setup to first reply." },
  { to: "/integrations", title: "Integrations", text: "Sync lead data with your stack." },
  { to: "/product/crm", title: "CRM", text: "Notes and custom fields become material." },
  { to: "/product/campaigns", title: "Campaigns", text: "Sequences, follow-ups and sending." },
  { to: "/pricing", title: "Pricing", text: "AI is billed by OpenAI, not by us." },
];

/* ------------------------------------------------------------------ page */

function Page() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
              <Sparkles className="size-3.5" /> AI Personalization
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-6xl">
              AI-powered cold outreach{" "}
              <span className="text-gradient">personalization at scale</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Connect your own OpenAI key and MunchReach writes a unique opening line for every
              lead from the data on their record — reviewed by you, sent by your campaign.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/auth">
                  Start for Free <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">See Pricing</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {heroChips.map((chip) => (
                <li key={chip} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-primary" /> {chip}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-14">
            <BrowserFrame>
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
            </BrowserFrame>
          </div>
        </div>
      </section>

      {/* Colorful bento */}
      <Section
        title="Personalization that actually reads like research"
        description="Four things that change the moment the AI works from real lead data instead of a template."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ColorCard
            tint="rose"
            title="Stop sending the same email to everyone"
            text="Every prospect gets an opener written from what is actually on their record — not a merge tag wrapped in the same sentence."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <NoteCard
                from="Maya · Northwind Labs"
                line="Hiring three SDRs this quarter usually means the outbound motion is about to get louder."
                tag="Unique"
              />
              <NoteCard
                from="Daniel · Brightpath"
                line="Running growth and product at once is the part most founder-led teams underestimate."
                tag="Unique"
              />
              <NoteCard
                from="Tom · Fielded"
                line="Leading sales in Austin for a field-service platform is a very specific kind of busy."
                tag="Unique"
              />
              <NoteCard
                from="Priya · Loopwise"
                line="Most ops teams inherit three tools that all claim to own the pipeline."
                tag="Unique"
              />
            </div>
          </ColorCard>

          <ColorCard
            tint="amber"
            title="Create personalization your way"
            text="Write plain-English instructions, choose a tone, a length and a language, then lock which lead fields the model is allowed to touch."
          >
            <div className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
              <p className="text-xs font-semibold text-foreground">Instructions</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                “Open with one observation about their hiring or product motion. Never mention
                funding. Max two lines, curious tone.”
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Curious", "2 lines", "English", "Balanced depth"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </ColorCard>

          <ColorCard
            tint="violet"
            title="Personalize at volume without the research hours"
            text="Queue an entire list and watch generation progress live in small, safe batches while you finish the rest of the campaign setup."
          >
            <div className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>Generating 1,248 leads</span>
                <span className="text-primary">72%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[72%] rounded-full bg-primary" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {[
                  ["898", "Ready"],
                  ["312", "In queue"],
                  ["38", "Needs review"],
                ].map(([n, l]) => (
                  <div key={l} className="rounded-xl bg-muted/60 py-2">
                    <p className="text-sm font-bold text-foreground">{n}</p>
                    <p className="text-[11px] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </ColorCard>

          <ColorCard
            tint="mint"
            title="AI-assisted, human-approved"
            text="Nothing leaves the platform unread. Edit, regenerate or hold any lead — the campaign sends only what you accepted."
          >
            <div className="space-y-2">
              {[
                ["maya@northwindlabs.com", "Approved"],
                ["d.okafor@brightpath.io", "Edited by you"],
                ["tom@fielded.co", "Held for review"],
              ].map(([email, status]) => (
                <div
                  key={email}
                  className="flex items-center justify-between rounded-xl border border-border/40 bg-background/80 px-3 py-2.5 backdrop-blur"
                >
                  <span className="truncate text-xs font-medium text-foreground">{email}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{status}</span>
                </div>
              ))}
            </div>
          </ColorCard>
        </div>

        {/* Wide sky panel */}
        <ColorCard
          tint="sky"
          title="Start sending personalized email campaigns today"
          text="Connect a key, preview on a real lead from your list, and launch a sequence where every first line was written for that one person."
          className="mt-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["1", "Connect your key", "Verified with OpenAI before we store it."],
              ["2", "Preview on a lead", "Refine until the copy sounds like you."],
              ["3", "Launch the campaign", "Openers swap in per lead at send time."],
            ].map(([n, t, d]) => (
              <div
                key={t}
                className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur"
              >
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {n}
                </span>
                <p className="mt-3 text-sm font-semibold text-foreground">{t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Button asChild>
              <Link to="/auth">
                Start for Free <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </ColorCard>
      </Section>

      <TestimonialCarousel page="ai-personalization" title="What our customers are saying" />

      {/* Feature blocks */}
      <Section
        title="Powerful features to elevate your outreach"
        description="Your AI account, your data, your final say."
        muted
      >
        <div className="space-y-6">
          {featureBlocks.map((row, i) => (
            <div
              key={row.title}
              className="grid items-center gap-8 rounded-3xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-2"
            >
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
                  {row.eyebrow}
                </span>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">{row.title}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{row.text}</p>
                <ul className="mt-5 space-y-2">
                  {row.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>{row.visual}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Signals */}
      <Section
        title="Signals it can use"
        description="Only fields that actually hold data for that lead."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => (
            <div key={s.title} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <s.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Steps */}
      <Section title="From key to campaign in five steps" muted>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {steps.map((s, i) => (
            <div key={s.title} className="surface-card p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <s.icon className="size-4.5" />
                </span>
                <span className="text-xs font-semibold text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold">{s.title}</h3>
              <p className="mt-2 text-xs text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Controls + before/after */}
      <Section title="Controls you keep" description="Personalization you can tune, not a black box.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-card p-7">
            <h3 className="text-lg font-semibold">Tuning</h3>
            <ul className="mt-4 space-y-2.5">
              {controls.map((c) => (
                <li key={c} className="flex gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{c}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-secondary/40 p-6">
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Before
              </p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {beforeAfter.before.map((b) => (
                  <li key={b}>— {b}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                With MunchReach
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {beforeAfter.after.map((b) => (
                  <li key={b} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* Related */}
      <Section
        title="Integrate seamlessly with the rest of MunchReach"
        description="Personalization plugs into the workflow you already run."
        muted
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {relatedLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <h3 className="flex items-center justify-between text-base font-semibold">
                {link.title}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{link.text}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section>
        <PageFaqs page="ai-personalization" defaults={faqs} />
      </Section>

      {/* Final CTA band */}
      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-3xl bg-[image:var(--gradient-brand)] px-6 py-14 text-center text-primary-foreground sm:px-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Personalize your next campaign
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">
              Connect your OpenAI key, preview on a real lead, and send openers worth replying to.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/auth">Start for Free</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                asChild
              >
                <Link to="/pricing">View Pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
