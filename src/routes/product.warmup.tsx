import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Mail,
  MailCheck,
  PauseCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

import {
  BeforeAfter,
  CtaBlock,
  FaqBlock,
  FeatureGrid,
  MarketingLayout,
  Section,
  UseCaseGrid,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import {
  HealthTimeline,
  HeroWarmupMock,
  MailboxManagementMock,
  MiniControl,
  ProductCallouts,
  SeparateTracksMock,
  WarmupActivityMock,
  WarmupDashboardMock,
  WarmupSettingsMock,
} from "@/components/site/WarmupProductMocks";
import { Button } from "@/components/ui/button";

const faqs = [
  { q: "What is email warmup?", a: "Email warmup is the gradual building of sending activity on a mailbox while its delivery, reply, bounce, complaint, authentication, and provider signals are monitored." },
  { q: "Why should I warm up a new mailbox?", a: "A new mailbox has little sending history. Controlled activity gives it time to establish a consistent pattern before campaign volume increases." },
  { q: "How does MunchReach warmup work?", a: "Connect a mailbox, choose its settings, and enable warmup. MunchReach schedules bounded activity, monitors real health signals, and moves the mailbox through Ramp Up, Stable, Hold, Recovery, or Pause." },
  { q: "Does warmup count toward my campaign sending numbers?", a: "No. Warmup activity is kept out of campaign analytics, campaign conversations, CRM activity, and your normal Unified Inbox. It still respects the mailbox's real sending capacity." },
  { q: "Can I control the warmup volume?", a: "Yes. Supported settings include starting volume, maximum daily volume, ramp behavior, sending days and window, plus health and bounce protections." },
  { q: "What are Conservative, Balanced and Aggressive warmup presets?", a: "They are starting configurations for a slower, standard, or faster ramp. Aggressive does not override mailbox health, provider limits, campaign priority, or safety controls." },
  { q: "How do I know if my mailbox needs attention?", a: "The Warmup page shows mailbox health, current ramp state, recent activity, failures, and a plain-language reason when volume is held, reduced, or paused." },
  { q: "Can MunchReach automatically pause a mailbox?", a: "Yes. When configured protection rules are triggered by serious bounce, complaint, authentication, or health signals, MunchReach can pause warmup and show the reason." },
  { q: "Can I warm up multiple mailboxes?", a: "Yes. Each connected mailbox has its own settings, health, volume, ramp state, history, and pause or resume controls." },
  { q: "Should I keep warmup running after starting campaigns?", a: "You can run both, but warmup uses only the capacity left after human replies and campaign sending. Its volume continues to respond to mailbox health and available capacity." },
];

export const Route = createFileRoute("/product/warmup")({
  head: () => metaFor(
    "MunchReach Warmup — Warm Up Your Email Mailboxes Before Scaling",
    "Warm up your email mailboxes gradually with MunchReach. Monitor mailbox health, control warmup volume, track activity and protect your sending reputation.",
    "/product/warmup",
    faqs,
  ),
  component: WarmupProductPage,
});

const whyCards = [
  { icon: TrendingUp, title: "Gradual Ramp", text: "Start with controlled activity and increase volume over time as mailbox health supports it." },
  { icon: ShieldCheck, title: "Reputation Protection", text: "Avoid putting unnecessary pressure on a new sending mailbox." },
  { icon: Activity, title: "Consistent Sending", text: "Build a more natural sending pattern before increasing campaign activity." },
];

const steps = [
  { icon: MailCheck, title: "Connect Mailbox", text: "Connect and verify your sending mailbox." },
  { icon: Play, title: "Start Warmup", text: "Warmup begins according to the mailbox configuration." },
  { icon: TrendingUp, title: "Gradually Increase", text: "Activity adjusts according to the selected ramp, target volume, and real health signals." },
  { icon: Activity, title: "Monitor Health", text: "MunchReach tracks mailbox activity and health signals as warmup runs." },
];

const audiences = [
  { icon: Building2, audience: "Agencies", scenario: "Multiple client workspaces and sending accounts.", outcome: "Manage mailbox warmup from one place." },
  { icon: Users, audience: "Sales Teams", scenario: "Campaigns scaling across several sending accounts.", outcome: "Keep health and activity visible as volume grows." },
  { icon: UserRound, audience: "Founders", scenario: "New sending accounts preparing for outreach.", outcome: "Build activity before increasing campaign volume." },
  { icon: BriefcaseBusiness, audience: "Recruiters & B2B Teams", scenario: "Controlled outreach across multiple mailboxes.", outcome: "Monitor every account without checking each inbox." },
];

const features = [
  { icon: Sparkles, title: "Automated Warmup", text: "Warmup activity runs automatically according to mailbox settings and available capacity." },
  { icon: ShieldCheck, title: "Mailbox Health", text: "Monitor the health and current reason for every sending account." },
  { icon: TrendingUp, title: "Gradual Ramp", text: "Increase activity instead of immediately pushing high volume." },
  { icon: BarChart3, title: "Warmup Tracking", text: "See warmup status, planned volume, actual volume, and history." },
  { icon: ShieldAlert, title: "Safety Controls", text: "Pause or restrict activity when configured protection rules are triggered." },
  { icon: Mail, title: "Account-Level Monitoring", text: "Manage multiple sending accounts from one workspace." },
];

function WarmupProductPage() {
  return <MarketingLayout>
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div className="hero-glow absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">MunchReach Warmup</span>
          <h1 className="mt-6 text-4xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">Warm Up Your Mailboxes <span className="text-gradient">Before You Scale</span></h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Build sending activity gradually, monitor mailbox health, and give new sending accounts time to establish a healthy sending pattern before increasing campaign volume.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild><Link to="/auth">Start Warmup</Link></Button>
            <Button size="lg" variant="outline" asChild><a href="#how-it-works">See How It Works</a></Button>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm font-medium text-foreground/75"><CheckCircle2 className="size-4 text-primary" />Warmup runs separately from your campaign sending.</p>
        </div>
        <HeroWarmupMock />
      </div>
    </section>

    <Section muted title="New Mailboxes Shouldn't Go From Zero to Full Volume." description="A new mailbox needs gradual sending activity instead of immediately taking on a large campaign volume."><FeatureGrid items={whyCards} /></Section>

    <Section id="how-it-works" title="Every Sending Account Gets Its Own Warmup Track">
      <ol className="relative grid gap-4 lg:grid-cols-4 lg:gap-5">
        <div className="absolute top-8 right-[12%] left-[12%] hidden h-px bg-border lg:block" aria-hidden="true" />
        {steps.map((step, index) => <li key={step.title} className="relative rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="relative z-10 grid size-10 place-items-center rounded-lg border border-primary/20 bg-background text-primary"><step.icon className="size-5" /></span><span className="text-sm font-bold text-primary">{String(index + 1).padStart(2, "0")}</span></div>
          <h3 className="mt-5 text-base font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
        </li>)}
      </ol>
    </Section>

    <Section muted title="See Every Sending Account's Health in One Place" description="Mailbox status, current volume, ramp state, recent activity, and issues stay visible on one screen.">
      <div className="space-y-7"><WarmupDashboardMock /><ProductCallouts /></div>
    </Section>

    <Section title="Control How Each Mailbox Warms Up" description="Choose a starting point, then keep the real limits and protections in control."><WarmupSettingsMock /></Section>

    <Section muted title="Warmup Doesn't Steal Your Campaign Numbers" description="MunchReach keeps warmup activity separate from campaign metrics so you can understand what your mailbox is doing without confusing warmup activity with real campaign performance."><SeparateTracksMock /></Section>

    <Section title="Know When a Mailbox Needs Attention" description="Health reflects real available signals such as recent sends, delivery failures, bounces, complaints, replies, throttling, and authentication.">
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[
          ["Active", "bg-success/10 text-success"], ["Warming", "bg-primary/10 text-primary"], ["Paused", "bg-muted text-muted-foreground"], ["Inactive", "bg-secondary text-secondary-foreground"], ["Error", "bg-destructive/10 text-destructive"],
        ].map(([label, tone]) => <div key={label} className="rounded-lg border border-border bg-card p-4 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span></div>)}</div>
        <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-lg border border-border bg-secondary/35 px-4 py-3 text-xs">
          <span className="font-medium text-muted-foreground">Health bands</span>
          <span className="rounded-full bg-success/10 px-2.5 py-1 font-semibold text-success">Good</span>
          <span className="rounded-full bg-warning/10 px-2.5 py-1 font-semibold text-warning">Fair</span>
          <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive">Poor</span>
        </div>
        <HealthTimeline />
        <p className="mx-auto max-w-3xl text-center text-sm text-muted-foreground">Authentication is shown when it can be verified; otherwise MunchReach shows that manual verification is required. Mailbox health helps explain current signals—it does not guarantee inbox placement.</p>
      </div>
    </Section>

    <Section muted title="Built-In Protection When Something Looks Wrong">
      <div className="grid gap-4 sm:grid-cols-2">{[
        { icon: ShieldAlert, title: "Bounce Protection", text: "Detect unusual bounce behavior, suppress hard-bounced addresses, and prevent continued sending when protection rules are triggered." },
        { icon: AlertTriangle, title: "Complaint Protection", text: "Monitor complaint signals, suppress complained addresses immediately, and protect the mailbox from a risky condition." },
        { icon: PauseCircle, title: "Automatic Pause", text: "A mailbox can be paused when configured safety thresholds are reached." },
        { icon: RotateCcw, title: "Clear Recovery", text: "See why activity was reduced or paused and what needs attention before the mailbox resumes." },
      ].map((item) => <MiniControl key={item.title} {...item} />)}</div>
    </Section>

    <Section title="See What Your Mailboxes Are Doing" description="Monitor warmup volume, health, recent events, and ramp decisions without digging through multiple screens."><WarmupActivityMock /></Section>

    <Section muted title="Manage Every Sending Account From One Workspace" description="Monitor multiple sending accounts without opening each mailbox individually."><MailboxManagementMock /></Section>

    <Section title="Build Mailbox Health Before You Build Sending Volume">
      <BeforeAfter beforeTitle="Before" afterTitle="After" before={["New mailbox", "No sending history", "Low sending activity", "Needs gradual ramp"]} after={["Consistent sending activity", "Monitored health", "Controlled volume", "Ready to scale responsibly"]} />
    </Section>

    <Section muted title="Built for Teams That Depend on Email Outreach"><UseCaseGrid items={audiences} /></Section>

    <Section title="Everything You Need to Monitor Sending Health"><FeatureGrid items={features} /></Section>

    <TestimonialCarousel page="warmup" title="Loved By Outreach Teams" />

    <Section muted><FaqBlock faqs={faqs} title="Frequently Asked Questions" description="Clear answers about mailbox warmup, health, capacity, and campaigns." /></Section>

    <CtaBlock title="Build Mailbox Health Before You Build Sending Volume" description="Start warming your sending accounts and monitor their health from one workspace." cta="Start Sending Free" secondaryCta="Explore MunchReach" secondaryHref="/why-munchreach" />
  </MarketingLayout>;
}