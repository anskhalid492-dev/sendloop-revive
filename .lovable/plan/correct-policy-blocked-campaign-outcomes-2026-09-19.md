# Correct policy-blocked campaign outcomes

## Goal
Stop valid recipient addresses from being labelled or suppressed as bounced when the receiving server rejected the sender for policy, reputation, spam, or authentication reasons.

## Changes
- Split delivery notices into three outcomes: temporary delay, invalid-recipient bounce, and sender/policy failure.
- Treat `5.7.x`, “message blocked,” reputation, spam-policy, authentication, relay, and similar refusals as failed delivery—not recipient bounce.
- Keep true invalid-address signals such as `5.1.1`, unknown user, nonexistent mailbox, and invalid recipient as bounced.
- Route policy failures through existing failure handling without adding recipient suppression or bounce analytics.
- Add regression checks covering the exact `550 5.7.1 [CS] Message blocked` response and true invalid-address responses.
- Verify the full relevant test set and inspect the resulting status calculations.

## Live-data safety
- Do not automatically rewrite historical customer records or suppression entries.
- After the code fix is verified, report the exact 32 affected records and a safe, narrowly scoped repair option for approval.
