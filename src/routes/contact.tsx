import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, Building2, Clock, Headset, Bug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MarketingLayout,
  PageHero,
  Section,
  FeatureGrid,
  FaqBlock,
  CtaBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "How fast will I hear back?",
    a: "Support replies within one business day. Sales and partnership enquiries typically hear back within a few hours on weekdays.",
  },
  {
    q: "Do you offer onboarding calls?",
    a: "Yes — teams on Growth and Agency plans can book a live migration and setup call after signing up.",
  },
  {
    q: "I have a deliverability emergency, what do I do?",
    a: "Email support@munchreach.com with 'urgent' in the subject line — deliverability incidents are triaged first.",
  },
  {
    q: "Can I reach you if I'm not a customer yet?",
    a: "Absolutely. Use the form for pricing questions, demos, or to check if MunchReach fits your sending volume.",
  },
  {
    q: "Do you have a status page?",
    a: "Yes, real-time uptime and incident history are published on our status page linked in the footer.",
  },
];

export const Route = createFileRoute("/contact")({
  head: () =>
    metaFor(
      "Contact MunchReach — Sales, Support & Partnerships",
      "Talk to the MunchReach team about pricing, migrations, agency plans, deliverability audits or technical support.",
      "/contact",
      faqs,
    ),
  component: Contact,
});

const channels = [
  { icon: Mail, title: "Sales", text: "Pricing, agency plans and migrations.", detail: "sales@munchreach.com" },
  { icon: MessageSquare, title: "Support", text: "Deliverability and product questions.", detail: "support@munchreach.com" },
  { icon: Building2, title: "Partnerships", text: "Agencies, resellers and integrations.", detail: "partners@munchreach.com" },
];

const reasons = [
  { icon: Headset, title: "I need help fast", text: "Technical or deliverability issue affecting an active campaign." },
  { icon: Mail, title: "I'm evaluating MunchReach", text: "Pricing, plan limits, migrations from another tool." },
  { icon: Bug, title: "I found a bug", text: "Something isn't behaving as documented — tell us what happened." },
  { icon: Building2, title: "I run an agency", text: "Multi-workspace setup, white-label reporting, reseller terms." },
];

const expectations = [
  { icon: Clock, title: "Under 1 business day", text: "Median first response time for support tickets." },
  { icon: Headset, title: "Live onboarding", text: "Growth and Agency customers get a guided migration call." },
  { icon: MessageSquare, title: "No bots", text: "Every message is read and answered by a real person on the team." },
];

function Contact() {
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    setTimeout(() => {
      setSubmitting(false);
      form.reset();
      toast.success("Thanks — we'll reply within one business day.");
    }, 600);
  };

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Contact"
        title="Talk to a human about"
        highlight="your outbound setup"
        description="Whether you are migrating 40 client workspaces or sending your first campaign, we will help you get it right."
        primaryCta="Start for Free"
      />

      <Section title="What brings you here?">
        <FeatureGrid items={reasons} />
      </Section>

      <Section muted>
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={onSubmit} className="surface-card space-y-5 p-6 md:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" required placeholder="Ada Lovelace" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" name="email" type="email" required placeholder="ada@company.com" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" placeholder="Example Inc" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volume">Monthly send volume</Label>
                <Input id="volume" name="volume" placeholder="e.g. 25,000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">How can we help?</Label>
              <Textarea id="message" name="message" required rows={6} placeholder="Tell us about your team, providers and goals." />
            </div>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Sending..." : "Send message"}
            </Button>
            <p className="text-xs text-muted-foreground">
              We reply within one business day. We never share your details or add you to a marketing list without consent.
            </p>
          </form>

          <div className="space-y-4">
            {channels.map((c) => (
              <div key={c.title} className="surface-card p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <c.icon className="size-5" />
                </div>
                <h2 className="mt-4 font-semibold">{c.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
                <p className="mt-2 text-sm text-primary">{c.detail}</p>
              </div>
            ))}
            <div className="surface-card p-6">
              <h2 className="font-semibold">Office</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Remote-first team across Europe and North America. Support hours 08:00–20:00 UTC, Monday to Friday.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="What to expect">
        <FeatureGrid items={expectations} />
      </Section>

      <Section>
        <FaqBlock faqs={faqs} />
      </Section>

      <TestimonialCarousel page="contact" />

      <CtaBlock title="Not ready to talk yet?" description="Create a free workspace and explore MunchReach at your own pace." />
    </MarketingLayout>
  );
}
