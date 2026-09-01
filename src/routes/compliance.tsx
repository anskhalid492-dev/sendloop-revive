import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  HelpCircle,
  Mail,
  MessageSquare,
  PauseCircle,
  Scale,
  Send,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  CtaBlock,
  metaFor,
} from "@/components/site/MarketingPage";

export const Route = createFileRoute("/compliance")({
  head: () =>
    metaFor(
      "Compliance — MunchReach",
      "Platform guidance for responsible cold outreach: list hygiene, unsubscribe handling, bounce and complaint protection, and user responsibilities.",
      "/compliance",
    ),
  component: Compliance,
});

const sections = [
  {
    id: "why",
    icon: Shield,
    title: "Why Compliance Matters",
    body: "Good email outreach is not only about getting replies. It is also about respecting recipients, protecting sender reputation, and maintaining healthy email infrastructure.",
    points: [
      "High bounce rates",
      "Spam complaints",
      "Low deliverability",
      "Domain reputation damage",
      "Provider restrictions",
      "Campaign suspension",
      "Account restrictions",
    ],
    footer:
      "Responsible sending protects both your business and the MunchReach ecosystem. When every sender follows strong practices, every customer benefits from better inbox placement and healthier domains.",
  },
  {
    id: "import",
    icon: Users,
    title: "Before You Import a Lead List",
    body: "Only import contact data you are permitted to use for your intended outreach. The quality and legitimacy of your list is the foundation of responsible sending.",
    points: [
      "Know where your contacts came from",
      "Use appropriate and legitimate data sources",
      "Make sure your outreach is appropriate for the recipients",
      "Keep contact data accurate and up to date",
      "Avoid using lists where the intended use is prohibited or unlawful",
      "Respect applicable privacy and marketing laws",
    ],
    footer:
      "No single source or acquisition method is automatically legal everywhere. It is your responsibility to confirm that your use of a list complies with the laws and obligations that apply to you.",
  },
  {
    id: "clean",
    icon: Sparkles,
    title: "Keep Your Contact Data Clean",
    body: "Clean lists reduce bounces and protect sender reputation. Poor list hygiene is one of the fastest ways to damage deliverability.",
    points: [
      "Verify email addresses before sending",
      "Remove invalid addresses",
      "Remove hard bounces",
      "Suppress spam complaints",
      "Suppress unsubscribed recipients",
      "Do not repeatedly send to addresses that consistently fail",
      "Do not intentionally send to known invalid or suppressed recipients",
    ],
  },
  {
    id: "unsubscribe",
    icon: Mail,
    title: "Respect Unsubscribes",
    highlight: true,
    body: "Honoring opt-outs is essential to responsible outreach and healthy sender reputation.",
    points: [
      "Provide an appropriate way for recipients to opt out where required",
      "Honor unsubscribe requests promptly",
      "Never intentionally re-add suppressed recipients",
      "Keep suppression lists accurate",
    ],
    footer:
      "MunchReach may maintain suppression records to help prevent future sending to recipients who should no longer receive messages.",
  },
  {
    id: "bounce",
    icon: AlertTriangle,
    title: "Bounce & Complaint Protection",
    body: "MunchReach uses platform-level safeguards to help protect shared infrastructure and sender reputation.",
    points: [
      "Hard bounces should be suppressed",
      "Complaints should be suppressed",
      "Repeated temporary failures may trigger restrictions",
      "Abnormally high bounce or complaint rates may trigger campaign or mailbox protection measures",
      "Campaigns may be paused when sending behavior creates a significant deliverability risk",
    ],
    footer:
      "These controls are platform safeguards. They do not guarantee that any campaign is legally compliant.",
  },
  {
    id: "responsible",
    icon: Send,
    title: "Responsible Sending",
    body: "Sustainable outreach is built gradually. Sudden volume spikes and neglected infrastructure are common causes of deliverability problems.",
    points: [
      "Start with controlled sending volumes",
      "Gradually increase volume over time",
      "Avoid sudden large-volume spikes",
      "Use properly configured sending domains",
      "Monitor bounce and complaint rates",
      "Monitor delivery performance",
      "Stop and investigate abnormal sending behavior",
      "Keep your sending infrastructure healthy",
    ],
  },
  {
    id: "quality",
    icon: MessageSquare,
    title: "Message Quality",
    body: "Send relevant, honest, and useful messages. Deceptive or low-quality content harms recipients, damages your reputation, and increases the risk of blocks or complaints.",
    avoid: [
      "Misleading subject lines",
      "False claims",
      "Deceptive sender identity",
      "Misleading offers",
      "Unnecessary attachments",
      "Excessive links",
      "Content designed to deceive recipients",
    ],
    encourage: [
      "Clear sender identity",
      "Relevant messaging",
      "Honest offers",
      "Clear calls to action",
      "Appropriate personalization",
      "Easy-to-understand communication",
    ],
  },
  {
    id: "providers",
    icon: Server,
    title: "Third-Party Email Providers",
    body: "MunchReach may use third-party email infrastructure and providers to deliver messages. You must follow applicable provider policies and sending requirements.",
    points: [
      "Provider policies can change and may impose additional restrictions",
      "If a provider restricts certain sending behavior, MunchReach may need to restrict or suspend related sending activity",
      "Infrastructure credentials, API keys, and internal technical details are never shared on public pages",
    ],
  },
  {
    id: "restrict",
    icon: PauseCircle,
    title: "When MunchReach May Restrict Sending",
    body: "MunchReach may restrict, pause, or suspend sending when necessary to protect recipients, sender reputation, email infrastructure, MunchReach users, third-party providers, and the MunchReach platform.",
    points: [
      "Excessive bounce rates",
      "Excessive complaint rates",
      "Repeated sending to suppressed recipients",
      "Suspicious sending patterns",
      "Abuse reports",
      "Deceptive campaigns",
      "Attempts to bypass platform protections",
      "Other activity that violates MunchReach policies or applicable requirements",
    ],
  },
  {
    id: "responsibility",
    icon: UserCheck,
    title: "User Responsibility",
    highlight: true,
    body: "You are responsible for your campaigns. MunchReach provides tools and safeguards, but these tools do not transfer your legal or regulatory responsibilities to MunchReach.",
    points: [
      "Your contact lists",
      "Your data sources",
      "Your messaging",
      "Your offers",
      "Your personalization",
      "Your sending practices",
      "Your unsubscribe handling",
      "Your compliance obligations",
    ],
  },
];

const checklist = [
  "Do I know where this contact list came from?",
  "Am I permitted to contact these recipients for this purpose?",
  "Are my email addresses verified?",
  "Is my messaging truthful and relevant?",
  "Is my sender identity clear?",
  "Is my unsubscribe process working?",
  "Are suppressed recipients excluded?",
  "Are my sending domains properly configured?",
  "Is my sending volume reasonable?",
  "Am I monitoring bounces and complaints?",
];

function Compliance() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Platform Rules"
        title="Send Responsibly."
        highlight="Protect Your Sender Reputation."
        description="MunchReach is built to help businesses run effective cold outreach while maintaining responsible sending practices. Every user is responsible for making sure their campaigns, contact lists, messaging, and sending practices comply with applicable laws, regulations, recipient expectations, and email-provider requirements."
        primaryCta="Contact Support"
        primaryHref="/contact-support"
        secondaryCta="Visit Help Center"
        secondaryHref="/help-center"
      />

      <Section muted>
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <article
                  key={s.id}
                  id={s.id}
                  className={`surface-card scroll-mt-24 p-6 ${
                    s.highlight ? "ring-1 ring-primary/20" : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                        s.highlight ? "bg-primary/12 text-primary" : "bg-muted text-primary"
                      }`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <h2 className="text-lg font-semibold tracking-tight leading-snug">
                      {s.title}
                    </h2>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>

                  {s.points ? (
                    <ul className="mt-4 space-y-2">
                      {s.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {s.avoid && s.encourage ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">
                          Avoid
                        </h3>
                        <ul className="mt-2 space-y-1.5">
                          {s.avoid.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive/60" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-success">
                          Encourage
                        </h3>
                        <ul className="mt-2 space-y-1.5">
                          {s.encourage.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}

                  {s.footer ? (
                    <p className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                      {s.footer}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
              Pre-Launch
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Compliance Checklist
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Before launching a campaign, make sure you can answer yes to each question below.
            </p>
          </div>

          <div className="surface-card mt-8 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              {checklist.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4"
                >
                  <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-primary/40 text-primary">
                    <CheckCircle2 className="size-3.5" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section muted>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Scale className="size-6" />
          </span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            MunchReach Does Not Provide Legal Advice
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Compliance requirements vary by jurisdiction, industry, recipient type, and use case.
            This page provides general platform guidance and is not legal advice. Users are
            responsible for understanding and meeting the requirements that apply to their campaigns.
          </p>
        </div>
      </Section>

      <CtaBlock
        title="Have questions about using MunchReach responsibly?"
        description="Our support team can help with platform questions. For legal questions, please consult a qualified attorney in your jurisdiction."
        cta="Visit Help Center"
        secondaryCta="Contact Support"
        secondaryHref="/contact-support"
      />
    </MarketingLayout>
  );
}
