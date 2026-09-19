# Email signatures

One signature per connected mailbox, applied as a **final composition step** at
send time. The signature is never written into a campaign template or a stored
message body, so retries, deferrals and requeues can never stack it.

## Pieces

| File | Purpose |
| --- | --- |
| `src/lib/signature-model.ts` | Pure layer: sanitizer, token resolution, HTML→text, duplicate-safe injection, `composeWithSignature` |
| `src/lib/signatures.server.ts` | Resolves the signature of the mailbox an email leaves through (60s cache) |
| `src/lib/signatures.functions.ts` | Authenticated CRUD, bulk apply, preview, signature-image upload, preview resolver |
| `src/components/settings/SignatureTab.tsx` | Settings → Email Signature |
| `src/routes/api/public/signature-image.$.ts` | Serves signature images stored privately in R2 |
| `supabase/manual/email-signatures.sql` | Additive `email_signatures` table + RLS (run manually on production) |

## Where it is applied

| Path | File |
| --- | --- |
| Campaign + follow-up sends | `src/lib/dispatch.server.ts` |
| Unified Inbox replies | `src/lib/inbox-send.server.ts` |
| Manual / composed emails | `src/lib/inbox-compose.server.ts` |
| Campaign test sends | `src/lib/campaigns.functions.ts` |
| Sequence preview | `src/components/campaign/PreviewDialog.tsx` |

Composition order is unchanged apart from the last step:
`body → campaignBodyHtml → applyEmailTracking → inject signature → sent snapshot`.
Tracking runs before injection so signature links are never rewritten.

## Placement

`{{sender_signature}}` places the signature explicitly (before a footer, for
example). The variable survives message materialisation untouched and is
resolved only at send time. Without the token the signature is appended after
the body and before an existing unsubscribe footer. If the mailbox has no
signature, or it is disabled or empty, the token is removed and the email goes
out unchanged.

## Storage and safety

- Images upload straight to R2 under `signatures/{user_id}/{workspace_id}/…`
  (2 MB, image types only) and are served through the public passthrough route.
- HTML is sanitized on save **and** on render: scripts, iframes, event handlers
  and `javascript:` links are stripped.
- Every server function checks workspace membership and that the mailbox
  belongs to that workspace; bulk apply only touches the selected mailboxes.
