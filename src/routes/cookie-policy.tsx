import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, Prose, metaFor } from "@/components/site/MarketingPage";

const LAST_UPDATED = "22 August 2026";

export const Route = createFileRoute("/cookie-policy")({
  head: () =>
    metaFor(
      "Cookie Policy — MunchReach",
      "How MunchReach uses cookies and similar technologies, which categories we set, and how you can control them in your browser.",
      "/cookie-policy",
    ),
  component: CookiePolicy,
});

const sections = [
  {
    heading: "What cookies are",
    body: [
      "Cookies are small text files that a website stores in your browser. They let a site remember information between page loads and visits — for example that you are signed in, or which theme you selected.",
      "Similar technologies such as local storage and session storage work the same way and are covered by this policy.",
    ],
  },
  {
    heading: "Essential cookies",
    body: [
      "MunchReach sets a small number of strictly necessary cookies and local storage entries. They keep your sign-in session active, protect forms against cross-site request forgery, and remember basic interface preferences such as the sidebar state.",
      "These cannot be switched off from inside the product, because the application cannot keep you signed in without them. Blocking them in your browser will sign you out and break parts of the dashboard.",
    ],
  },
  {
    heading: "Analytics cookies",
    body: [
      "MunchReach does not run third-party advertising or behavioural analytics scripts on the marketing website or in the application. Product usage counters (for example emails sent against your plan allowance) are recorded in your account, not through browser cookies.",
      "If we introduce an analytics provider in the future, this page will be updated before it is enabled and the provider will be listed on the Subprocessors page.",
    ],
  },
  {
    heading: "Preference cookies",
    body: [
      "Preference entries store choices you make in the interface, such as light or dark appearance and the layout of the unified inbox panes. They contain no personal data beyond the preference itself.",
    ],
  },
  {
    heading: "Marketing and tracking cookies",
    body: [
      "MunchReach does not set marketing or cross-site tracking cookies on this website.",
      "Separately, campaigns you send from MunchReach can include open and click tracking. That tracking applies to the emails you send to your own recipients, is controlled by you per campaign, and is unrelated to cookies on this website.",
    ],
  },
  {
    heading: "How MunchReach uses cookies",
    body: [
      "To authenticate you and keep your session valid across pages.",
      "To remember interface preferences so the product looks the same next time you sign in.",
      "To protect forms and API requests against abuse.",
    ],
  },
  {
    heading: "Third-party services",
    body: [
      "Some cookies and storage entries are set by the infrastructure providers that run MunchReach — for example the authentication and database platform that issues your session token, and the hosting/CDN layer that serves the site.",
      "The current list of providers, what they process and where they are located is published on the Subprocessors page.",
    ],
  },
  {
    heading: "Managing cookies",
    body: [
      "Every major browser lets you view, block and delete cookies and site data from its privacy settings. You can also use a private window to keep everything session-only.",
      "Blocking cookies for munchreach.com will prevent sign-in. Deleting them will sign you out of any active session.",
      "You can also remove data we hold about you using the Remove My Data page.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Questions about this policy? Email support@munchreach.com, or use the Contact Support page.",
      `Effective date: ${LAST_UPDATED}. Last updated: ${LAST_UPDATED}.`,
    ],
  },
];

function CookiePolicy() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Cookie"
        highlight="Policy"
        description="A plain-English summary of the cookies and browser storage MunchReach uses, and how to control them."
      />
      <Section>
        <p className="mb-8 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
        <Prose sections={sections} />
      </Section>
    </MarketingLayout>
  );
}
