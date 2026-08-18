import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Server, Flame, PenLine, Gauge, ListChecks, AlertOctagon, TrendingDown, Ban } from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  FeatureGrid,
  StepList,
  BulletList,
  FaqBlock,
  CtaBlock,
  PainPoints,
  MockBars,
  QuoteBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  { q: "Why do my emails go to spam?", a: "Usually a mix of missing authentication, a cold domain, unverified lists or overly promotional copy. Fix authentication and warmup first — they account for most cases." },
  { q: "How many emails per mailbox per day?", a: "Cap at 30–50 for a healthy warmed mailbox. Scale by adding mailboxes, never by pushing one mailbox harder." },
  { q: "Do links hurt deliverability?", a: "Multiple links, tracking pixels and image-heavy HTML all add risk. Keep the first email plain text with at most one link." },
  { q: "Should I use a catch-all domain?", a: "No. Catch-all recipients cannot be verified, so they inflate invalid sends and hurt reputation." },
  { q: "What is the difference between SPF, DKIM and DMARC?", a: "SPF authorizes which servers can send for your domain, DKIM cryptographically signs the message, and DMARC tells receiving servers what to do when SPF or DKIM fail — and where to send reports." },
  { q: "How long does it take to see the effect of a fix?", a: "Authentication changes propagate within hours, but sender reputation is cumulative — expect 1–3 weeks of clean sending before inbox placement fully recovers." },
];

export const Route = createFileRoute("/deliverability-guide")({
  head: () =>
    metaFor(
      "Cold Email Deliverability Guide — Land in the Inbox",
      "A complete deliverability guide: domain setup, SPF/DKIM/DMARC, warmup, list hygiene, copy signals and volume pacing.",
      "/deliverability-guide",
      faqs,
    ),
  component: Guide,
});

const toc = [
  "Why deliverability breaks",
  "The six pillars",
  "SPF, DKIM and DMARC in depth",
  "The warmup ramp",
  "Setup in the right order",
  "Pre-launch checklist",
];

const problems = [
  { icon: AlertOctagon, title: "One missing DNS record", text: "A single missing or misconfigured SPF, DKIM or DMARC entry can silently route every send straight to spam, with no error shown anywhere." },
  { icon: TrendingDown, title: "Reputation decays fast", text: "A cold or newly-purchased domain has zero sending history — providers throttle and filter aggressively until you prove consistent, low-complaint behavior." },
  { icon: Ban, title: "One bad list ruins the domain", text: "A single unverified list with a high bounce rate can tank a domain's reputation for weeks, dragging every future campaign down with it." },
];

const pillars = [
  { icon: Server, title: "Infrastructure", text: "Dedicated sending domains, correct MX and a custom tracking domain that matches your brand." },
  { icon: ShieldCheck, title: "Authentication", text: "SPF, DKIM and DMARC aligned and published before your first send." },
  { icon: Flame, title: "Reputation", text: "Warmup for two to four weeks, then ramp volume gradually per mailbox." },
  { icon: ListChecks, title: "List hygiene", text: "Verified addresses, no catch-alls at scale, and aggressive suppression." },
  { icon: PenLine, title: "Content signals", text: "Plain text, few links, no spam trigger phrases and a real unsubscribe path." },
  { icon: Gauge, title: "Volume pacing", text: "Stay under provider limits, spread sends across the day and rotate mailboxes." },
];

const authRecords = [
  {
    name: "SPF",
    desc: "Publishes a TXT record listing which mail servers are authorized to send on behalf of your domain.",
    example: "v=spf1 include:_spf.sendloop.app ~all",
  },
  {
    name: "DKIM",
    desc: "Adds a cryptographic signature to each message so receiving servers can verify it wasn't altered in transit.",
    example: "selector._domainkey.yourdomain.com → v=DKIM1; k=rsa; p=MIGfMA0...",
  },
  {
    name: "DMARC",
    desc: "Tells receiving servers what to do when SPF or DKIM fail, and where to send aggregate failure reports.",
    example: "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com",
  },
];

const rampTable = [
  { week: "Week 1", volume: "5–10 emails/day", notes: "Warmup network only, internal replies encouraged" },
  { week: "Week 2", volume: "15–25 emails/day", notes: "Warmup continues, first small campaign batches allowed" },
  { week: "Week 3", volume: "30–40 emails/day", notes: "Real campaign traffic, monitor bounce and complaint rate daily" },
  { week: "Week 4+", volume: "40–50 emails/day", notes: "Full campaign volume if bounce stays under 2%, complaints under 0.1%" },
];

const steps = [
  { title: "Buy a sending domain", text: "Use a lookalike domain so campaign activity can never affect your primary domain." },
  { title: "Publish DNS records", text: "SPF include for your provider, DKIM key, and DMARC at p=none while you monitor." },
  { title: "Warm up the mailbox", text: "Enable warmup and let reputation build before any campaign traffic." },
  { title: "Send small, measure, scale", text: "Start at 20–30 emails per mailbox per day and increase only while bounces stay under 2%." },
];

const checklist = [
  "SPF record exists and passes alignment",
  "DKIM signature verifies for the sending domain",
  "DMARC published and monitored",
  "Custom tracking domain with valid TLS",
  "Bounce rate under 2% and complaints under 0.1%",
  "Every list verified before import",
  "Unsubscribe link or plain-text opt-out in every message",
  "Warmup running continuously on every mailbox",
];

const placement = [
  { label: "Inbox", value: 78, caption: "78% of test sends" },
  { label: "Promotions / Other tab", value: 14, caption: "14%" },
  { label: "Spam", value: 6, caption: "6%" },
  { label: "Blocked / not delivered", value: 2, caption: "2%" },
];

function Guide() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Deliverability"
        title="The complete guide to"
        highlight="landing in the inbox"
        description="Everything that decides whether your cold email is read or filtered — and the exact order to fix it in."
        primaryCta="Run a Free Audit"
        secondaryCta="Read the Guide"
        secondaryHref="#product"
      />


      <Section title="In this guide">
        <ol className="grid gap-2 sm:grid-cols-2">
          {toc.map((t, i) => (
            <li key={t} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="The six pillars of deliverability" muted>
        <FeatureGrid items={pillars} />
      </Section>

      <Section title="SPF, DKIM and DMARC in depth" description="Publish all three before sending a single campaign email.">
        <div className="grid gap-4 md:grid-cols-3">
          {authRecords.map((r) => (
            <div key={r.name} className="surface-card p-6">
              <h3 className="text-lg font-semibold text-primary">{r.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{r.desc}</p>
              <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                <code>{r.example}</code>
              </pre>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The warmup ramp" description="A conservative, four-week schedule that keeps reputation intact." muted>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Volume</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rampTable.map((r) => (
                <tr key={r.week} className="border-t border-border bg-card">
                  <td className="px-4 py-3 font-medium">{r.week}</td>
                  <td className="px-4 py-3 text-primary">{r.volume}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What good inbox placement looks like">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-muted-foreground">
              This is a real distribution from a properly authenticated, warmed domain sending under 50 emails per day per mailbox with a verified list.
            </p>
          </div>
          <div className="surface-card p-6">
            <MockBars bars={placement} />
          </div>
        </div>
      </Section>

      <Section title="Setup in the right order" muted>
        <StepList steps={steps} />
      </Section>

      <Section title="Pre-launch checklist">
        <BulletList items={checklist} />
      </Section>

      <Section muted>
        <QuoteBlock
          quote="We went from 40% spam placement to consistent inbox delivery just by fixing DMARC alignment and slowing our ramp down."
          name="Marcus Webb"
          role="Founder, B2B lead gen agency"
        />
      </Section>

      <Section muted>
        <FaqBlock faqs={faqs} title="Common questions" />
      </Section>

      <TestimonialCarousel page="deliverability-guide" />

      <CtaBlock
        title="Check your setup in minutes"
        description="Connect a mailbox and Sendloop validates authentication, warmup status and sending limits automatically."
      />
    </MarketingLayout>
  );
}
