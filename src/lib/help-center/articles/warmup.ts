import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const WARMUP_ARTICLES: HelpArticle[] = [
  {
    slug: "how-warmup-works",
    title: "How inbox warmup works",
    description: "Why a new mailbox needs weeks before it carries real volume.",
    category: "warmup",
    updated: UPDATED,
    popular: true,
    keywords: ["warmup", "warm up", "ramp", "new mailbox", "reputation"],
    related: ["start-warmup", "warmup-settings", "warmup-best-practices", "mailbox-health"],
    content: `A brand-new mailbox has no sending history. Receiving providers treat unknown senders that suddenly send hundreds of cold emails as suspicious, and place them accordingly.

## What warmup does
Warmup sends a small, gradually increasing volume of conversational mail from your mailbox and generates natural engagement with it — opens and replies — so the mailbox builds a track record before it carries campaign traffic.

## What to expect
- Volume ramps over weeks, not days
- Campaign capacity stays low while a mailbox is Warming
- Health improves gradually and can regress if you push volume too hard

## Important notes
Warmup is not a workaround for bad list quality. It builds reputation; sending to invalid or uninterested addresses destroys it faster than warmup can rebuild it.`,
  },
  {
    slug: "start-warmup",
    title: "How to start warmup",
    description: "Turn warmup on for a mailbox and watch it ramp.",
    category: "warmup",
    updated: UPDATED,
    keywords: ["start warmup", "enable warmup", "turn on warmup"],
    related: ["how-warmup-works", "warmup-settings", "warmup-statuses"],
    content: `## Steps
1. Warmup starts automatically when you connect a mailbox with **Start warmup** enabled.
2. To manage it later, go to **Warmup** (Inbox Warmup).
3. Find the mailbox row and start, pause or resume warmup there.
4. Open its settings to change the ramp.

## Important notes
- Start warmup the day you create the mailbox, not the day before your campaign.
- Warmup keeps running while campaigns send. It is not something you finish and switch off.`,
  },
  {
    slug: "warmup-settings",
    title: "Warmup settings explained",
    description: "Presets, volume, ramp, schedule and safety controls.",
    category: "warmup",
    updated: UPDATED,
    keywords: ["warmup settings", "conservative", "balanced", "aggressive", "ramp", "auto pause"],
    related: ["how-warmup-works", "warmup-best-practices", "bounce-complaint-protection"],
    content: `## Presets
- **Conservative** — slowest ramp, lowest risk; the right choice for a new domain
- **Balanced** — the sensible default for most mailboxes
- **Aggressive** — fastest ramp; only for an established domain with clean history

## What the settings control
- Starting and target daily warmup volume
- How quickly volume increases
- Which days and hours warmup runs
- Safety thresholds that pause the mailbox when bounce or complaint rates rise

## Important notes
- Auto-pause is protection, not an error. A mailbox paused by a safety threshold is telling you something about your list or domain.
- Changing to Aggressive mid-ramp does not shortcut reputation; it just increases the odds of tripping a threshold.`,
  },
  {
    slug: "warmup-statuses",
    title: "Warmup statuses",
    description: "What each badge on the warmup page means.",
    category: "warmup",
    updated: UPDATED,
    keywords: ["warming", "paused", "off", "safe to resume", "blocked", "status"],
    related: ["mailbox-stuck-warming-up", "bounce-complaint-protection", "mailbox-health"],
    content: `- **Warming** — ramping normally
- **Off** — warmup is not running for this mailbox
- **Paused — safe to resume** — you paused it, and nothing is blocking a restart
- **Paused by bounce protection** — the bounce rate crossed the safety threshold
- **Paused by complaint protection** — recipients marked mail as spam
- **Paused by authentication protection** — the domain's authentication is failing
- **Blocked** — something must be fixed before warmup can continue

## Important notes
Resuming a protection-paused mailbox without fixing the cause simply trips the same threshold again, with more damage each time.`,
  },
  {
    slug: "warmup-best-practices",
    title: "Warmup best practices",
    description: "How to warm mailboxes so they actually survive campaigns.",
    category: "warmup",
    updated: UPDATED,
    keywords: ["best practice", "how long", "ramp schedule", "warmup tips"],
    related: ["how-warmup-works", "deliverability-basics", "sending-capacity", "mailbox-limits"],
    content: `1. Warm every new mailbox for at least two to three weeks before campaign sending.
2. Start campaigns at low daily volume on a warming mailbox and increase gradually.
3. Keep warmup running permanently — it is ongoing maintenance, not setup.
4. Add mailboxes for capacity rather than pushing one mailbox harder.
5. Verify your list before sending. Bounces undo warmup faster than warmup builds.
6. Watch health weekly and slow down at the first fair or poor score.

## Important notes
There is no legitimate way to send high cold volume from a week-old mailbox. Anything that promises it is trading your domain's future for this month's numbers.`,
  },
  {
    slug: "mailbox-stuck-warming-up",
    title: "Mailbox stuck warming up",
    description: "Warmup shows no progress or the mailbox keeps pausing.",
    category: "warmup",
    updated: UPDATED,
    popular: true,
    keywords: ["stuck warming", "no progress", "warmup paused", "not ramping"],
    related: ["warmup-statuses", "bounce-complaint-protection", "domain-verification-troubleshooting", "mailbox-health"],
    content: `## Problem
A mailbox stays Warming with no ramp, or is repeatedly auto-paused.

## Possible causes
- A safety threshold keeps pausing it — bounces, complaints or authentication
- The domain fell out of verification
- The warmup schedule excludes most of the week
- The mailbox is genuinely early in a Conservative ramp and is fine

## How to check
1. Warmup → read the mailbox's status badge; it names the protection that paused it.
2. Email Accounts → the domain row → **Check DNS**.
3. Open warmup settings and check the schedule days and hours.
4. Look at the mailbox's health band and recent bounce rate.

## How to fix
- Fix authentication and re-verify the domain.
- Clean the lead lists causing bounces or complaints before resuming.
- Widen the warmup schedule.
- If it is early in a Conservative ramp, leave it alone; slow is the point.

## When to contact support
Domain verified, no protection pause recorded, health good, and volume has not moved in over a week.`,
  },
];
