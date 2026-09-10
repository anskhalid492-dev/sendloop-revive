import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const CAMPAIGN_ARTICLES: HelpArticle[] = [
  {
    slug: "create-a-campaign",
    title: "How to create a campaign",
    description: "Create a campaign and work through its tabs in the right order.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["create campaign", "new campaign", "campaign builder", "tabs"],
    related: ["campaign-settings", "add-leads-to-campaign", "write-first-email", "launch-readiness"],
    content: `## Steps
1. Go to Campaigns and create a new campaign. Give it a name that identifies the audience and the offer.
2. Work through the tabs left to right: **Overview**, **Leads**, **Sequences**, **Schedule**, **Email Accounts**, **Options**, **Queue**, **Analytics**, **Settings**.
3. Overview summarises readiness and progress. Leads sets the audience. Sequences holds the emails. Schedule controls when. Email Accounts controls which mailboxes send.
4. Changes save as you work; **Save** in the header forces a save immediately.
5. Use **Preview** to see rendered copy for real leads and **Send test** to mail yourself a copy.

## Important notes
- The readiness bar at the top of a draft campaign lists everything still blocking launch.
- Overflow menu actions include Duplicate campaign, View analytics and Archive campaign.

## Common problems
- **Launch campaign is greyed out** — readiness is not satisfied; the bar names the reason.`,
  },
  {
    slug: "campaign-settings",
    title: "Campaign settings explained",
    description: "What each setting on the Options and Settings tabs actually changes.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["campaign options", "settings tab", "tracking", "stop on reply"],
    related: ["stop-rules", "sending-limits", "tracking-domains", "create-a-campaign"],
    content: `## Options
Behavioural rules for the campaign: whether opens and clicks are tracked, whether follow-ups stay on the same thread, and the stop rules that remove a lead from the remaining steps.

## Settings
Campaign identity and lifecycle: name, archiving and deletion.

## Schedule
Sending days, sending window, timezone, pacing delays, daily and hourly limits, and campaign start and stop dates.

## Email Accounts
Which mailboxes this campaign may send from. Volume is distributed across the selected mailboxes.

## Important notes
Changing a schedule setting on an active campaign re-plans the queue. Changing copy affects steps that have not been rendered yet; already-scheduled messages keep the copy they were built with.`,
  },
  {
    slug: "add-leads-to-campaign",
    title: "How to select and add leads to a campaign",
    description: "Choose the audience from lists, filters or a selection on the Leads page.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["add leads", "audience", "recipients", "select leads", "campaign leads"],
    related: ["lead-lists", "filter-leads", "campaign-recipients", "suppressed-leads"],
    content: `## Steps
1. Open the campaign's **Leads** tab.
2. Add a list, or add leads matching a filter.
3. Review the eligible recipient count — it is what will actually be queued after suppression and duplicates are removed.

## From the Leads page
Select leads with the checkboxes, then use Bulk actions → Add to campaign.

## Important notes
- Suppressed leads — bounced, complained or unsubscribed — are excluded automatically and are not counted as eligible.
- A lead already in the campaign is not added twice.
- Adding leads to an active campaign queues them for the remaining steps.

## Common problems
- **Eligible count lower than the list count** — suppression, duplicates or leads already in this campaign account for the gap.`,
  },
  {
    slug: "write-first-email",
    title: "How to write your first campaign email",
    description: "Structure, length and the settings that affect whether it lands.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["write email", "copy", "subject line", "first email", "template"],
    related: ["variables-and-fallbacks", "create-follow-ups", "improve-reply-rate-safely"],
    content: `## Steps
1. On the **Sequences** tab, open the first email step.
2. Write a subject line that reads like an internal note, not an advertisement.
3. Keep the body under about 90 words: one line of relevance, one line of value, one clear ask.
4. Insert variables from the lead record, each with a fallback.
5. Use Preview to check real leads, then Send test to see it in a real client.

## Important notes
- Plain text with at most one link performs best on a cold first touch.
- Image-heavy HTML, tracking-heavy layouts and multiple links all add placement risk.
- Save templates you reuse from the Templates page.`,
  },
  {
    slug: "create-follow-ups",
    title: "How to create follow-ups",
    description: "Add steps, set waits and keep the thread coherent.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["follow up", "sequence steps", "bump", "wait", "steps"],
    related: ["follow-up-timing", "stop-rules", "write-first-email", "api-sequences"],
    content: `## Steps
1. On the **Sequences** tab, add a step after the first email.
2. Choose the step type. Email steps send; wait steps pause; condition, task, CRM, webhook and stop steps let you branch or act.
3. Set the wait before the step in days and hours.
4. Turn on same-thread sending if the follow-up should appear as a reply to the previous email.

## Important notes
- Three to four emails is a normal sequence. More rarely helps and raises complaint risk.
- Every follow-up should add something — a different angle, a proof point, a shorter ask.
- Stop rules remove a lead from the remaining steps automatically on reply, bounce or unsubscribe.`,
  },
  {
    slug: "follow-up-timing",
    title: "How follow-up timing works",
    description: "How waits are calculated and why a follow-up can arrive later than expected.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["timing", "delay", "wait days", "when will it send", "spacing"],
    related: ["create-follow-ups", "sending-window", "how-sending-works"],
    content: `## Short answer
A step's wait is measured from the moment the previous step was sent to that lead, and the resulting time is then moved forward to the next open slot in the sending window.

## What that means in practice
- A three-day wait on a Friday afternoon lands the follow-up on Monday if you only send on business days.
- Two leads who received step one at different times get step two at different times.
- Pacing delays and daily limits can push a message later within the day.

## Important notes
Timing is per lead, not per campaign. There is no single moment when "the follow-up goes out".`,
  },
  {
    slug: "stop-rules",
    title: "Understanding stop rules in a sequence",
    description: "Sequences stop automatically on reply, bounce or unsubscribe.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["stop rules", "stop on reply", "exit criteria", "remove from sequence"],
    related: ["create-follow-ups", "suppressed-leads", "campaign-settings"],
    content: `A sequence exists to start a conversation, so it ends the moment one starts.

## Default behaviour
A lead is removed from the remaining steps on reply, on a hard bounce, and on unsubscribe. No further email in that sequence is queued for them.

## Per-step exceptions
Exceptions are configured per step in the sequence editor, so you can keep a specific step running where your process needs it.

## Important notes
Stop rules apply to the campaign the lead is in. A lead in two campaigns can still receive the other campaign's steps unless they are suppressed workspace-wide.`,
  },
  {
    slug: "variables-and-fallbacks",
    title: "Using variables and fallbacks in campaign copy",
    description: "How variables resolve, what happens when data is missing, and the unresolved report.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["variables", "merge tags", "fallback", "personalization tokens", "spintax"],
    related: ["write-first-email", "ai-personalization-overview", "required-lead-fields"],
    content: `Variables pull values from the lead record. A variable only resolves if the matching field exists on that lead.

## Fallbacks
Write a fallback so a missing field never breaks a sentence. Without one, an empty field produces an awkward gap in the copy.

## The unresolved variable report
The campaign preview lists every variable that will not resolve for the sampled leads, so you can fix the data or the copy before launching rather than after.

## Test sends
A test send goes out through the same sending infrastructure as production and reports the real result, so you see what a recipient sees.

## Common problems
- **Blank name in the greeting** — the lead has no first name and the variable has no fallback.
- **Variable printed literally** — the field name does not match a field on the lead record.`,
  },
  {
    slug: "configure-sending-days",
    title: "How to configure sending days",
    description: "Choose the days of the week a campaign may send on.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["sending days", "business days", "weekdays", "weekend"],
    related: ["configure-sending-hours", "campaign-timezone", "sending-window"],
    content: `## Steps
1. Open the campaign's **Schedule** tab.
2. Under Sending days, toggle the days you want. Business days only sets Monday to Friday in one click.
3. Save.

## Important notes
- Days are evaluated in the campaign's timezone, not yours.
- Changing sending days on an active campaign re-plans messages that have not been sent.
- If today is not a sending day, the queue waits for the next one — nothing is dropped.`,
  },
  {
    slug: "configure-sending-hours",
    title: "How to configure sending hours",
    description: "Set the window and the pacing inside it.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["sending hours", "window", "start hour", "end hour", "pacing"],
    related: ["configure-sending-days", "campaign-timezone", "sending-limits", "throughput-estimate"],
    content: `## Steps
1. Schedule tab → Sending window.
2. Set the start hour and end hour. The Next sending window preview shows when the campaign may next send.
3. Under Pacing, set the minimum delay between emails in minutes and an optional random extra delay.

## Important notes
- Pacing spreads sends across the window instead of firing a block at the top of the hour, which is better for reputation.
- A narrow window plus a low hourly limit can make it impossible to reach your daily limit. The Throughput estimate card shows the maximum currently achievable.`,
  },
  {
    slug: "campaign-timezone",
    title: "How to configure campaign timezone",
    description: "Send in your prospects' working hours, not yours.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["timezone", "time zone", "local time", "region"],
    related: ["configure-sending-hours", "configure-sending-days", "sending-window"],
    content: `## Steps
1. Schedule tab → Sending window → Timezone.
2. Choose the timezone your audience works in.
3. Save.

## Important notes
- Sending days and hours are both evaluated in this timezone.
- If your audience spans several regions, split them into separate campaigns with their own timezone rather than averaging.
- Daylight saving changes are handled by the timezone itself; you do not need to adjust hours twice a year.`,
  },
  {
    slug: "sending-limits",
    title: "How daily and hourly sending limits work",
    description: "Campaign limits, mailbox limits and which one wins.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["daily limit", "hourly limit", "cap", "volume", "throttle"],
    related: ["mailbox-limits", "throughput-estimate", "how-sending-works", "sending-window"],
    content: `Two layers of limits apply to every send.

## Campaign limits
On the Schedule tab: **Daily email sending limit** and **Max emails per hour** for this campaign, plus the minimum delay between emails.

## Mailbox limits
On each mailbox: a daily limit and an hourly limit, shared across every campaign that mailbox sends for.

## Which one applies
The tighter one. A campaign allowed 500 a day that only has mailboxes totalling 200 a day will send 200.

## Important notes
- Limits are per day in the campaign's timezone.
- When a limit is reached, remaining messages wait for the next window. They are not cancelled.
- The Throughput estimate card on the Schedule tab shows total leads, daily limit, sent today, remaining today, available mailbox capacity, the maximum currently achievable, and estimated emails per sending day and per week.`,
  },
  {
    slug: "throughput-estimate",
    title: "Reading the throughput estimate",
    description: "How long a campaign will actually take to finish.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["throughput", "estimate", "how long", "capacity", "per week"],
    related: ["sending-limits", "select-mailboxes", "configure-sending-hours"],
    content: `The Throughput estimate card on the Schedule tab turns your settings into a real forecast.

## What it shows
Total leads, daily sending limit, sent today, remaining today, campaign limit, available mailbox capacity, the maximum currently achievable, sending days per week, window length, estimated emails per hour, emails per sending day and emails per week.

## How to use it
Divide total leads by emails per week. If the answer is longer than you can wait, add mailboxes rather than raising the per-mailbox limit — that is the change that protects reputation.

## Important notes
"Maximum currently achievable" accounts for mailbox capacity, so it can be lower than your campaign limit. That gap is the thing to fix.`,
  },
  {
    slug: "select-mailboxes",
    title: "How to select mailboxes for a campaign",
    description: "Choose the sending accounts and spread volume across them.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["select mailbox", "sending accounts", "rotation", "email accounts tab"],
    related: ["mailbox-limits", "mailbox-health", "throughput-estimate", "sending-limits"],
    content: `## Steps
1. Open the campaign's **Email Accounts** tab.
2. Select the mailboxes this campaign may send from.
3. Check the Throughput estimate on the Schedule tab to see the combined capacity.

## How volume is distributed
MunchReach spreads messages across the selected mailboxes rather than draining one before starting the next, respecting each mailbox's own daily and hourly limits.

## Important notes
- Only active mailboxes send. A mailbox in an error state is skipped until it is fixed.
- Mailboxes still warming carry very little campaign volume by design.
- Removing a mailbox from an active campaign re-plans its unsent messages onto the remaining mailboxes.`,
  },
  {
    slug: "launch-readiness",
    title: "What the launch readiness bar checks",
    description: "The conditions a campaign must satisfy before it can send.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["readiness", "not ready to launch", "blocked", "launch button disabled"],
    related: ["launch-first-campaign", "select-mailboxes", "add-leads-to-campaign"],
    content: `Launch readiness recomputes every time the campaign changes, and it is checked against the database rather than the form on screen.

## What it checks
At least one active sending account, a lead list that resolves to eligible recipients, at least one sequence step with a subject and a body, and a sending schedule.

## What you see
Draft and scheduled campaigns show either "Ready to launch — N leads" or "Not ready to launch" with the specific issues listed.

## Eligible recipients
The eligible recipient count is recomputed and persisted, so the number shown is the number that will actually be queued after suppression and duplicates are removed.

## Audit trail
Every launch, pause and resume is recorded in the campaign audit trail with the user who performed it.`,
  },
  {
    slug: "pause-resume-stop-campaign",
    title: "How to pause, resume and stop a campaign",
    description: "The difference between pausing, resuming, archiving and deleting.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["pause", "resume", "stop", "archive", "cancel campaign"],
    related: ["campaign-statuses", "edit-a-campaign", "api-campaigns"],
    content: `## Pause
Click **Pause campaign** in the campaign header. Scheduled messages stop going out immediately; the queue is kept.

## Resume
Click **Resume campaign**. Sending picks up at the next open moment in the sending window. Messages whose scheduled time has passed are re-planned rather than sent in a burst.

## Stop and archive
Archiving from the overflow menu takes the campaign out of the active list. Archived campaigns keep their history and analytics.

## Important notes
- Pausing does not remove leads from the campaign and does not reset follow-up waits.
- Deleting a campaign removes its queue permanently; archive instead if you may want the record.`,
  },
  {
    slug: "edit-a-campaign",
    title: "How to edit a running campaign",
    description: "What you can safely change after launch and what it affects.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["edit campaign", "change copy", "change schedule", "after launch"],
    related: ["campaign-settings", "pause-resume-stop-campaign", "add-leads-to-campaign"],
    content: `## Safe to change any time
- Adding leads: they are queued for the remaining steps.
- Copy on steps that have not been sent yet.
- Mailbox selection: unsent messages are re-planned across the new set.

## Changes that re-plan the queue
Sending days, sending window, timezone, daily and hourly limits, and pacing. MunchReach recalculates the schedule for unsent messages.

## Not retroactive
Already-sent messages keep the copy and mailbox they went out with. Already-scheduled messages keep the copy they were rendered with.

## Important notes
Pause the campaign if you are making several changes at once, then resume. That avoids partial re-planning between saves.`,
  },
  {
    slug: "campaign-statuses",
    title: "Campaign statuses explained",
    description: "Draft, scheduled, active, paused, completed and archived.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["status", "draft", "active", "paused", "completed", "archived", "scheduled"],
    related: ["launch-first-campaign", "pause-resume-stop-campaign", "campaign-queue"],
    content: `**Draft** — being built, or still queueing its audience. A campaign stays in draft until the whole audience is queued, so a half-prepared campaign never sends.

**Scheduled** — ready and waiting for its start date.

**Active** — the audience is queued and messages send inside the sending window.

**Paused** — sending is stopped by you. The queue is intact and resuming continues where it left off.

**Completed** — every recipient has finished the sequence, or the campaign's stop date has passed.

**Archived** — taken out of the working list. History and analytics are kept.

## Important notes
Active does not mean "sending right now". Outside the sending window, on a non-sending day, or once the daily limit is reached, an active campaign is idle by design.`,
  },
  {
    slug: "campaign-queue",
    title: "The campaign queue and scheduled emails",
    description: "What the Queue tab shows and what each message state means.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["queue", "scheduled", "processing", "sent", "failed", "queue tab"],
    related: ["how-sending-works", "campaign-not-sending", "campaign-statuses"],
    content: `The Queue tab lists the messages a campaign has created, with counts by state.

## States
- **Scheduled** — planned for a specific time in the future
- **Processing** — being handed to the sending infrastructure right now
- **Sent** — accepted for delivery
- **Failed** — could not be sent after retries
- **Cancelled** — removed, usually because a stop rule fired
- **Bounced** — rejected by the recipient's mail server after sending

## Steps
1. Open the campaign → **Queue**.
2. Check the mix. A healthy active campaign shows scheduled counts falling and sent counts rising during the window.

## Important notes
Every scheduled message carries its own send time, spread across the window by pacing. Seeing thousands of scheduled messages is normal immediately after launch.`,
  },
  {
    slug: "large-campaigns",
    title: "How MunchReach handles large campaigns",
    description: "What to expect when launching thousands of leads at once.",
    category: "campaigns",
    updated: UPDATED,
    popular: true,
    keywords: ["large campaign", "thousands of leads", "preparing", "batches", "slow launch"],
    related: ["launch-first-campaign", "campaign-queue", "campaign-launch-failed", "sending-limits"],
    content: `## Short answer
Large audiences are prepared in controlled batches. Preparation can take a few minutes; the campaign becomes Active only when the whole audience is queued.

## What you see
After clicking Launch campaign, a progress indicator reports how many emails have been queued so far. It continues automatically until preparation finishes.

## Why it works this way
Queueing tens of thousands of messages in one go is fragile — a single interruption would leave the audience half prepared. Batching makes launch resumable and keeps the app responsive.

## Important notes
- You can leave the page during preparation; it continues and you can reopen the campaign to check progress.
- Preparation is idempotent, so nothing is queued twice if a batch is retried.
- Preparation speed has nothing to do with sending speed. Sending is governed by your window, your limits and your mailbox capacity.

## Common problems
- **Stuck on "Preparing your campaign"** — see the troubleshooting article on campaigns stuck preparing.`,
  },
  {
    slug: "campaign-analytics-tab",
    title: "Campaign analytics",
    description: "The per-campaign numbers and how to drill into them.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["campaign analytics", "campaign stats", "performance", "metrics"],
    related: ["reading-analytics", "campaign-performance-comparison", "api-analytics"],
    content: `## Steps
1. Open the campaign → **Analytics**.
2. Read the headline rates: delivery, open, click, reply, bounce.
3. Use the funnel to see where leads drop out, and open a stage to see the underlying recipients.

## How to interpret it
- Healthy delivery with a low reply rate is a copy or targeting problem.
- Falling delivery with rising bounces is a list or authentication problem.
- Opens without replies usually means the subject works and the body does not.

## Important notes
Metrics come from deduplicated delivery events, so a recipient opening five times counts once for unique opens.`,
  },
  {
    slug: "duplicate-a-campaign",
    title: "Duplicating a campaign",
    description: "Reuse a sequence and its settings for a new audience.",
    category: "campaigns",
    updated: UPDATED,
    keywords: ["duplicate", "clone", "copy campaign", "reuse"],
    related: ["create-a-campaign", "campaign-settings", "add-leads-to-campaign"],
    content: `## Steps
1. Open the campaign.
2. Use the overflow menu in the header → **Duplicate campaign**.
3. The copy is created as a draft with the same sequence and settings.
4. Attach the new audience and review the schedule before launching.

## Important notes
The duplicate does not copy leads, queue, history or analytics — only the configuration. Check the mailbox selection: capacity that suited the original audience may not suit the new one.`,
  },
];
