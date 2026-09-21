import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, CtaBlock, metaFor } from "@/components/site/MarketingPage";

export const Route = createFileRoute("/refund-policy")({
  head: () =>
    metaFor(
      "Refund Policy — MunchReach",
      "MunchReach refund policy: eligibility, timeframes, how to request a refund, and exceptions.",
      "/refund-policy",
    ),
  component: RefundPolicy,
});

const toc = [
  ["overview", "1. Overview"],
  ["eligibility", "2. Eligibility"],
  ["yearly", "3. Yearly plans"],
  ["monthly", "4. Monthly plans"],
  ["lifetime", "5. Lifetime and special offers"],
  ["how-to", "6. How to request a refund"],
  ["exceptions", "7. Non-refundable cases"],
  ["processing", "8. Processing time"],
  ["chargebacks", "9. Chargebacks"],
  ["changes", "10. Changes to this policy"],
  ["contact", "11. Contact"],
] as const;

const sections = [
  {
    id: "overview",
    heading: "1. Overview",
    body: [
      "This Refund Policy explains when and how you can request a refund for MunchReach subscription fees.",
      "By subscribing to a paid plan, you agree to the terms in this policy. If you do not agree, please do not purchase a paid plan.",
    ],
  },
  {
    id: "eligibility",
    heading: "2. Eligibility",
    body: [
      "Refunds are considered on a case-by-case basis and are granted at MunchReach's discretion.",
      "In general, refunds are only available when the criteria below are met and the request is submitted within the required timeframe.",
      "Refunds are issued to the original payment method used for the purchase.",
    ],
  },
  {
    id: "yearly",
    heading: "3. Yearly plans",
    body: [
      "Yearly plans are eligible for a refund within 14 days of the initial purchase or renewal, provided you have not launched any outbound campaign during that period.",
      "If a campaign has been launched, messages have been sent, or the account has been used to send email through MunchReach, the yearly fee is no longer refundable.",
      "This policy exists because launching Campaigns and sending Email Messages consumes service capacity that cannot be recovered once used.",
    ],
  },
  {
    id: "monthly",
    heading: "4. Monthly plans",
    body: [
      "Monthly plans are not eligible for prorated or partial refunds.",
      "You may cancel your monthly subscription at any time from your workspace billing settings. Cancellation takes effect at the end of the current billing period, and you will retain access until that date.",
      "No refunds are issued for unused days in a monthly billing cycle.",
    ],
  },
  {
    id: "lifetime",
    heading: "5. Lifetime and special offers",
    body: [
      "Lifetime deals, promotional plans, and special offers are non-refundable unless the specific offer terms state otherwise.",
      "If a lifetime or promotional purchase includes a money-back guarantee, the guarantee terms shown at checkout apply.",
    ],
  },
  {
    id: "how-to",
    heading: "6. How to request a refund",
    body: [
      "Email support@munchreach.com from the email address associated with your MunchReach account.",
      "Include your workspace name, the invoice or transaction reference, and the reason for the refund request.",
      "We aim to respond to refund requests within 5 business days.",
    ],
  },
  {
    id: "exceptions",
    heading: "7. Non-refundable cases",
    body: [
      "Fees are not refundable when the refund window has expired.",
      "Fees are not refundable if the account has been suspended or terminated for violating the Terms of Service or Acceptable Use Policy.",
      "Overage charges, add-on purchases and other usage-based charges are not refundable once incurred.",
      "Refunds are not issued for poor campaign performance, low reply rates, or deliverability outcomes, as these depend on factors outside MunchReach's control.",
    ],
  },
  {
    id: "processing",
    heading: "8. Processing time",
    body: [
      "Approved refunds are processed back to the original payment method within 5–10 business days.",
      "The exact timing depends on your bank, card issuer, or payment provider and is outside MunchReach's control.",
    ],
  },
  {
    id: "chargebacks",
    heading: "9. Chargebacks",
    body: [
      "If you initiate a chargeback or payment dispute before contacting us, we reserve the right to suspend your account until the dispute is resolved.",
      "We encourage you to reach out to support@munchreach.com first so we can resolve the issue directly.",
    ],
  },
  {
    id: "changes",
    heading: "10. Changes to this policy",
    body: [
      "We may update this Refund Policy from time to time. Material changes will be communicated to workspace owners at least 14 days before they take effect.",
      "Continued use of the Service after the effective date constitutes acceptance of the updated policy.",
    ],
  },
  {
    id: "contact",
    heading: "11. Contact",
    body: [
      "Questions about this policy or the status of a refund request can be sent to support@munchreach.com.",
      "Last updated: September 1, 2026.",
    ],
  },
];

function RefundPolicy() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Refund"
        highlight="Policy"
        description="Last updated: September 1, 2026. When and how MunchReach subscription fees can be refunded."
        primaryCta="Contact Support"
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Last updated: September 1, 2026</p>
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
      <CtaBlock title="Questions about billing?" description="Our support team can walk you through refunds, cancellations, and invoices." cta="Contact Support" />
    </MarketingLayout>
  );
}
