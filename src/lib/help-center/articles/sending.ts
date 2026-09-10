import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const SENDING_ARTICLES: HelpArticle[] = [
  {
    slug: "how-sending-works",
    title: "How MunchReach sends your emails",
    description: "From launch to delivery: the queue, the schedule and the mailboxes.",
    category: "sending",
    updated: UPDATED,
    popular: true,
    keywords: ["how sending works", "queue", "scheduler", "delivery", "infrastructure"],
    related: ["sending-window", "campaign-queue", "sending-pacing", "sending-troubleshooting"],
    content: `## The path an email takes
1. You launch a campaign. Every eligible lead is queued as a scheduled message.
2. The scheduler wakes up regularly, looks for messages whose time has come, and claims them.
3. Each claimed message is rendered — variables and personalization filled in — and handed to MunchReach's sending infrastructure from one of your mailboxes.
4. Delivery, bounce, open, click and reply events flow back and update the message, the lead and your analytics.

## What controls the pace
- The campaign's sending days, hours and timezone
- The campaign's daily and hourly limits
- Each mailbox's own daily and hourly limits
- The number of mailboxes assigned to the campaign
- Warmup, which holds back mailboxes that are still ramping

## Important notes
- Nothing sends outside the campaign's window, even if the queue is full.
- Messages are spaced across the window rather than fired in a burst.
- You do not manage the sending infrastructure. There is no server to configure and no rate to tune beyond your limits.`,
  },
  {
    slug: "sending-window",
    title: "Sending windows and timezones",
    description: "Days, hours and the timezone the campaign runs in.",
    category: "sending",
    updated: UPDATED,
    keywords: ["sending window", "business hours", "timezone", "days", "schedule"],
    related: ["configure-sending-hours", "campaign-timezone", "why-campaign-not-sending"],
    content: `## What it is
A campaign only sends on the days and within the hours you set, interpreted in the campaign's timezone.

## Steps
1. Open the campaign → **Schedule**.
2. Pick the sending days, or use the business-days shortcut.
3. Set the start and end hour.
4. Set the timezone.

## Important notes
- Launching after the window closes is normal and not a failure. The first sends go out when the window next opens.
- A narrow window plus a high daily limit does not send faster; it just clips the day.
- Changing the timezone shifts every future send, including follow-ups already scheduled.

## Common problems
- **"Active but nothing is sending"** — check the current time against the window before anything else.`,
  },
  {
    slug: "sending-pacing",
    title: "Pacing and delays between emails",
    description: "Why messages are spread out rather than sent at once.",
    category: "sending",
    updated: UPDATED,
    keywords: ["pacing", "delay", "spacing", "drip", "burst"],
    related: ["sending-window", "throughput-estimate", "deliverability-basics"],
    content: `MunchReach spreads a campaign's daily volume across the sending window instead of sending it in one burst.

## Why
A cold domain that sends 200 emails in ninety seconds looks like exactly what it looks like. Steady, human-shaped volume is what receiving providers reward.

## What you control
- The sending window length
- Daily and hourly limits at campaign and mailbox level
- How many mailboxes share the load

## Important notes
Widening the window is usually a better lever than raising a limit. Same volume, gentler pattern.`,
  },
  {
    slug: "follow-up-scheduling",
    title: "How follow-ups are scheduled",
    description: "When step two goes out, and what stops it.",
    category: "sending",
    updated: UPDATED,
    keywords: ["follow up", "step delay", "sequence timing", "next step"],
    related: ["follow-up-timing", "stop-rules", "sending-window"],
    content: `Each sequence step carries a delay measured from the previous step for that lead. When the delay elapses, the follow-up is scheduled — and then it still waits for the campaign's sending window.

## Important notes
- Delays are per lead, not campaign-wide. A lead added later gets its own timeline.
- Stop rules apply before every step. A lead who replied, unsubscribed or bounced does not receive the next one.
- A weekday-only window will push a follow-up whose delay lands on Saturday to Monday.

## Common problems
- **Follow-up looks late** — the delay expired outside the window, so it went out at the next opening.`,
  },
  {
    slug: "sending-capacity",
    title: "Increasing your sending capacity",
    description: "How to send more without wrecking deliverability.",
    category: "sending",
    updated: UPDATED,
    keywords: ["capacity", "send more", "scale", "volume", "more mailboxes"],
    related: ["mailbox-limits", "throughput-estimate", "deliverability-basics", "warmup-best-practices"],
    content: `## The right lever: more mailboxes
Capacity is mailboxes multiplied by per-mailbox limits. Adding mailboxes on healthy, verified domains scales safely. Raising one mailbox's daily limit to compensate does not.

## Steps
1. Verify an additional domain, or add mailboxes to a verified one.
2. Let warmup ramp them for a few weeks.
3. Assign them to the campaign on its **Email Accounts** tab.
4. Recheck the Throughput estimate on the Schedule tab.

## Important notes
- The Email Accounts page shows the workspace's total daily sending capacity.
- Growth should be gradual. Doubling volume overnight is the classic way to land in spam.`,
  },
  {
    slug: "why-campaign-not-sending",
    title: "Why is my campaign not sending?",
    description: "The checks to run, in order.",
    category: "sending",
    updated: UPDATED,
    popular: true,
    keywords: ["not sending", "stuck", "no emails", "nothing sent", "active but idle"],
    related: ["campaign-not-sending", "sending-window", "mailbox-troubleshooting", "campaign-queue"],
    content: `## Problem
The campaign is Active, the queue has messages, nothing goes out.

## Possible causes
- You are outside the sending window right now
- The daily limit is already reached for today
- Every assigned mailbox is warming, paused or in error
- No mailbox is assigned to the campaign
- All remaining recipients are suppressed or already stopped by a stop rule
- The domain fell out of verification

## How to check
1. Compare the current time in the campaign's timezone with its window.
2. Campaign → **Queue**: how many scheduled, and for when?
3. Campaign → **Email Accounts**: is at least one mailbox Active?
4. Email Accounts page: any Errors or Alerts?
5. Domain row: still Ready to send?

## How to fix
- Wait for the window, or widen it.
- Fix or add mailboxes; republish any missing DNS record.
- Raise the daily limit only if the mailboxes can genuinely support it.

## When to contact support
Window open, mailboxes Active, queue full, and nothing has moved for several hours.`,
  },
  {
    slug: "sending-troubleshooting",
    title: "Sending troubleshooting",
    description: "Sends fail, defer or stop partway.",
    category: "sending",
    updated: UPDATED,
    keywords: ["failed send", "deferred", "stopped", "partial send", "error"],
    related: ["why-campaign-not-sending", "smtp-550-5-7-1", "hard-vs-soft-bounces", "mailbox-troubleshooting"],
    content: `## Problem
Some messages show Failed or stay in Processing, or the campaign sends less than expected.

## Possible causes
- Invalid recipient addresses rejected at delivery time
- A mailbox hit an error mid-run and was skipped
- Limits reached — expected behaviour, not a fault
- The domain lost verification during the run
- Recipients suppressed after the queue was built

## How to check
1. Campaign → **Queue** and filter by status.
2. Open a failed message and read its recorded error.
3. Email Accounts for mailbox-level errors.

## How to fix
- Clean invalid addresses out of the list and re-verify future imports.
- Resolve the mailbox or domain issue, then let the scheduler retry.
- Accept limit-driven pacing; add capacity if you need more.

## When to contact support
Failures with no recorded reason, or messages stuck in Processing for hours.`,
  },
];
