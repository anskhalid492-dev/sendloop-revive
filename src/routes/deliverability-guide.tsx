import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Info,
  Mailbox,
  Send,
  ShieldCheck,
  LifeBuoy,
} from "lucide-react";

import {
  MarketingLayout,
  FaqBlock,
  CtaBlock,
  MockBars,
  QuoteBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { CopyButton } from "@/components/site/CopyButton";
import { Button } from "@/components/ui/button";

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
      "Cold Email Deliverability Guide | Sendloop",
      "A complete cold email deliverability guide: domain setup, SPF, DKIM and DMARC, mailbox setup, warmup, sending volume, list quality, bounces, unsubscribes, reply management and monitoring.",
      "/deliverability-guide",
      faqs,
    ),
  component: Guide,
});

const sections = [
  { id: "why-it-breaks", label: "Why deliverability breaks" },
  { id: "pillars", label: "The six pillars" },
  { id: "domain-setup", label: "Domain setup" },
  { id: "spf", label: "SPF" },
  { id: "dkim", label: "DKIM" },
  { id: "dmarc", label: "DMARC" },
  { id: "mailbox-setup", label: "Mailbox setup" },
  { id: "warmup", label: "Warmup" },
  { id: "sending-volume", label: "Sending volume" },
  { id: "list-quality", label: "List quality" },
  { id: "bounce-management", label: "Bounce management" },
  { id: "unsubscribes", label: "Unsubscribe handling" },
  { id: "reply-management", label: "Reply management" },
  { id: "campaign-practices", label: "Campaign practices" },
  { id: "monitoring", label: "Monitoring deliverability" },
  { id: "checklist", label: "Pre-launch checklist" },
];

const problems = [
  { title: "One missing DNS record", text: "A single missing or misconfigured SPF, DKIM or DMARC entry can silently route every send straight to spam, with no error shown anywhere." },
  { title: "Reputation decays fast", text: "A cold or newly-purchased domain has zero sending history — providers throttle and filter aggressively until you prove consistent, low-complaint behavior." },
  { title: "One bad list ruins the domain", text: "A single unverified list with a high bounce rate can tank a domain's reputation for weeks, dragging every future campaign down with it." },
];

const pillars = [
  { title: "Infrastructure", text: "Dedicated sending domains, correct MX and a custom tracking domain that matches your brand." },
  { title: "Authentication", text: "SPF, DKIM and DMARC aligned and published before your first send." },
  { title: "Reputation", text: "Warmup for two to four weeks, then ramp volume gradually per mailbox." },
  { title: "List hygiene", text: "Verified addresses, no catch-alls at scale, and aggressive suppression." },
  { title: "Content signals", text: "Plain text, few links, no spam trigger phrases and a real unsubscribe path." },
  { title: "Volume pacing", text: "Stay under provider limits, spread sends across the day and rotate mailboxes." },
];

const rampTable = [
  { week: "Week 1", volume: "5–10 emails/day", notes: "Warmup network only, internal replies encouraged" },
  { week: "Week 2", volume: "15–25 emails/day", notes: "Warmup continues, first small campaign batches allowed" },
  { week: "Week 3", volume: "30–40 emails/day", notes: "Real campaign traffic, monitor bounce and complaint rate daily" },
  { week: "Week 4+", volume: "40–50 emails/day", notes: "Full campaign volume if bounce stays under 2%, complaints under 0.1%" },
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

function Callout({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "best";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "best" ? CheckCircle2 : Info;
  const ring =
    tone === "warning"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "best"
        ? "border-primary/40 bg-primary/5"
        : "border-border bg-secondary/40";
  const color = tone === "warning" ? "text-destructive" : "text-primary";
  return (
    <div className={`mt-6 rounded-xl border p-5 ${ring}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${color}`}>
        <Icon className="size-4" /> {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-border/60 py-10 last:border-b-0">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DnsRecord({ desc, example }: { desc: string; example: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{desc}</p>
      <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <code className="min-w-0 flex-1 overflow-x-auto text-xs whitespace-pre-wrap">{example}</code>
        <CopyButton value={example} label="Copy" />
      </div>
    </div>
  );
}

function useReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return progress;
}

function Guide() {
  const progress = useReadingProgress();

  return (
    <MarketingLayout>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 h-1 bg-transparent"
      >
        <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            <ShieldCheck className="size-3.5" /> Deliverability
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Cold email <span className="text-gradient">deliverability guide</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Everything that decides whether your cold email is read or filtered — domain setup,
            authentication, warmup, volume, list quality, bounces, replies and monitoring — in the
            exact order to fix it in.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">Run a free audit</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#why-it-breaks">Read the guide</a>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav aria-label="Table of contents" className="surface-card p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              On this page
            </p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block text-muted-foreground transition-colors hover:text-primary"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="max-w-[70ch]">
          <GuideSection id="why-it-breaks" title="Why deliverability breaks">
            <p>
              Deliverability failures are rarely one dramatic mistake. They are three quiet ones,
              compounding.
            </p>
            {problems.map((p) => (
              <div key={p.title} className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <p className="mt-1.5 text-sm">{p.text}</p>
              </div>
            ))}
          </GuideSection>

          <GuideSection id="pillars" title="The six pillars of deliverability">
            <div className="grid gap-3 sm:grid-cols-2">
              {pillars.map((p) => (
                <div key={p.title} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">{p.title}</p>
                  <p className="mt-1 text-sm">{p.text}</p>
                </div>
              ))}
            </div>
          </GuideSection>

          <GuideSection id="domain-setup" title="Domain setup">
            <p>
              Use a lookalike domain for outbound so campaign activity can never affect your primary
              domain. Point the correct MX records at your receiving infrastructure and add a custom
              tracking domain with valid TLS that matches your brand.
            </p>
            <Callout tone="warning" title="Never send cold email from your primary domain">
              A reputation problem on your outbound domain is recoverable. The same problem on the
              domain your invoices and support email leave from is not.
            </Callout>
            <p>
              In Sendloop, a domain has to pass DNS verification before any mailbox on it can go
              active — see{" "}
              <Link to="/product/email-accounts" className="text-primary underline-offset-4 hover:underline">
                Email Accounts
              </Link>
              .
            </p>
          </GuideSection>

          <GuideSection id="spf" title="SPF">
            <p>
              SPF publishes a TXT record listing which mail servers are authorized to send on behalf
              of your domain.
            </p>
            <DnsRecord
              desc="Add one SPF TXT record per domain — multiple SPF records invalidate each other."
              example="v=spf1 include:_spf.sendloop.app ~all"
            />
          </GuideSection>

          <GuideSection id="dkim" title="DKIM">
            <p>
              DKIM adds a cryptographic signature to each message so receiving servers can verify it
              wasn't altered in transit.
            </p>
            <DnsRecord
              desc="Publish the selector record supplied for your sending domain."
              example="selector._domainkey.yourdomain.com → v=DKIM1; k=rsa; p=MIGfMA0..."
            />
          </GuideSection>

          <GuideSection id="dmarc" title="DMARC">
            <p>
              DMARC tells receiving servers what to do when SPF or DKIM fail, and where to send
              aggregate failure reports.
            </p>
            <DnsRecord
              desc="Start at p=none while you monitor reports, then tighten once alignment is clean."
              example="v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
            />
            <Callout tone="info" title="Publish all three before your first send">
              Authentication changes propagate within hours, but reputation is cumulative — fixing
              DNS after a bad launch does not undo the damage.
            </Callout>
          </GuideSection>

          <GuideSection id="mailbox-setup" title="Mailbox setup">
            <p>
              Connect mailboxes only on verified domains. Each mailbox is connection-tested when it
              is added, and the result is recorded so you can see when a connection starts failing.
              Scale sending by adding mailboxes rather than pushing a single mailbox harder.
            </p>
            <Callout tone="best" title="Best practice">
              Rotate sends across several mailboxes and spread them through the working day rather
              than firing a batch at one time.
            </Callout>
          </GuideSection>

          <GuideSection id="warmup" title="Warmup">
            <p>
              Warm up for two to four weeks before campaign traffic, then ramp gradually. This
              conservative four-week schedule keeps reputation intact.
            </p>
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
                      <td className="px-4 py-3 font-medium text-foreground">{r.week}</td>
                      <td className="px-4 py-3 text-primary">{r.volume}</td>
                      <td className="px-4 py-3">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Sendloop's{" "}
              <Link to="/product/warmup" className="text-primary underline-offset-4 hover:underline">
                warmup engine
              </Link>{" "}
              paces this automatically and keeps running alongside campaign traffic.
            </p>
          </GuideSection>

          <GuideSection id="sending-volume" title="Sending volume">
            <p>
              Cap a healthy warmed mailbox at 30–50 emails per day. Stay under provider limits,
              spread sends across the day and rotate mailboxes. Scale by adding mailboxes, never by
              pushing one mailbox harder.
            </p>
          </GuideSection>

          <GuideSection id="list-quality" title="List quality">
            <p>
              Verify every address before import, avoid catch-all domains at scale because those
              recipients cannot be verified, and suppress aggressively. On import, Sendloop reports
              every skipped row with a reason: invalid, duplicate in the file, or already in the
              workspace.
            </p>
            <Callout tone="warning" title="Catch-all lists inflate invalid sends">
              Catch-all recipients accept everything, so verification tools cannot tell a real
              mailbox from a dead one. Sending to them at volume hurts reputation.
            </Callout>
          </GuideSection>

          <GuideSection id="bounce-management" title="Bounce management">
            <p>
              Keep bounce rate under 2%. Hard bounces should be suppressed immediately and never
              retried — a repeated send to a dead address is one of the strongest negative signals a
              provider tracks. Pause and investigate the list rather than the copy when bounces
              spike.
            </p>
          </GuideSection>

          <GuideSection id="unsubscribes" title="Unsubscribe handling">
            <p>
              Every message needs an unsubscribe link or a plain-text opt-out. Opt-outs must be
              honoured across the whole workspace, not just the campaign that triggered them, and
              suppression has to apply before the next batch is queued.
            </p>
            <Callout tone="info" title="Complaints matter more than unsubscribes">
              Keep complaints under 0.1%. Making the opt-out obvious is what keeps that number low.
            </Callout>
          </GuideSection>

          <GuideSection id="reply-management" title="Reply management">
            <p>
              Replies are the strongest positive signal a mailbox can generate, so route them
              somewhere they get answered. Sequences stop automatically on reply, bounce and
              unsubscribe, so a prospect never receives a follow-up after answering. Every reply
              lands in the{" "}
              <Link to="/product/unified-inbox" className="text-primary underline-offset-4 hover:underline">
                Unified Inbox
              </Link>
              , threaded onto the original conversation.
            </p>
          </GuideSection>

          <GuideSection id="campaign-practices" title="Campaign practices">
            <p>
              Keep the first email plain text with at most one link and no attachments. Multiple
              links, tracking pixels and image-heavy HTML all add risk. Use variables with
              fallbacks so a missing field never breaks a sentence, and check the unresolved
              variable report before launching.
            </p>
            <p>
              Three to four touches over 10–14 days is the sweet spot — after that, response rate
              per additional email drops sharply. Ready-made structures live in the{" "}
              <Link to="/cold-email-templates" className="text-primary underline-offset-4 hover:underline">
                cold email template library
              </Link>
              .
            </p>
            <p>
              Setup in the right order: buy a sending domain, publish DNS records, warm up the
              mailbox, then send small, measure and scale — increasing only while bounces stay under
              2%.
            </p>
          </GuideSection>

          <GuideSection id="monitoring" title="Monitoring deliverability">
            <p>
              Watch bounce rate, complaint rate and reply rate daily during a ramp. This is what
              good inbox placement looks like on a properly authenticated, warmed domain sending
              under 50 emails per day per mailbox with a verified list.
            </p>
            <div className="surface-card p-6">
              <MockBars bars={placement} />
            </div>
            <p>
              The{" "}
              <Link to="/product/analytics" className="text-primary underline-offset-4 hover:underline">
                analytics funnel
              </Link>{" "}
              separates a delivery problem from a copy problem: delivery falling off points at
              infrastructure, healthy delivery with no replies points at the message.
            </p>
          </GuideSection>

          <GuideSection id="checklist" title="Pre-launch checklist">
            <ul className="grid gap-2.5">
              {checklist.map((c) => (
                <li key={c} className="flex gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </GuideSection>

          <div className="py-10">
            <h2 className="text-lg font-semibold">Related resources</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { to: "/product/email-accounts" as const, label: "Email Accounts", icon: Mailbox },
                { to: "/product/warmup" as const, label: "Warmup", icon: Flame },
                { to: "/product/campaigns" as const, label: "Campaigns", icon: Send },
                { to: "/help-center" as const, label: "Help Center", icon: LifeBuoy },
              ].map((r) => (
                <Link
                  key={r.to}
                  to={r.to}
                  className="surface-card group flex items-center gap-3 p-4 transition-colors hover:border-primary/50"
                >
                  <r.icon className="size-5 text-primary" />
                  <span className="text-sm font-medium transition-colors group-hover:text-primary">
                    {r.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="border-y border-border/60 bg-secondary/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <QuoteBlock
            quote="We went from 40% spam placement to consistent inbox delivery just by fixing DMARC alignment and slowing our ramp down."
            name="Marcus Webb"
            role="Founder, B2B lead gen agency"
          />
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FaqBlock faqs={faqs} title="Common questions" />
        </div>
      </section>

      <TestimonialCarousel page="deliverability-guide" />

      <CtaBlock
        title="Check your setup in minutes"
        description="Connect a mailbox and Sendloop validates authentication, warmup status and sending limits automatically."
      />
    </MarketingLayout>
  );
}
