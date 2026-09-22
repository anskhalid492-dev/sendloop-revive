import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Clock3,
  Inbox,
  Layers3,
  Mail,
  MessageSquareReply,
  RefreshCw,
  Send,
  Users,
  Workflow,
} from "lucide-react";

import dashboardAsset from "@/assets/munchreach-dashboard.png.asset.json";
import inboxAsset from "@/assets/munchreach-unified-inbox.png.asset.json";
import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () =>
    metaFor(
      "About MunchReach — The Founder Story",
      "The honest story of how six years in outbound, failed businesses, agency work and 30M+ cold emails led to MunchReach.",
      "/about",
    ),
  component: About,
});

const storyChapters = [
  {
    marker: "2020",
    title: "Where it started",
    body: [
      "I stepped into client acquisition in 2020. I wasn't building software. I was trying to figure out how to get clients.",
      "So I learned cold email by sending it. I learned cold calling by making the calls. I learned sales by getting ignored, rejected, ghosted and, occasionally, getting a yes.",
    ],
  },
  {
    marker: "THE MESSY PART",
    title: "Failed businesses. Useful lessons.",
    body: [
      "I started and failed at multiple businesses along the way. Plenty of things simply didn't work. I don't look back and pretend every failure was secretly a win. Some were just failures.",
      "But they forced me to pay attention: how prospects think, why people reply, why they don't, what makes an email feel human, and what makes it feel automated the second you open it.",
    ],
  },
  {
    marker: "THE WORK",
    title: "I kept doing the work",
    body: [
      "Over the years, I built and grew client acquisition agencies. I tested messaging and offers, built systems, watched campaigns work, watched campaigns fail, and documented what I was learning along the way.",
      "The more campaigns I ran, the clearer the real problem became: outbound wasn't one task. It was a chain of decisions spread across too many places.",
    ],
  },
];

const movingParts = [
  "The right prospect",
  "The right message",
  "The right timing",
  "The right follow-up",
  "The right mailbox",
  "The right sending pace",
  "The reply",
  "The next action",
];

const scatteredTools = [
  { label: "Campaigns", icon: Send },
  { label: "Leads", icon: Users },
  { label: "Inboxes", icon: Inbox },
  { label: "Warmup", icon: RefreshCw },
  { label: "Analytics", icon: BarChart3 },
  { label: "CRM", icon: Layers3 },
  { label: "Automation", icon: Workflow },
];

const productFlow = [
  "Leads",
  "Campaigns",
  "Sequences",
  "AI personalization",
  "Follow-ups",
  "Sending accounts",
  "Unified Inbox",
  "CRM",
  "Analytics",
  "Automation",
];

const principles = [
  {
    number: "01",
    title: "Good outbound starts with the right prospect.",
    text: "Better targeting gives the message a reason to matter before a word is written.",
  },
  {
    number: "02",
    title: "Personalization should make a message more relevant, not more robotic.",
    text: "The goal isn't to prove that software found a detail. It's to make the conversation worth having.",
  },
  {
    number: "03",
    title: "Follow-ups matter as much as the first email.",
    text: "A good sequence respects timing and context instead of repeating the same ask louder.",
  },
  {
    number: "04",
    title: "Software should remove work.",
    text: "It shouldn't create another dashboard that needs to be managed for its own sake.",
  },
  {
    number: "05",
    title: "The best product decisions start with real problems.",
    text: "That keeps MunchReach close to the work it is supposed to make easier.",
  },
];

function StoryLabel({ children }: { children: string }) {
  return (
    <span className="text-xs font-bold tracking-normal text-primary uppercase">
      {children}
    </span>
  );
}

function FounderQuote({ children }: { children: string }) {
  return (
    <Reveal>
      <blockquote className="mx-auto max-w-5xl border-l-2 border-primary py-3 pl-5 sm:py-6 sm:pl-10">
        <p className="text-2xl leading-snug font-semibold text-balance sm:text-4xl lg:text-5xl">
          “{children}”
        </p>
        <footer className="mt-5 text-sm text-muted-foreground">Founder, MunchReach</footer>
      </blockquote>
    </Reveal>
  );
}

function About() {
  return (
    <MarketingLayout>
      <article className="overflow-hidden">
        <section className="hero-glow border-b border-border/60">
          <div className="mx-auto grid min-h-[34rem] max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_0.7fr] lg:py-20">
            <Reveal>
              <StoryLabel>THE STORY BEHIND MUNCHREACH</StoryLabel>
              <h1 className="mt-5 max-w-4xl text-4xl leading-[1.04] font-extrabold text-balance sm:text-6xl lg:text-7xl">
                Built From Years of Doing Outbound <span className="text-gradient">the Hard Way.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Before MunchReach was software, it was a problem I lived with for years.
              </p>
              <a
                href="#the-story"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                Read the story <ArrowDown className="size-4" />
              </a>
            </Reveal>

            <Reveal delay={120} className="lg:justify-self-end">
              <div className="relative mx-auto w-full max-w-sm border-y border-border py-7 lg:mx-0">
                <span className="absolute -left-2 top-6 size-4 rounded-full border-4 border-background bg-primary" />
                <p className="text-7xl leading-none font-extrabold text-primary sm:text-8xl">2020</p>
                <p className="mt-3 max-w-xs text-base leading-relaxed text-muted-foreground">
                  I entered outbound with an agency, no perfect roadmap, and a lot to learn.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="the-story" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <Reveal>
              <div className="lg:sticky lg:top-32">
                <StoryLabel>THE BEGINNING</StoryLabel>
                <h2 className="mt-4 text-4xl leading-tight font-bold text-balance sm:text-5xl">
                  Dropped Out. Failed. Kept Building.
                </h2>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
                <p className="text-2xl leading-relaxed font-medium text-foreground">
                  I dropped out of college. I wasn't following the traditional path, and I didn't
                  have everything figured out.
                </p>
                <p>
                  There was no perfect roadmap telling me what business to build or how any of it
                  was supposed to work. I started with client acquisition. Then came the failures.
                  Then the lessons. Then more outbound, more clients and more campaigns.
                </p>
                <p>
                  I didn't become obsessed with outbound because it looked cool. I became obsessed
                  with it because I had to figure it out.
                </p>
                <p>
                  Dropping out wasn't a shortcut to success. It just meant the next lessons came
                  from trying things in the real world, often before I felt ready.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <ol className="relative space-y-16 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-border sm:space-y-24">
              {storyChapters.map((chapter, index) => (
                <li key={chapter.title} className="relative grid gap-6 pl-12 sm:grid-cols-[12rem_1fr] sm:gap-12 sm:pl-16">
                  <span className="absolute left-0 top-1 flex size-8 items-center justify-center rounded-full border border-primary/30 bg-background">
                    <span className="size-2 rounded-full bg-primary" />
                  </span>
                  <Reveal delay={index * 80}>
                    <StoryLabel>{chapter.marker}</StoryLabel>
                  </Reveal>
                  <Reveal delay={index * 80 + 60}>
                    <h2 className="text-2xl font-bold sm:text-3xl">{chapter.title}</h2>
                    <div className="mt-4 space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                      {chapter.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <div className="max-w-3xl">
                <StoryLabel>THE EXPERIENCE</StoryLabel>
                <h2 className="mt-4 text-4xl leading-tight font-bold text-balance sm:text-5xl">
                  6+ Years of Learning Outbound the Hard Way
                </h2>
              </div>
            </Reveal>
            <div className="mt-12 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <Reveal>
                <div className="space-y-5 text-lg leading-relaxed text-muted-foreground">
                  <p>
                    Those years put me close to cold email, cold calling, lead generation, client
                    acquisition, sales systems, campaign management, follow-ups, personalization,
                    deliverability, reply management, CRM workflows and automation.
                  </p>
                  <p className="font-medium text-foreground">
                    Outbound looks simple from the outside. Find someone. Send an email. Get a reply.
                  </p>
                  <p>
                    In reality, there are dozens of moving parts between those three steps. Once you
                    start doing it at scale, the complexity becomes obvious.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
                  {movingParts.map((part, index) => (
                    <div key={part} className="min-h-28 border-b border-r border-border p-4">
                      <span className="text-xs font-semibold text-primary">0{index + 1}</span>
                      <p className="mt-5 text-sm font-semibold">{part}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-primary/20 bg-primary text-primary-foreground">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-chart-5 opacity-80" />
          <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_0.85fr] lg:items-end">
            <Reveal>
              <p className="text-[clamp(4.5rem,14vw,11rem)] leading-[0.8] font-extrabold tabular-nums">30M+</p>
              <h2 className="mt-6 text-2xl font-bold sm:text-4xl">Cold Emails Sent</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="max-w-xl text-lg leading-relaxed text-primary-foreground/85 sm:text-xl">
                That's not a vanity number for me. It's years of testing, learning, failing,
                rebuilding and figuring out what actually happens when you put an outbound system
                in front of real prospects.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <Reveal>
                <StoryLabel>THE TURNING POINT</StoryLabel>
                <h2 className="mt-4 text-4xl leading-tight font-bold text-balance sm:text-5xl">
                  From Running Outreach for Clients to Building the Tool Myself
                </h2>
                <div className="mt-7 space-y-5 text-lg leading-relaxed text-muted-foreground">
                  <p>
                    The agency taught me how businesses actually approach client acquisition. It
                    also exposed the limitations of the tools behind it.
                  </p>
                  <p>
                    Managing multiple clients made every disconnected handoff more painful. One tool
                    held the campaigns. Another held the leads. Replies, warmup, analytics, CRM and
                    automation all lived somewhere else.
                  </p>
                  <p className="font-medium text-foreground">
                    I wasn't sitting around trying to think of a SaaS idea. The SaaS idea came from
                    the work. After years of running outbound, I knew exactly which parts were
                    painful. So I started building.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="relative mx-auto grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
                  {scatteredTools.map((tool, index) => (
                    <div
                      key={tool.label}
                      className={`rounded-lg border border-border bg-card p-4 shadow-sm ${index === 6 ? "col-span-2 sm:col-span-1" : ""}`}
                    >
                      <tool.icon className="size-5 text-primary" />
                      <p className="mt-5 text-sm font-semibold">{tool.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Another place to manage</p>
                    </div>
                  ))}
                  <div className="col-span-2 flex items-center gap-3 border-t border-primary/30 pt-4 sm:col-span-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Layers3 className="size-4" />
                    </span>
                    <p className="font-semibold">There had to be a better way to run outbound.</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <div className="mx-auto max-w-3xl text-center">
                <StoryLabel>THE REASON</StoryLabel>
                <h2 className="mt-4 text-4xl font-bold sm:text-5xl">Why I Built MunchReach</h2>
                <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                  MunchReach wasn't born from a startup idea written on a whiteboard. It came from
                  years of actually doing outbound and wanting one connected place for the work.
                </p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="mt-12 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-glow)] sm:p-5">
                <img
                  src={dashboardAsset.url}
                  alt="MunchReach workspace showing campaigns and outbound activity"
                  className="aspect-[16/9] w-full rounded-md object-cover object-top"
                />
              </div>
            </Reveal>
            <Reveal>
              <div className="mt-10 grid grid-cols-2 border-l border-t border-border sm:grid-cols-5">
                {productFlow.map((item) => (
                  <div key={item} className="border-b border-r border-border px-3 py-4 text-center text-sm font-semibold">
                    {item}
                  </div>
                ))}
              </div>
              <p className="mx-auto mt-8 max-w-3xl text-center text-lg leading-relaxed text-muted-foreground">
                I wanted the workflow to make sense to someone who had actually run outbound. Every
                feature should solve a real problem. Every workflow should remove unnecessary work.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <FounderQuote>
              I didn't build MunchReach because I wanted to build another cold email tool. I built
              it because I was tired of using too many tools to do something I had already spent
              years doing.
            </FounderQuote>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <StoryLabel>THE BUILD</StoryLabel>
              <h2 className="mt-4 text-4xl font-bold sm:text-5xl">Built From Scratch</h2>
              <div className="mt-7 space-y-5 text-lg leading-relaxed text-muted-foreground">
                <p>
                  Building the product has been a completely different challenge from running an
                  agency. With an agency, if something breaks, you fix the process. With software,
                  you have to fix the system.
                </p>
                <p>
                  A campaign can't just work for one customer. It has to keep working as more people,
                  more mailboxes and more data move through it. A workflow can't just work once. It
                  has to remain understandable when everything gets bigger.
                </p>
                <p>
                  That changed how I think about architecture, campaign infrastructure, scheduling,
                  sending, replies, AI personalization, analytics, integrations, reliability and the
                  customer experience. Not as a technical checklist, but as parts of one promise:
                  the product has to hold up when someone depends on it.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="overflow-hidden rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)]">
                <img
                  src={inboxAsset.url}
                  alt="MunchReach Unified Inbox connecting replies with outreach context"
                  className="aspect-[4/3] w-full rounded-md object-cover object-left-top"
                />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <div className="lg:sticky lg:top-32">
                <StoryLabel>AFTER LAUNCH</StoryLabel>
                <h2 className="mt-4 text-4xl leading-tight font-bold text-balance sm:text-5xl">
                  Nobody Sees the Part That Happens After the Launch
                </h2>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
                <p>
                  Building something yourself means there are plenty of nights where the product is
                  not doing what you want it to do. You fix it. Then something else breaks. You fix
                  that too.
                </p>
                <p>
                  There are bugs, features that need rebuilding, decisions that need questioning and
                  technical systems that have to be learned properly. The work is a constant rhythm
                  of listening to actual users, shipping, fixing and improving.
                </p>
                <p className="text-2xl leading-relaxed font-medium text-foreground">
                  Eventually, you look back and realize the product is no longer the thing you
                  imagined on day one. It's better because reality forced you to build it differently.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-border/60 bg-foreground py-20 text-background sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <blockquote className="mx-auto max-w-5xl text-center">
                <BrainCircuit className="mx-auto size-8 text-primary" />
                <p className="mt-8 text-3xl leading-snug font-semibold text-balance sm:text-5xl">
                  “Every feature exists because I needed it myself before I ever asked someone else
                  to use it.”
                </p>
                <footer className="mt-6 text-sm text-background/60">Founder, MunchReach</footer>
              </blockquote>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <div className="max-w-3xl">
                <StoryLabel>THE PHILOSOPHY</StoryLabel>
                <h2 className="mt-4 text-4xl font-bold sm:text-5xl">What I Believe About Outbound</h2>
                <p className="mt-5 text-lg text-muted-foreground">
                  These aren't universal laws. They're the principles years in the work have taught me.
                </p>
              </div>
            </Reveal>
            <ol className="mt-12 border-t border-border">
              {principles.map((principle, index) => (
                <Reveal key={principle.number} delay={index * 50}>
                  <li className="grid gap-3 border-b border-border py-7 sm:grid-cols-[5rem_1fr_1fr] sm:items-start sm:gap-8">
                    <span className="text-sm font-bold text-primary">{principle.number}</span>
                    <h3 className="text-lg font-semibold leading-snug">{principle.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{principle.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="hero-glow border-y border-border/60 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <Reveal>
              <StoryLabel>THE VISION</StoryLabel>
              <h2 className="mt-4 text-4xl font-bold sm:text-5xl">This Is Just the Beginning</h2>
            </Reveal>
            <Reveal delay={100}>
              <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
                <p>
                  The long-term vision is to make MunchReach the complete workspace for businesses
                  that rely on outbound — without turning it into a maze of features.
                </p>
                <p>
                  Simpler outbound. Better connected workflows. Less tool fragmentation. Clearer
                  visibility into what is happening and what needs attention next.
                </p>
                <p className="font-medium text-foreground">
                  The goal is simple: help teams spend more time having better conversations and less
                  time managing the tools around them.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Reveal>
              <Mail className="mx-auto size-8 text-primary" />
              <h2 className="mt-6 text-4xl font-bold sm:text-6xl">Thanks for Being Here.</h2>
              <div className="mx-auto mt-7 max-w-2xl space-y-4 text-lg leading-relaxed text-muted-foreground">
                <p>
                  If you've ever built something from scratch, started a business without knowing
                  exactly what you were doing, sent hundreds of emails with no reply, or simply tried
                  to figure out how to get your next customer — you probably understand a little bit
                  of why MunchReach exists.
                </p>
                <p className="font-medium text-foreground">
                  I built this from the problems I experienced myself. And I'm still building it.
                </p>
              </div>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/signup">
                    Try MunchReach <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/features">Explore the Platform</Link>
                </Button>
              </div>
              <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="size-4" /> Still learning. Still listening. Still building.
              </p>
            </Reveal>
          </div>
        </section>
      </article>
    </MarketingLayout>
  );
}