import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const INBOX_ARTICLES: HelpArticle[] = [
  {
    slug: "inbox-overview",
    title: "The unified inbox",
    description: "Every reply to every mailbox, in one place.",
    category: "inbox",
    updated: UPDATED,
    popular: true,
    keywords: ["inbox", "unified inbox", "replies", "conversations", "folders"],
    related: ["inbox-replies-and-threading", "inbox-saved-views", "conversation-statuses"],
    content: `The inbox collects replies to all of your connected mailboxes so you do not have to log into each one.

## Folders
Inbox, Unread, Sent, Snoozed, Drafts, All mail and Archived.

## What a conversation shows
The thread with the lead, which mailbox it belongs to, which campaign produced it, and the conversation's current status.

## Important notes
Replies only arrive if the domain is set up to receive. If a campaign appears to get zero replies, check receiving before concluding the copy failed.`,
  },
  {
    slug: "inbox-replies-and-threading",
    title: "Replies and threading",
    description: "How a reply is matched to its lead and campaign.",
    category: "inbox",
    updated: UPDATED,
    popular: true,
    keywords: ["threading", "reply matching", "thread", "conversation", "out of office"],
    related: ["inbox-overview", "stop-rules", "inbox-missing-replies"],
    content: `When someone replies, MunchReach matches the message back to the original send and threads it under that lead's conversation.

## What happens automatically
- The lead's status is updated to reflect the reply
- Stop rules fire, so a replying lead stops receiving follow-ups
- The reply appears in the unified inbox and in your analytics

## Important notes
- Automatic replies such as out-of-office are recognised as their own status, so a holiday responder does not get counted as interest.
- Replying from the inbox sends from the same mailbox that started the thread, which keeps the conversation coherent to the recipient.`,
  },
  {
    slug: "reply-to-a-conversation",
    title: "Replying, snoozing and archiving",
    description: "Working a conversation to a conclusion.",
    category: "inbox",
    updated: UPDATED,
    keywords: ["reply", "snooze", "archive", "draft", "respond"],
    related: ["inbox-overview", "conversation-statuses", "inbox-saved-views"],
    content: `## Steps
1. Open the conversation in the inbox.
2. Write your reply and send — it goes from the mailbox that owns the thread.
3. **Snooze** to bring it back later, **Archive** when it is finished.
4. Set the conversation status so your pipeline reflects reality.

## Important notes
- Drafts are saved so a half-written reply is not lost.
- Archiving does not delete anything; archived conversations remain searchable in All mail.`,
  },
  {
    slug: "conversation-statuses",
    title: "Conversation statuses",
    description: "What each status means and when to set it.",
    category: "inbox",
    updated: UPDATED,
    keywords: ["status", "interested", "meeting booked", "won", "not interested", "ooo"],
    related: ["inbox-saved-views", "crm-pipeline-basics", "lead-statuses"],
    content: `Statuses are how the inbox becomes a pipeline rather than a mailbox.

- **Lead** — replied, not yet qualified
- **Interested** — positive reply worth pursuing
- **Meeting booked** — a call is on the calendar
- **Meeting completed** — the call happened
- **Won** — closed
- **Not interested** — a clear no
- **Out of office** — an automatic responder; follow up later
- **Unsubscribed** — asked to be removed
- **Bounced** — the address failed

## Important notes
Set the status as you read the reply, not later. Every report downstream depends on it being honest.`,
  },
  {
    slug: "inbox-saved-views",
    title: "Saved views and filters",
    description: "Cut the inbox down to what needs action.",
    category: "inbox",
    updated: UPDATED,
    keywords: ["saved views", "filter inbox", "assigned to me", "interested view"],
    related: ["conversation-statuses", "inbox-overview", "team-roles-and-visibility"],
    content: `Saved views filter the inbox by status or ownership: Interested, Meeting booked, Meeting done, Won, Out of office, Not interested, Unsubscribed, Bounced and Assigned to me.

## Suggested routine
1. Start in **Interested** — the replies that make money.
2. Work **Assigned to me**.
3. Sweep **Out of office** for people to re-approach.
4. Clear **Unread**.

## Important notes
Views reflect status, so a mislabelled conversation disappears from the queue it belongs in.`,
  },
  {
    slug: "inbox-missing-replies",
    title: "Replies are not showing in the inbox",
    description: "The most common cause is receiving, not the inbox.",
    category: "inbox",
    updated: UPDATED,
    popular: true,
    keywords: ["no replies", "missing replies", "not receiving", "inbox empty"],
    related: ["inbox-replies-and-threading", "spam-placement-first-checks", "mailbox-troubleshooting"],
    content: `## Problem
People are replying — or you expect them to be — but the inbox is empty.

## Possible causes
- The receiving mailbox has a setup or connection problem
- The campaign genuinely has not sent yet, or has sent very little
- Emails are landing in spam, so nobody is replying
- You are looking at a filtered view

## How to check
1. Email Accounts → open the receiving mailbox and check its status.
2. Confirm receiving is enabled for the domain.
3. Send a test to your own mailbox and reply to it.
4. Clear inbox filters and check All mail.
5. Check the campaign's sent count in analytics.

## How to fix
- Correct the MX records, re-check, and enable receiving.
- If sends are fine and replies are genuinely zero, the problem is placement or copy, not the inbox.

## When to contact support
MX correct, receiving enabled, a reply to your own test send never appears.`,
  },
];
