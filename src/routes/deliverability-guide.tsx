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
  metaFor,
} from "@/components/site/MarketingPage";
import { CopyButton } from "@/components/site/CopyButton";
import { Button } from "@/components/ui/button";
import { DEFAULT_WARMUP_STAGES } from "@/lib/warmup-progression";

const faqs = [
  { q: "Why do my emails go to spam?", a: "Authentication, sender history, list quality, recipient expectations and message content can all affect filtering. Review provider feedback and investigate these factors together." },
  { q: "How many emails per mailbox per day?", a: "Choose conservative mailbox limits within your provider's policies. Consider account history and recipient engagement, increase gradually, and investigate failures before raising volume." },
  { q: "Do links hurt deliverability?", a: "Multiple links, tracking pixels and image-heavy HTML all add risk. Keep the first email plain text with at most one link." },
  { q: "Should I use a catch-all domain?", a: "No. Catch-all recipients cannot be verified, so they inflate invalid sends and hurt reputation." },
  { q: "What is the difference between SPF, DKIM and DMARC?", a: "SPF authorizes which servers can send for your domain, DKIM cryptographically signs the message, and DMARC tells receiving servers what to do when SPF or DKIM fail — and where to send reports." },
  { q: "How long does it take to see the effect of a fix?", a: "Recovery varies by provider, sender history and the issue involved. DNS changes depend on caching and provider processing; no recovery time or inbox placement is guaranteed." },
];

export const Route = createFileRoute("/deliverability-guide")({
  head: () =>
    metaFor(
      "Cold Email Deliverability Guide | MunchReach",
      "Domain setup, SPF, DKIM and DMARC, warmup, sending volume, list quality, bounces and monitoring in one practical playbook.",
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
  { title: "Check authentication", text: "Missing or misconfigured authentication can contribute to rejection or filtering. Check the records supplied by your mailbox provider and inspect available results." },
  { title: "Review sender history", text: "New accounts may have limited sending history. Provider restrictions and filtering vary, so begin conservatively and monitor feedback." },
  { title: "Investigate list quality", text: "Invalid recipients and unwanted messages can create bounces and complaints. Review your list and stop problematic activity before scaling." },
];

const pillars = [
  { title: "Infrastructure", text: "Dedicated sending domains, correct MX and a custom tracking domain that matches your brand." },
  { title: "Authentication", text: "SPF, DKIM and DMARC aligned and published before your first send." },
  { title: "Reputation", text: "Build activity gradually and review available health signals before increasing volume." },
  { title: "List hygiene", text: "Verified addresses, no catch-alls at scale, and aggressive suppression." },
  { title: "Content signals", text: "Plain text, few links, no spam trigger phrases and a real unsubscribe path." },
  { title: "Volume pacing", text: "Stay under provider limits, spread sends across the day and rotate mailboxes." },
];

const rampTable = DEFAULT_WARMUP_STAGES.map(stage => ({
  week: `Days ${stage.start_day}–${stage.end_day}`,
  volume: `${stage.min_emails}–${stage.max_emails} warmup emails/day`,
  notes: "Default UTC progression; safety and capacity may reduce activity",
}));

const checklist = [
  "SPF record exists and passes alignment",
  "DKIM signature verifies for the sending domain",
  "DMARC published and monitored",
  "Custom tracking domain with valid TLS",
  "Review available bounce and complaint signals against your provider policies",
  "Every list verified before import",
  "Unsubscribe link or plain-text opt-out in every message",
  "Review each mailbox's warmup settings, safeguards and recent activity",
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
            Key factors that can influence whether cold email is delivered or filtered — domain setup,
            authentication, warmup, volume, list quality, bounces, replies and monitoring — in the
            a practical review checklist.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">Connect your mailbox</Link>
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
              Use an authorized sending domain that clearly identifies your business. Separating outreach
              can help manage operational risk, but does not guarantee reputation isolation. Point the correct MX records at your receiving infrastructure and add a custom
              tracking domain with valid TLS that matches your brand.
            </p>
            <Callout tone="warning" title="Consider reputation risk">
              Consider how outreach could affect important business email. Follow provider policies;
              no domain setup guarantees protection or recovery.
            </Callout>
            <p>
              Connect your own mailbox and use the authentication records supplied by its provider.
              MunchReach shows available connection and authentication checks; unavailable checks
              require manual verification — see{" "}
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
              desc="Use the SPF record supplied by your email provider, not a MunchReach sending include. This is a placeholder example only; do not publish it unchanged."
              example="v=spf1 include:YOUR_PROVIDER_SPF_DOMAIN ~all"
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
              Propagation depends on DNS caching and provider processing. Authentication helps receiving
              servers verify identity; it does not guarantee delivery or inbox placement.
            </Callout>
          </GuideSection>

          <GuideSection id="mailbox-setup" title="Mailbox setup">
            <p>
              Connect mailboxes you own or are authorized to use. Each mailbox is connection-tested when it
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
              MunchReach's default automatic schedule below describes configured warmup activity, not
              performance or a required waiting period. Each mailbox progresses independently by
              UTC day; health safeguards and pauses can hold or reduce activity. Legacy or customized
              settings may differ.
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
              MunchReach's{" "}
              <Link to="/product/warmup" className="text-primary underline-offset-4 hover:underline">
                warmup engine
              </Link>{" "}
              uses per-mailbox progression checkpoints and capacity checks. Warmup can run alongside
              campaigns, but does not guarantee reputation or campaign inbox placement.
            </p>
          </GuideSection>

          <GuideSection id="sending-volume" title="Sending volume">
            <p>
              Choose mailbox limits within your provider's policies and account restrictions. MunchReach
              orchestrates campaigns and follow-ups through your connected provider or SMTP server;
              that provider performs delivery. Spread activity through your sending window and
              review feedback before increasing volume.
            </p>
          </GuideSection>

          <GuideSection id="list-quality" title="List quality">
            <p>
              Verify every address before import, avoid catch-all domains at scale because those
              recipients cannot be verified, and suppress aggressively. On import, MunchReach reports
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
              Review bounces against your provider's requirements. Hard bounces should be suppressed and not
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
              Follow your provider's complaint policies, make opting out clear, and investigate available complaint feedback. Feedback coverage varies by provider.
            </Callout>
          </GuideSection>

          <GuideSection id="reply-management" title="Reply management">
            <p>
              Replies help you understand engagement, so route them somewhere they get answered.
              Reply counts alone do not prove inbox placement. Sequences stop automatically on reply, bounce and
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
              Choose follow-up timing and frequency based on relevance, recipient feedback and your
              provider's policies rather than a universal response-rate formula. Ready-made structures live in the{" "}
              <Link to="/cold-email-templates" className="text-primary underline-offset-4 hover:underline">
                cold email template library
              </Link>
              .
            </p>
            <p>
              Review your provider's setup and authentication, connect your mailbox, configure conservative
              limits, and send small batches before scaling based on observed feedback.
            </p>
          </GuideSection>

          <GuideSection id="monitoring" title="Monitoring deliverability">
            <p>
              Review bounces, complaints where available, failures and replies during a ramp. MunchReach
              does not publish verified aggregate placement results; these signals cannot establish
              a platform-wide inbox rate.
            </p>
            <div className="surface-card p-6">
              <h3 className="font-semibold text-foreground">Acceptance is not inbox placement</h3>
              <p className="mt-3 text-sm">Provider acceptance records a send handoff. Confirmed arrival is a separate signal, and inbox/spam placement requires receiving-side evidence. Missing evidence stays unavailable. Warmup observations do not predict campaign placement.</p>
            </div>
            <p>
              The{" "}
              <Link to="/product/analytics" className="text-primary underline-offset-4 hover:underline">
                analytics funnel
              </Link>{" "}
              helps investigate recorded sending and engagement outcomes. Confirmed delivery, where
              available, is distinct from accepted-minus-bounced estimates; neither proves inbox
              placement or identifies a single cause of low replies.
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
          <h2 className="text-2xl font-bold">Measure your own sending context</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">When reviewing results, record the period, mailbox sample, receiving providers and observable message count. A small or incomplete placement sample is not a customer success benchmark or a performance guarantee.</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FaqBlock faqs={faqs} title="Common questions" />
        </div>
      </section>

      <CtaBlock
        title="Check your setup in minutes"
        description="Connect your own mailbox, review available health signals and configure outreach automation within your provider limits."
      />
    </MarketingLayout>
  );
}
