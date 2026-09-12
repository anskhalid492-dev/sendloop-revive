# Fix inbound Resend attachment failures

## Diagnosis

The live inbound endpoint records each verified Resend event before processing it. Its shared parser currently passes Resend attachment objects through unchanged, while the validator requires `attachments[].name`. Resend supplied `attachments[].filename` in every affected payload, so validation rejected the entire email with `attachments[0].name` missing.

Emails with no attachments already normalize to an empty array and process normally. The defect affects emails containing Resend-shaped attachments, including otherwise valid replies.

The live database contains **24 failed inbound Resend events caused by this exact validation error**, from September 8–12, 2026. All 24 retain their original payloads and provider event IDs. Twenty-three have never been retried and one has one prior attempt. None has reached the five-attempt ceiling, so they are recoverable after the parser is fixed.

## Implementation

1. Normalize every inbound attachment before validation:
   - Accept `name`, Resend's `filename`, and common capitalization variants.
   - Trim the value and cap it at the existing 300-character limit.
   - If no usable filename exists, generate a stable fallback such as `attachment-1`, preserving a safe extension when one can be inferred from the content type.
   - Preserve supported URL and size fields.
   - Keep absent or empty attachment arrays as `[]`.

2. Keep email processing resilient:
   - A malformed or missing attachment filename must never reject the email body, sender, threading, or reply.
   - Retain the existing 20-attachment safety limit and other inbound validation limits.
   - Use the same normalization path for live webhook delivery and stored-event retries.

3. Add focused automated tests for:
   - No attachments.
   - One normally named attachment.
   - One Resend attachment using `filename`.
   - One attachment with a missing or blank filename, confirming the generated fallback.
   - The full inbound event remaining processable in every case.

4. Verify locally:
   - Run the focused inbound tests.
   - Run the TypeScript check.
   - Confirm no unrelated behavior changed.

5. Publish and recover affected replies:
   - Publish the fix to `munchreach.com`.
   - Reprocess only the 24 stored events matching this exact attachment-name validation failure.
   - Verify each leaves `failed` status and is either processed successfully or reports a separate genuine routing problem.
   - Confirm inbox messages are not duplicated through the existing event idempotency checks.

6. Post-publish monitoring:
   - Query production for any new `attachments[].name` failures after deployment.
   - Check production logs and the inbound admin event feed.
   - Report the recovered count, any independently failing events, and whether new occurrences remain at zero.

## Scope

Only inbound attachment normalization, its tests, publishing, targeted replay, and verification will change. No other email, security, page, or database behavior will be modified.
