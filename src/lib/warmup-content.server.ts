/**
 * Warmup message content.
 *
 * Plain, ordinary mailbox conversation between two mailboxes that both belong
 * to MunchReach customers who opted into warmup. Content is varied so a mailbox
 * does not send the identical string repeatedly; it is not designed to imitate
 * any particular sender, evade filtering, or manipulate a provider.
 */

const SUBJECTS = [
  "Quick question about next week",
  "Notes from this morning",
  "Following up on the handover",
  "Draft ready for your review",
  "Scheduling the check-in",
  "Short update on the rollout",
  "Two things before Friday",
  "Recap of the call",
  "Docs are updated",
  "Availability next Tuesday",
  "Feedback on the outline",
  "Planning the next sprint",
];

const OPENERS = [
  "Hi there,",
  "Hello,",
  "Morning,",
  "Hi,",
  "Hey,",
];

const BODIES = [
  "Sharing a short update so nothing gets lost between calls. The outline is finished and I will send the longer version once the numbers are confirmed.",
  "I put together the notes from this morning. Nothing urgent in there, but it is worth a skim before the next session.",
  "The draft is ready whenever you have ten minutes. I kept it short on purpose and left the detail in the appendix.",
  "Following up on the handover items. Two of them are done and the last one is waiting on a review.",
  "Wanted to confirm timings for next week. Tuesday or Thursday both work on my side, whichever suits you better.",
  "Quick recap so we have it in writing: the scope is unchanged, the timeline moves by two days, and the budget stays as agreed.",
  "The documentation is updated with the latest changes. Let me know if anything reads unclear and I will rework that section.",
  "No action needed here, just closing the loop on the earlier thread so it does not stay open.",
];

const CLOSERS = [
  "Thanks,",
  "Best,",
  "Cheers,",
  "Appreciate it,",
  "Talk soon,",
];

const REPLIES = [
  "Thanks for sending this over — it all reads fine to me. I will come back if anything needs changing.",
  "Got it, appreciate the update. Nothing to add from my side right now.",
  "This is clear, thank you. Let us keep the same timeline then.",
  "Looks good. I will review the detail properly later today and flag anything odd.",
  "Perfect, that answers my question. Speak next week.",
  "Received, thanks. I have added it to my notes for the check-in.",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function buildWarmupMessage(fromName: string): { subject: string; body: string } {
  const subject = pick(SUBJECTS);
  const body = `${pick(OPENERS)}\n\n${pick(BODIES)}\n\n${pick(CLOSERS)}\n${fromName}`;
  return { subject, body };
}

export function buildWarmupReply(fromName: string, subject: string): { subject: string; body: string } {
  const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const body = `${pick(OPENERS)}\n\n${pick(REPLIES)}\n\n${pick(CLOSERS)}\n${fromName}`;
  return { subject: replySubject, body };
}
