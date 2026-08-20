import { createFileRoute } from "@tanstack/react-router";
import {
  Repeat,
  Clock,
  MessageSquare,
  GitBranch,
  BellOff,
  Activity,
  CalendarX2,
  MailX,
  Timer,
} from "lucide-react";

import {
  BulletList,
  CtaBlock,
  FaqBlock,
  FeatureGrid,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  SolutionSplit,
  StatStrip,
  metaFor,
  BigPreview,
  WorkflowStrip,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  { q: "How many follow-ups should I send?", a: "Two to four typically captures most of the available replies without annoying prospects." },
  { q: "Do follow-ups reuse the same subject?", a: "By default yes, as a reply in-thread. You can override the subject per step." },
  { q: "What happens on an out-of-office reply?", a: "The sequence pauses and resumes after the return date detected in the message." },
  { q: "Can I stop a single prospect?", a: "Yes, stop or pause any prospect from the leads table or the inbox thread." },
  { q: "Do follow-up delays account for weekends?", a: "Yes. Delays are counted in business days by default so a Friday send doesn't trigger a Saturday follow-up." },
  { q: "Can different prospects get different timing?", a: "Yes. Timing can vary by branch — openers, clickers and silent prospects can each follow a different cadence." },
];

export const Route = createFileRoute("/product/follow-ups")({
  head: () =>
    metaFor(
      "Automated Cold Email Follow-Ups — MunchReach",
      "Perfectly timed, in-thread follow-ups that adapt to opens, clicks and out-of-office replies, then stop instantly.",
      "/product/follow-ups",
      faqs,
    ),
  component: Page,
});

const painPoints = [
  { icon: CalendarX2, title: "Follow-ups fall through the cracks", text: "Manually tracking who needs a nudge and when means most prospects never hear from you again after email one." },
  { icon: Timer, title: "Bad timing kills replies", text: "Sending a follow-up too soon feels pushy; sending it too late means the prospect has already moved on." },
  { icon: MailX, title: "One-size-fits-all nudges", text: "The same generic \"just checking in\" goes to a prospect who opened five times and one who never opened at all." },
];

const solutionRows = [
  {
    eyebrow: "Timed cadence",
    title: "A cadence that runs itself, down to the hour",
    text: "Set the number of touches and the gap between them once. MunchReach counts business days, respects sending windows, and fires each step exactly on schedule.",
    bullets: [
      "Delays in minutes, hours or business days",
      "Automatic weekend and holiday skipping",
      "Per-branch cadence for openers vs. silent leads",
    ],
    visual: (
      <MockPanel title="Follow-up cadence — Marcus Lee">
        <MockRows
          rows={[
            { left: "Step 1 · Intro", right: "Mon, Day 0", badge: "Sent" },
            { left: "Step 2 · Follow-up", right: "Thu, Day 3", badge: "Sent" },
            { left: "Step 3 · Follow-up (opened 2x)", right: "Tue, Day 8", badge: "Due in 6h" },
            { left: "Step 4 · Breakup", right: "Mon, Day 14", badge: "Scheduled" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Same-thread delivery",
    title: "Follow-ups that read like a real conversation",
    text: "Every follow-up lands in the original thread with the same subject, so the prospect sees the full context instead of a disjointed new email out of nowhere.",
    visual: (
      <MockPanel title="Thread — Re: Quick question about Fieldstack">
        <MockRows
          rows={[
            { left: "You — Mon 9:02am", muted: "Quick question about your onboarding flow..." },
            { left: "You — Thu 9:14am", muted: "Following up on this — happy to send a 2-min demo" },
            { left: "You — Tue 8:57am", muted: "Saw you checked out the case study — thoughts?" },
          ]}
        />
      </MockPanel>
    ),
  },
  {
    eyebrow: "Adaptive stop rules",
    title: "Stops the instant a human responds",
    text: "Reply, click-through-to-meeting, bounce or unsubscribe halt the sequence immediately. Detected out-of-office replies reschedule the next touch for the prospect's return date automatically.",
    visual: (
      <MockPanel title="Stop conditions triggered today">
        <MockRows
          rows={[
            { left: "Reply detected — sequence stopped", right: "18 prospects", badge: "Stopped" },
            { left: "Out-of-office — rescheduled", right: "7 prospects", badge: "Paused" },
            { left: "Bounced — suppressed workspace-wide", right: "2 prospects", badge: "Suppressed" },
          ]}
        />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Repeat, title: "Same-thread replies", text: "Follow-ups continue the original thread so prospects see the full context." },
  { icon: Clock, title: "Smart delays", text: "Business-day delays that skip weekends, holidays and out-of-office windows." },
  { icon: MessageSquare, title: "Condition-based paths", text: "Send a different follow-up to openers, clickers and completely cold prospects." },
  { icon: GitBranch, title: "Reply detection", text: "Human and automated replies are detected and treated differently." },
  { icon: BellOff, title: "Out-of-office rescheduling", text: "Detected OOO replies push the next step until the prospect is back." },
  { icon: Activity, title: "Volume pacing", text: "Follow-up load is balanced against new sends so mailboxes stay within limits." },
];

const steps = [
  { title: "Set the cadence", text: "Choose how many touches and how far apart they should land." },
  { title: "Write shorter each time", text: "Templates and AI help you keep follow-ups brief and specific." },
  { title: "Define stop rules", text: "Reply, click, meeting booked or manual stop — you decide." },
  { title: "Review performance", text: "See which touch produces the most replies and trim the rest." },
];

const bullets = [
  "Up to unlimited follow-up steps",
  "Automatic unsubscribe footer handling",
  "Per-step tracking of opens, clicks and replies",
  "Bounce suppression across the workspace",
  "Manual pause for individual prospects",
  "Follow-up preview per prospect before launch",
];

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Follow-Ups"
        title="Automated follow-ups that"
        highlight="stop at the right moment"
        description="Most replies come from the second and third touch. MunchReach sends them for you — on your schedule, in the same thread, and only while the prospect is still silent."
        secondaryCta="See Follow-Ups"
        secondaryHref="#product"
      />
      <BigPreview
        eyebrow="Follow-up workflow"
        title="Watch a follow-up sequence run"
        description="Delays, business hours and stop-on-reply, visualised end to end."
      >
        <div className="p-4 sm:p-6">{solutionRows[0]?.visual}</div>
      </BigPreview>
      <Section title="How MunchReach solves it" description="Cadence, threading and stop rules, fully automated.">
        <SolutionSplit rows={solutionRows} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureGrid items={features} />
        <div className="mt-12">
          <WorkflowStrip steps={steps} />
        </div>
      </Section>
      <TestimonialCarousel page="follow-ups" title="What automated follow-ups changed" />
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section>
        <StatStrip
          stats={[
            { value: "63%", label: "Of replies come after the first email" },
            { value: "4", label: "Average follow-up steps per sequence" },
            { value: "100%", label: "Sequences stop the instant a reply lands" },
            { value: "2.1x", label: "More meetings booked with follow-ups on" },
          ]}
        />
      </Section>
      <Section muted>
        <FaqBlock faqs={faqs} />
      </Section>
      <CtaBlock
        title="Never forget a follow-up again"
        description="Set the cadence once and let MunchReach handle the timing, threading and stop rules."
      />
    </MarketingLayout>
  );
}
