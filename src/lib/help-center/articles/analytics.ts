import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const ANALYTICS_ARTICLES: HelpArticle[] = [
  {
    slug: "reading-analytics",
    title: "Reading your analytics",
    description: "The dashboard, the date ranges and what each number means.",
    category: "analytics",
    updated: UPDATED,
    popular: true,
    keywords: ["analytics", "metrics", "dashboard", "reporting", "kpi"],
    related: ["metric-definitions", "campaign-analytics-tab", "open-rate-accuracy", "export-reports"],
    content: `## Steps
1. Go to **Analytics**.
2. Choose a range: Today, 7 days, 30 days, 90 days or Custom.
3. Read the KPI cards, then the trend charts, then the per-campaign and per-mailbox tables.

## The KPI cards
Emails sent, Open rate, Reply rate, Positive replies, Bounce rate, Unsubscribe rate and Failed sends.

## How to read them in order
1. **Bounce rate** first — above a couple of percent, stop and clean the list.
2. **Reply rate** second — it is the only metric that reflects whether the campaign works.
3. **Positive replies** third — reply rate including angry replies is not success.
4. Open rate last, and sceptically.

## Important notes
Metrics only exist for mail sent after tracking was in place. A campaign launched before tracking was configured will show no opens or clicks, however well it performed.`,
  },
  {
    slug: "metric-definitions",
    title: "What each metric means",
    description: "Precise definitions so numbers can be compared honestly.",
    category: "analytics",
    updated: UPDATED,
    keywords: ["definitions", "open rate", "reply rate", "bounce rate", "delivered", "clicks"],
    related: ["reading-analytics", "open-rate-accuracy", "hard-vs-soft-bounces"],
    content: `- **Sent** — messages handed to the sending infrastructure
- **Delivered** — accepted by the recipient's server
- **Opens** — a tracked open was registered; requires tracking and image loading
- **Clicks** — a tracked link was followed
- **Replies** — a reply threaded back to the send
- **Positive replies** — replies you or your team marked as interested or better
- **Bounces** — rejected; hard bounces are permanent, soft bounces temporary
- **Unsubscribes** — recipients who opted out
- **Failed sends** — messages that could not be sent at all

## Important notes
Rates are computed against sent volume for the selected range. Comparing a one-day range with a ninety-day range will mislead you.`,
  },
  {
    slug: "campaign-performance-comparison",
    title: "Comparing campaigns and mailboxes",
    description: "Find what is working and which mailbox is dragging.",
    category: "analytics",
    updated: UPDATED,
    keywords: ["compare", "per campaign", "per mailbox", "performance table"],
    related: ["reading-analytics", "mailbox-health", "deliverability-basics"],
    content: `The Analytics page breaks performance down by campaign and by mailbox.

## What to look for
- One mailbox with a much lower reply rate than its peers on the same campaign — usually a placement problem specific to that mailbox or domain
- One campaign with a high bounce rate — a list problem, not a copy problem
- A step with a sharp drop-off — the follow-up is not earning attention

## Important notes
Compare like with like: the same range, similar volumes, and campaigns targeting similar audiences. A twenty-lead campaign's rates are noise.`,
  },
  {
    slug: "open-rate-accuracy",
    title: "Why open rates are unreliable",
    description: "What open tracking can and cannot tell you.",
    category: "analytics",
    updated: UPDATED,
    keywords: ["open rate", "inflated", "privacy", "image blocking", "apple mail"],
    related: ["metric-definitions", "tracking-not-working", "reading-analytics"],
    content: `Open tracking works by loading a tiny image. That makes it wrong in both directions.

## Under-counting
Clients that block images never register the open, even though the person read the email.

## Over-counting
Privacy proxies and security scanners fetch images automatically, registering opens nobody made.

## What to do
Optimise on replies. Use open rate only for coarse comparison between two variants sent under identical conditions — never as a success metric on its own.

## Important notes
Tracking also adds a redirect to every link, which very slightly costs deliverability. For a first cold email, sending without tracking is a defensible choice.`,
  },
  {
    slug: "tracking-not-working",
    title: "Opens and clicks are not being tracked",
    description: "Zero opens and clicks while sends and replies work.",
    category: "analytics",
    updated: UPDATED,
    keywords: ["no opens", "tracking broken", "clicks not recorded", "zero opens"],
    related: ["open-rate-accuracy", "reading-analytics", "campaign-settings"],
    content: `## Problem
Emails send, but opens and clicks stay at zero.

## Possible causes
- Tracking is not enabled for the campaign
- The campaign was sent before tracking was configured
- Recipients block images and never click — genuinely zero
- No links exist in the email to click

## How to check
1. Open the campaign settings and confirm tracking is enabled.
2. Check whether the campaign's sends predate tracking setup.
3. Send yourself a test, open it with images enabled and click a link.

## How to fix
- Publish and verify the tracking record, then relaunch or send new steps. Historic sends cannot be retro-tracked.
- If your own test registers an open and a click, tracking works and the zero is real recipient behaviour.

## When to contact support
Tracking Verified, your own test opens and clicks are not recorded.`,
  },
  {
    slug: "export-reports",
    title: "Exporting analytics",
    description: "Get numbers out for reporting.",
    category: "analytics",
    updated: UPDATED,
    keywords: ["export", "csv", "report", "download analytics"],
    related: ["reading-analytics", "export-leads", "api-analytics"],
    content: `Set the date range you want, then export from the Analytics page. Lead-level data exports from the Leads page, and everything available in the UI is also reachable through the public API's analytics endpoint if you want scheduled reporting.

## Important notes
Always record which range an export covers. A spreadsheet of rates with no date range attached is unusable a month later.`,
  },
];
