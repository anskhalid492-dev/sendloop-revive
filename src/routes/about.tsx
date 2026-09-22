import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  Inbox,
  Layers3,
  RefreshCw,
  Send,
  Users,
  Workflow,
} from "lucide-react";

import analyticsAsset from "@/assets/munchreach-analytics.jpg.asset.json";
import inboxAsset from "@/assets/munchreach-unified-inbox.png.asset.json";
import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () =>
    metaFor(
      "About MunchReach | The Story Behind the Outbound Platform",
      "Learn how years of hands-on experience in client acquisition and outbound led to MunchReach, an all-in-one platform built to simplify campaigns, personalization, follow-ups, inboxes, CRM, and analytics.",
      "/about",
    ),
  component: About,
});

const learningAreas = [
  "Cold email",
  "Cold calling",
  "Lead generation",
  "Sales",
  "Follow-ups",
  "Offers",
  "Prospect research",
  "Client acquisition",
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

const platformCapabilities = [
  "Leads",
  "Campaigns",
  "Sequences",
  "AI Personalization",
  "Follow-Ups",
  "Sending Accounts",
  "Unified Inbox",
  "CRM",
  "Analytics",
  "Automation",
  "Workspaces",
];

const buildAreas = [
  "Campaign infrastructure",
  "Scheduling",
  "Sending",
  "Mailboxes",
  "Replies",
  "AI personalization",
  "Analytics",
  "Integrations",
  "CRM",
  "Reliability",
  "Customer experience",
];

const afterLaunchWork = [
  "Listening to customers",
  "Finding bugs",
  "Improving workflows",
  "Rebuilding weak systems",
  "Testing new features",
  "Improving reliability",
  "Simplifying the product",
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
    text: "The goal is not to prove that software found a detail. The goal is to make the conversation more relevant.",
  },
  {
    number: "03",
    title: "Follow-ups matter as much as the first email.",
    text: "Good sequences respect timing and context instead of simply repeating the same message.",
  },
  {
    number: "04",
    title: "Software should remove work.",
    text: "A platform should simplify the workflow, not create another dashboard that needs attention for its own sake.",
  },
  {
    number: "05",
    title: "The best product decisions start with real problems.",
    text: "MunchReach should remain close to the problems experienced by businesses actually running outbound.",
  },
];

function StoryLabel({ children }: { children: string }) {
  return <span className="text-xs font-bold tracking-normal text-primary uppercase">{children}</span>;
}

function SectionIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal>
      <div className="max-w-3xl">
        <StoryLabel>{eyebrow}</StoryLabel>
        <h2 className="mt-4 text-4xl leading-tight font-bold text-balance sm:text-5xl">{title}</h2>
        {children}
      </div>
    </Reveal>
  );
}

function About() {
  return (
    <MarketingLayout>
      <article className="overflow-hidden">
        <section className="hero-glow border-b border-border/60">
          <div className="mx-auto grid min-h-[36rem] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.3fr_0.7fr] lg:py-20">
            <Reveal>
              <StoryLabel>THE STORY BEHIND MUNCHREACH</StoryLabel>
              <h1 className="mt-5 max-w-4xl text-4xl leading-[1.04] font-extrabold text-balance sm:text-6xl lg:text-7xl">
                Built From Years of Doing Outbound <span className="text-gradient">the Hard Way.</span>
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                MunchReach was born from years of working directly in client acquisition, cold outreach,
                lead generation, sales systems, and campaign management.
              </p>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Before MunchReach became a platform, its core problems were experienced firsthand by
                Anas Khalid, Founder of MunchReach, while running real outbound campaigns and building
                client acquisition systems.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/features">
                    Explore MunchReach <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#the-story">
                    Read the Story <ArrowDown className="size-4" />
                  </a>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={120} className="lg:justify-self-end">
              <div className="relative mx-auto w-full max-w-sm border-y border-border py-8 lg:mx-0">
                <span className="absolute -left-2 top-8 size-4 rounded-full border-4 border-background bg-primary" />
                <p className="text-xs font-bold text-primary uppercase">THE STARTING POINT</p>
                <p className="mt-4 text-7xl leading-none font-extrabold text-primary sm:text-8xl">2020</p>
                <p className="mt-4 max-w-xs text-base leading-relaxed text-muted-foreground">
                  Client acquisition came first. The product idea came later, shaped by the work.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="the-story" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <SectionIntro eyebrow="THE BEGINNING" title="Dropped Out. Failed. Kept Building." />
            <Reveal delay={100}>
              <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
                <p className="text-2xl leading-relaxed font-medium text-foreground">
                  The MunchReach story did not begin with a polished startup plan.
                </p>
                <p>
                  Anas Khalid left college and took a path built around practical experience rather
                  than a traditional college-to-career route. In 2020, the early focus was client
                  acquisition: learning how businesses find customers and what makes outbound work.
                </p>
                <p>
                  There was no perfect roadmap. Some businesses and projects worked; others did not.
                  Successful campaigns, failed campaigns, difficult conversations, and continuous
                  testing all contributed lessons that later shaped MunchReach.
                </p>
                <p>
                  Leaving college was not a shortcut to success. It simply meant that many of the next
                  lessons came through direct execution in sales, messaging, and client acquisition.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-[0.38fr_1fr] lg:gap-20">
              <Reveal>
                <div className="lg:sticky lg:top-32">
                  <p className="text-[clamp(5rem,13vw,10rem)] leading-none font-extrabold text-primary">2020</p>
                  <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Where It Started</h2>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div>
                  <p className="max-w-3xl text-xl leading-relaxed text-foreground">
                    The founder stepped into client acquisition in 2020. The learning came through
                    actual execution rather than theory.
                  </p>
                  <div className="mt-10 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
                    {learningAreas.map((area, index) => (
                      <div key={area} className="min-h-28 border-r border-b border-border p-4">
                        <span className="text-xs font-bold text-primary">0{index + 1}</span>
                        <p className="mt-5 text-sm font-semibold">{area}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                    Real conversations, ignored emails, rejected offers, successful campaigns, failed
                    campaigns, and continuous testing created a practical education in outbound.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
            <SectionIntro eyebrow="THE MESSY PART" title="Failed Businesses. Useful Lessons.">
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                Not every business worked. Not every campaign worked. Not every offer found the right market.
              </p>
            </SectionIntro>
            <Reveal delay={100}>
              <div className="border-l-2 border-primary py-2 pl-6 sm:pl-10">
                <p className="text-2xl leading-relaxed font-medium text-foreground">
                  Those failures were not rewritten as hidden successes. They were simply part of the process.
                </p>
                <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                  They did, however, create practical understanding of how prospects think, why people
                  reply, why messages are ignored, what makes an email relevant, and what makes automated
                  outreach feel automated.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionIntro eyebrow="THE WORK" title="Years of Doing the Work">
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-muted-foreground">
                <p>
                  The founder continued building and operating client acquisition systems and agencies,
                  working across cold outreach, lead generation, campaigns, messaging, offers, follow-ups,
                  personalization, deliverability, reply management, sales systems, and automation.
                </p>
                <p className="font-medium text-foreground">
                  As more campaigns were managed, one problem became increasingly clear: outbound was not
                  one task. It was a connected workflow spread across too many tools.
                </p>
              </div>
            </SectionIntro>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionIntro eyebrow="THE EXPERIENCE" title="Years of Learning Outbound the Hard Way">
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                From the outside, outbound can look simple: find a prospect, send an email, and get a
                reply. In practice, every step contains its own decisions, systems, data, tools, and
                potential points of failure.
              </p>
            </SectionIntro>
            <Reveal delay={100}>
              <ol className="mt-12 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
                {movingParts.map((part, index) => (
                  <li key={part} className="min-h-32 border-r border-b border-border p-5 sm:min-h-36">
                    <span className="text-xs font-bold text-primary">0{index + 1}</span>
                    <p className="mt-7 text-sm font-semibold sm:text-base">{part}</p>
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal>
              <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                Years of working through those details created the experience that eventually shaped MunchReach.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-primary/20 bg-primary text-primary-foreground">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-chart-5 opacity-80" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_0.85fr] lg:items-end">
            <Reveal>
              <p className="text-[clamp(5rem,14vw,11rem)] leading-[0.8] font-extrabold tabular-nums">30M+</p>
              <h2 className="mt-6 text-2xl font-bold sm:text-4xl">Cold Emails Sent</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="max-w-xl text-lg leading-relaxed text-primary-foreground/85 sm:text-xl">
                More than 30 million cold emails represent years of testing, learning, rebuilding, and
                understanding what happens when outbound systems are placed in front of real prospects.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <SectionIntro eyebrow="THE TURNING POINT" title="From Running Outreach for Clients to Building the Platform">
                <div className="mt-7 space-y-5 text-lg leading-relaxed text-muted-foreground">
                  <p>
                    Years of agency and client acquisition work exposed the limitations of disconnected
                    tools. Managing multiple clients made every handoff between those tools more painful.
                  </p>
                  <p>
                    The problem was not that individual tools were useless. The problem was that the
                    workflow was fragmented. Campaigns lived in one place, leads in another, replies
                    somewhere else, and analytics somewhere else again.
                  </p>
                  <p className="font-medium text-foreground">
                    The MunchReach idea emerged from that operational reality.
                  </p>
                </div>
              </SectionIntro>
              <Reveal delay={120}>
                <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
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
                  <div className="col-span-2 border-t border-primary/30 pt-5 sm:col-span-3">
                    <p className="text-xl font-semibold">There had to be a better way to run outbound.</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionIntro eyebrow="THE REASON" title="Why MunchReach Was Built">
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground">
                <p>
                  MunchReach was not created simply to add another cold email tool to an already crowded market.
                </p>
                <p>
                  It was built from a practical problem: businesses running outbound were forced to
                  manage too many disconnected systems. The goal was to bring the workflow closer
                  together and make outbound easier to manage from one connected workspace.
                </p>
              </div>
            </SectionIntro>
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
              <div className="mt-10 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4 lg:grid-cols-6">
                {platformCapabilities.map((item) => (
                  <div key={item} className="border-r border-b border-border px-3 py-4 text-center text-sm font-semibold">
                    {item}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <aside className="mx-auto max-w-5xl border-l-2 border-primary py-4 pl-6 sm:py-8 sm:pl-10">
                <BrainCircuit className="size-7 text-primary" />
                <p className="mt-6 text-xs font-bold text-primary uppercase">A MUNCHREACH STATEMENT</p>
                <p className="mt-6 text-2xl leading-snug font-semibold text-balance sm:text-4xl lg:text-5xl">
                  MunchReach was built from years of working directly in outbound and seeing how much
                  unnecessary complexity businesses had to manage.
                </p>
              </aside>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/30 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
            <SectionIntro eyebrow="THE BUILD" title="Built From Real Problems, Not Just Product Ideas">
              <div className="mt-7 space-y-5 text-lg leading-relaxed text-muted-foreground">
                <p>
                  Building software is a different challenge from running an agency. With an agency,
                  a broken process can sometimes be fixed manually. With software, the system itself
                  has to work repeatedly, reliably, and at scale.
                </p>
                <p className="font-medium text-foreground">
                  That difference shaped how MunchReach is being built.
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {buildAreas.map((area) => (
                  <span key={area} className="rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold">
                    {area}
                  </span>
                ))}
              </div>
            </SectionIntro>
            <Reveal delay={120}>
              <div className="overflow-hidden rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)]">
                <img
                  src={inboxAsset.url}
                  alt="MunchReach Unified Inbox connecting replies with campaign context"
                  className="aspect-[4/3] w-full rounded-md object-cover object-left-top"
                />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <SectionIntro eyebrow="AFTER LAUNCH" title="The Work Does Not Stop at Launch" />
            <Reveal delay={100}>
              <div>
                <p className="text-xl leading-relaxed text-foreground">
                  Launching a product is not the finish line.
                </p>
                <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                  MunchReach continues to evolve through customer feedback, real usage, technical
                  testing, product iteration, and the problems that only become visible when software
                  is used at scale.
                </p>
                <ul className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {afterLaunchWork.map((item) => (
                    <li key={item} className="flex items-center gap-3 border-b border-border pb-4 text-sm font-semibold">
                      <Check className="size-4 shrink-0 text-primary" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-border/60 bg-foreground py-20 text-background sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <StoryLabel>THE PHILOSOPHY</StoryLabel>
              <h2 className="mt-4 max-w-3xl text-4xl font-bold text-balance sm:text-5xl">
                What Years of Outbound Taught MunchReach
              </h2>
            </Reveal>
            <ol className="mt-12 border-t border-background/20">
              {principles.map((principle, index) => (
                <Reveal key={principle.number} delay={index * 50}>
                  <li className="grid gap-3 border-b border-background/20 py-7 sm:grid-cols-[5rem_1fr_1fr] sm:gap-8">
                    <span className="text-sm font-bold text-primary">{principle.number}</span>
                    <h3 className="text-lg leading-snug font-semibold">{principle.title}</h3>
                    <p className="text-sm leading-relaxed text-background/65">{principle.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="hero-glow border-b border-border/60 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionIntro eyebrow="THE VISION" title="Building the Complete Outbound Workspace" />
            <Reveal delay={100}>
              <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
                <p>
                  MunchReach is being built toward a simpler, more connected workspace for businesses
                  that rely on outbound. The goal is not to add features simply to make the platform bigger.
                </p>
                <p>
                  The goal is to connect the workflows businesses already depend on: lead management,
                  campaigns, sequences, AI personalization, sending, replies, CRM, analytics, and automation.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
                  {["Less tool fragmentation", "Better-connected workflows", "Clearer visibility", "More time for conversations"].map((item) => (
                    <div key={item} className="border-t-2 border-primary pt-4 text-sm font-semibold text-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <Reveal>
              <StoryLabel>THE JOURNEY CONTINUES</StoryLabel>
              <h2 className="mt-5 text-4xl font-bold text-balance sm:text-6xl">
                Still Building. Still Learning. Still Listening.
              </h2>
              <div className="mx-auto mt-7 max-w-3xl space-y-5 text-lg leading-relaxed text-muted-foreground">
                <p>
                  MunchReach started with years of hands-on experience in client acquisition and outbound.
                  That experience became a product.
                </p>
                <p>
                  The product is now being shaped by real customers, real campaigns, real feedback, and
                  the same principle that started the journey: solve problems that actually matter.
                </p>
                <p className="font-medium text-foreground">
                  Built by Anas Khalid, Founder of MunchReach, and the team behind the platform.
                </p>
              </div>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/features">
                    Explore MunchReach <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/signup">Start Your Free Trial</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </article>
    </MarketingLayout>
  );
}