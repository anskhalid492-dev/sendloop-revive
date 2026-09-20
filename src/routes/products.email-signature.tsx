import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  PenLine,
  Repeat2,
  Send,
} from "lucide-react";

import {
  MailboxSignatureMock,
  SignatureHeroMock,
  SignaturePreviewMock,
  VariableCloud,
} from "@/components/site/EmailSignatureProductMocks";
import { CtaBlock, MarketingLayout, Section, metaFor } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";

const emailDestinations = [
  {
    icon: Send,
    title: "Campaign emails",
    text: "Keep the sender identity consistent across campaign messages.",
    to: "/product/campaigns" as const,
  },
  {
    icon: Repeat2,
    title: "Follow-ups",
    text: "Carry the same mailbox signature through every follow-up.",
    to: "/product/follow-ups" as const,
  },
  {
    icon: PenLine,
    title: "Manual emails",
    text: "Use the mailbox signature when writing individual messages.",
    to: "/product/email-accounts" as const,
  },
  {
    icon: Inbox,
    title: "Inbox replies",
    text: "Reply from the Unified Inbox with the correct sender details.",
    to: "/product/unified-inbox" as const,
  },
];

const setupSteps = [
  { number: "01", title: "Choose a mailbox", text: "Select the connected mailbox you want to represent." },
  { number: "02", title: "Create your signature", text: "Write, format, and personalize the signature for that sender." },
  { number: "03", title: "Save and use it across your outreach", text: "MunchReach adds it to email sent from that mailbox." },
];

export const Route = createFileRoute("/products/email-signature")({
  head: () =>
    metaFor(
      "Email Signature Software for Cold Outreach | MunchReach",
      "Create professional email signatures for every MunchReach mailbox and automatically use them across campaigns, follow-ups, manual emails, and inbox replies.",
      "/products/email-signature",
    ),
  component: EmailSignatureProductPage,
});

function EmailSignatureProductPage() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden border-b border-border bg-background">
        <div className="hero-glow absolute inset-0 opacity-75" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.83fr_1.17fr] lg:gap-14 lg:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <PenLine className="size-3.5" /> Email Signature
            </span>
            <h1 className="mt-6 text-4xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              Professional Email Signatures, <span className="text-gradient">Built Into Your Outreach</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Create one professional signature for each mailbox and automatically add it to campaigns, follow-ups, manual emails, and inbox replies.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild><Link to="/auth">Start Free</Link></Button>
              <Button size="lg" variant="outline" asChild><a href="#how-it-works">See How It Works</a></Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-primary" /> Built into the MunchReach sending workflow.
            </p>
          </div>
          <SignatureHeroMock />
        </div>
      </section>

      <Section
        title="One Signature. Every Email."
        description="Set the sender identity once for a mailbox and use it consistently across the messages you send from MunchReach."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {emailDestinations.map((item) => (
            <Link
              key={item.title}
              to={item.to}
              className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/35"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><item.icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">Explore <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        muted
        title="Personalized to Every Recipient"
        description="Use the lead and contact fields already available in MunchReach to keep signature details relevant without rebuilding the signature for every email."
      >
        <VariableCloud />
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
          <Link to="/product/templates" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">Explore Templates <ArrowRight className="size-4" /></Link>
          <Link to="/ai-personalized-outreach" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">Explore AI Personalization <ArrowRight className="size-4" /></Link>
        </div>
      </Section>

      <Section
        title="Every Mailbox Can Have Its Own Signature"
        description="Give each connected sending mailbox its own signature so every user and team sends with the correct identity."
      >
        <MailboxSignatureMock />
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Signatures follow the mailbox that sends the email. <Link to="/product/email-accounts" className="font-semibold text-primary hover:underline">See Email Accounts and Mailboxes.</Link>
        </p>
      </Section>

      <Section
        muted
        title="See Exactly What Recipients Will See"
        description="Preview the rendered email and signature before you use it in your outreach."
      >
        <SignaturePreviewMock />
      </Section>

      <Section id="how-it-works" title="Set It Up Once. Use It Everywhere.">
        <ol className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          {setupSteps.map((step, index) => (
            <li key={step.number} className="relative rounded-lg border border-border bg-card p-6 shadow-sm">
              {index < setupSteps.length - 1 ? <span className="absolute top-9 -right-5 hidden h-px w-5 bg-border md:block" aria-hidden="true" /> : null}
              <span className="text-sm font-bold text-primary">{step.number}</span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <section className="border-y border-border/60 bg-secondary/35">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 py-8 text-center sm:px-6 md:flex-row md:text-left">
          <div>
            <h2 className="text-xl font-semibold">Part of your complete outreach workflow</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create the message, personalize it, and handle replies in one workspace.</p>
          </div>
          <nav aria-label="Related MunchReach products" className="flex flex-wrap justify-center gap-2">
            <Link to="/product/campaigns" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">Campaigns</Link>
            <Link to="/product/email-accounts" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">Mailboxes</Link>
            <Link to="/product/unified-inbox" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">Unified Inbox</Link>
            <Link to="/product/templates" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">Templates</Link>
            <Link to="/ai-personalized-outreach" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">AI Personalization</Link>
            <Link to="/pricing" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">Pricing</Link>
          </nav>
        </div>
      </section>

      <CtaBlock
        title="Make Every Email Look Professional"
        description="Create consistent, personalized email signatures for your MunchReach mailboxes and keep every message on-brand."
        cta="Start Free"
      />
    </MarketingLayout>
  );
}