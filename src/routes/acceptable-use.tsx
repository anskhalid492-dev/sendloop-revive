import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, CtaBlock, metaFor } from "@/components/site/MarketingPage";

export const Route = createFileRoute("/acceptable-use")({
  head: () =>
    metaFor(
      "Acceptable Use Policy — Sending Rules on Sendloop",
      "What you may and may not send with Sendloop: consent requirements, CAN-SPAM/GDPR rules, prohibited content, limits and enforcement.",
      "/acceptable-use",
    ),
  component: Aup,
});

const toc = [
  ["purpose", "1. Purpose"],
  ["permitted", "2. Permitted use"],
  ["consent", "3. Consent and lawful basis"],
  ["canspam", "4. CAN-SPAM requirements"],
  ["gdprcasl", "5. GDPR and CASL requirements"],
  ["prohibited-content", "6. Prohibited content"],
  ["prohibited-practices", "7. Prohibited sending practices"],
  ["lists", "8. List quality and sourcing"],
  ["limits", "9. Volume limits and warmup"],
  ["monitoring", "10. Monitoring and thresholds"],
  ["enforcement", "11. Enforcement"],
  ["appeals", "12. Appeals"],
  ["reporting", "13. Reporting abuse"],
  ["changes", "14. Changes to this policy"],
] as const;

const sections = [
  {
    id: "purpose",
    heading: "1. Purpose",
    body: [
      "This Acceptable Use Policy (\"AUP\") sets out the rules for sending email through Sendloop. It exists to protect the deliverability and reputation of shared sending infrastructure for every customer, and to keep recipients' inboxes free of unwanted or unlawful email.",
      "This AUP is part of, and incorporated into, our Terms of Service.",
    ],
  },
  {
    id: "permitted",
    heading: "2. Permitted use",
    body: [
      "Business-to-business outreach with a lawful basis and a genuine offer relevant to the recipient.",
      "Recruiting outreach to candidates whose professional contact details are publicly available or were provided directly to you.",
      "Follow-ups to prospects who have engaged with your product or previously opted in, and who have not opted out.",
      "Verified lists that you or your organisation sourced, enriched, or collected directly, with an accurate record of provenance.",
    ],
  },
  {
    id: "consent",
    heading: "3. Consent and lawful basis",
    body: [
      "You must have a lawful basis to contact every recipient before sending, and you must be able to demonstrate that basis on request.",
      "Acceptable lawful bases include legitimate interest for relevant B2B outreach, prior consent, or an existing business relationship, depending on the recipient's jurisdiction.",
      "You may never purchase consent verification after the fact — the lawful basis must exist before the first message is sent.",
    ],
  },
  {
    id: "canspam",
    heading: "4. CAN-SPAM requirements (United States)",
    body: [
      "Every commercial message must use accurate header information, a non-deceptive subject line, and clearly identify itself as an advertisement where applicable.",
      "You must include a valid physical postal address and a clear, working opt-out mechanism in every message.",
      "Opt-out requests must be honoured within 10 business days, and you may not charge a fee, require login, or require any information beyond an email address to process an opt-out.",
    ],
  },
  {
    id: "gdprcasl",
    heading: "5. GDPR and CASL requirements (EU/UK/Canada)",
    body: [
      "For recipients in the EU/UK, you must complete a documented legitimate-interest balancing test before relying on legitimate interest as your lawful basis, and must honour objections immediately.",
      "For recipients in Canada, CASL requires either express consent, implied consent from an existing business relationship, or a limited statutory exemption, along with sender identification and an unsubscribe mechanism in every message.",
      "You are solely responsible for determining and documenting the correct lawful basis for each jurisdiction you contact.",
    ],
  },
  {
    id: "prohibited-content",
    heading: "6. Prohibited content",
    body: [
      "Phishing, malware, or messages designed to harvest credentials or install software without consent.",
      "Cryptocurrency solicitation, get-rich-quick schemes, adult content, or the sale of illegal goods or services.",
      "Content that is defamatory, harassing, discriminatory, or that promotes violence or self-harm.",
      "Deceptive subject lines, forged headers, or sender identities designed to impersonate another person or organisation.",
    ],
  },
  {
    id: "prohibited-practices",
    heading: "7. Prohibited sending practices",
    body: [
      "Ignoring opt-out requests, re-adding suppressed addresses, or removing unsubscribe links from templates.",
      "Sending at volume to catch-all domains, role addresses without a legitimate business purpose, or known spam-trap domains.",
      "Sharing a workspace with unrelated third parties, or splitting sends across multiple accounts, to evade volume limits or suppression rules.",
      "Using open or misconfigured relays, or spoofing domains you do not own or have authorization to send from.",
    ],
  },
  {
    id: "lists",
    heading: "8. List quality and sourcing",
    body: [
      "Lists must be verified for basic deliverability (valid syntax, active MX records) before the first send.",
      "We reserve the right to request evidence of list provenance, and to pause sending pending review where a list shows abnormal bounce or complaint rates.",
      "Scraped consumer email addresses obtained without a lawful basis, and purchased lists of unknown origin, are not permitted under any circumstances.",
    ],
  },
  {
    id: "limits",
    heading: "9. Volume limits and warmup",
    body: [
      "New mailboxes are subject to automatic warmup schedules that gradually increase daily send volume to protect domain reputation.",
      "Plan-level sending limits are documented in your workspace settings and may be adjusted based on account health and provider capacity.",
    ],
  },
  {
    id: "monitoring",
    heading: "10. Monitoring and thresholds",
    body: [
      "We continuously monitor bounce rates, spam-complaint rates, spam-trap hits, and authentication failures (SPF/DKIM/DMARC) at the workspace and mailbox level.",
      "Crossing a defined risk threshold automatically pauses affected campaigns and notifies workspace owners with the reason and a remediation path.",
    ],
  },
  {
    id: "enforcement",
    heading: "11. Enforcement",
    body: [
      "Warnings: a first minor violation triggers a notice and a request to remediate within a set period.",
      "Suspension: repeated or severe violations, or a sustained high complaint rate, result in immediate suspension of sending for the affected workspace.",
      "Termination: illegal content, phishing, deliberate evasion of these rules, or repeated suspensions result in permanent account termination without refund.",
      "We may remove specific campaigns, mailboxes, or content without terminating the full account where the violation is isolated.",
    ],
  },
  {
    id: "appeals",
    heading: "12. Appeals",
    body: [
      "If your workspace is suspended, you may appeal by emailing compliance@sendloop.app with an explanation and evidence of remediation. We review appeals within 5 business days.",
    ],
  },
  {
    id: "reporting",
    heading: "13. Reporting abuse",
    body: [
      "If you received unwanted email sent through Sendloop, you can report it to abuse@sendloop.app. We investigate every report and suppress the reported address across the responsible workspace.",
    ],
  },
  {
    id: "changes",
    heading: "14. Changes to this policy",
    body: [
      "We may update this policy to reflect new regulations or abuse patterns. Material changes are communicated to workspace owners at least 14 days in advance.",
    ],
  },
];

function Aup() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Acceptable"
        highlight="Use Policy"
        description="Last updated: August 17, 2026. These rules keep shared sending infrastructure healthy for every customer."
        primaryCta="Contact Compliance"
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Last updated: August 17, 2026</p>
          <div className="surface-card mt-4 p-6">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Contents</h2>
            <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {toc.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-sm text-primary hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mx-auto max-w-3xl">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="mb-10 scroll-mt-24 border-t border-border/60 pt-8 first:mt-8 first:border-t-0 first:pt-0">
              <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Section>
      <CtaBlock title="Sending responsibly starts here" description="Create a free workspace and let our warmup and suppression tools do the heavy lifting." cta="Start for Free" />
    </MarketingLayout>
  );
}
