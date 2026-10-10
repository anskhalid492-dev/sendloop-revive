# Open tracking pre-deployment review

Date: 2026-10-10 UTC. **Release verdict: FAIL — not safe to publish as prepared.** No deployment was performed.

## Scope and method

Reviewed the exact current contents of:
- `src/routes/api/public/open.ts`
- `src/lib/open-tracking.server.ts`
- `src/lib/open-tracking.ts`
- `src/lib/__tests__/open-pixel-hardening.test.ts`

The requested `src/lib/tests/open-pixel-hardening.test.ts` does not exist; the actual directory is `__tests__`.

The three implementation files had no working-tree diff when review started. This review is of their prepared current state, not a reconstructed comparison to the deployed revision. No published version comparison was performed.

Added failure-reproducing tests rather than silently changing the implementation. All persistence tests use explicitly named throwaway fixtures with database and automation IO mocked. The existing production-network blocker remained enabled. No production endpoint, worker, campaign, or mailbox was exercised.

## PASS / FAIL / NOT TESTED

| Area | Result | Evidence |
| --- | --- | --- |
| HMAC check before endpoint recording | PASS, with release caveats below | The endpoint parses and verifies before loading the recorder. Invalid signatures with encoded spaces, plus, NUL, slash, percent, zero-width characters and malformed percent sequences are rejected; endpoint tests return a GIF with zero database calls. |
| Malformed-character handling bypasses signature check | PASS: no bypass found in tested cases | Character stripping normalizes input but still runs the HMAC check on the resulting payload. A malformed valid token may normalize to its original valid token; a forged signature does not become valid. |
| Strict token grammar | FAIL | `parseOpenToken` accepts an extra unsigned `.segment` because splitting ignores trailing parts. Unknown signed kinds default to campaign. These defects do not independently remove the HMAC requirement, but malformed tokens are not strictly rejected. |
| Private signing authority | FAIL under missing-secret configuration | Signing falls back to a public publishable key, then a known literal. A test proves a token signed using that public fallback is accepted. Actual deployed private-secret configuration was NOT TESTED. |
| Conservative Google scanner detection | FAIL | Any `66.249.*.*` address without `GoogleImageProxy` is marked machine, including missing, current and outdated browser agents. IP ownership alone does not prove a scanner. |
| Gmail image proxy and old browser alone | PASS | Gmail proxy is not excluded; an old browser outside the Google range is not excluded. |
| Campaign event-insert failure | PASS | Returned insert errors produce `write_failed`; later message/engagement writes stop. |
| Conversation persistence errors | FAIL | Read errors look like unknown messages. Insert and update returned errors are ignored and can report success even when the event was not saved. |
| Campaign message update / analytics save failure | FAIL | Update and engagement-upsert returned errors are ignored. A later hit can recover a missing engagement row, but there is no durable retry here and initial failure is reported as success. |
| Sequential repeats / unique engagement identity | PASS in mocked tests | Each request creates a raw hit; sequential counts increment; the stable `open:pixel:<message>` key with ignore-duplicate upsert preserves one unique engagement row. Automation keys are stable. Real deployed indexes were NOT TESTED. |
| Concurrent repeated requests | FAIL | Read-then-write count increment loses an increment: two concurrent requests leave count 1, not 2. First-open timestamps can also race. Unique engagement stays deduplicated in the mock. |
| Campaign/workspace/message matching | PASS in mocked tests | Wrong workspace and missing message cause no writes. Campaign, lead and recipient values come from the authoritative campaign-message row, not token hints. Two campaigns remain separate. |
| Conversation campaign attribution | FAIL for unsupported signed hints | Conversation rows validate workspace/message but raw-event campaign/lead fields come from token hints without verifying a linked campaign message. Such hints can label an unlinked conversation as a campaign. This needs a signed token; it is not an independent signature bypass. |
| Warmup isolation | PASS at reviewed boundaries | A warmup-only message cannot satisfy a campaign lookup. Recorder never queries or updates warmup tables. Conversations do not mirror campaign engagement or emit campaign automation. Static inspection found no shared open-pixel injection calls in the warmup engine/delivery path. Full warmup execution was NOT TESTED and was deliberately not triggered. |
| Sensitive diagnostic logging | FAIL | Normal diagnostic messages do not explicitly print token, email or IDs, but route/recorder/mirror catch blocks log raw errors. A database-error canary test proves an address embedded in an error message reaches `console.warn`. The automation helper also logs raw errors. No guarantee of sensitive-identifier-free logs is possible. |
| Existing analytics/security regressions | PASS | All 14 unchanged regression suites passed. See test totals below. |
| Production persistence, permissions and deployed runtime | NOT TESTED | No live reads/writes, authenticated production requests or deployment were performed. Production tables/indexes, privileges, secret consistency and runtime crypto compatibility are not established by mocked tests. |

## Test results

Baseline existing coverage: **97 passed across 15 files**, before adding missing cases. The old scanner test positively asserted the overbroad Google-IP heuristic; a passing baseline therefore did not establish the requested conservative behavior.

Final expanded coverage: **129 tests: 114 passed, 15 failed; 14 files passed, 2 failed**. The failures are deliberately retained as release-blocking regression tests, not skipped or inverted to conceal defects.

The 15 failures cover:
- Extra unsigned token segment, unknown signed kind and public-key fallback (3).
- Google-IP false positives with the original outdated agent, missing agent, current agent and another outdated agent (4).
- Unverified conversation campaign hints (1).
- Concurrent raw-count lost update (1).
- Conversation read and insert errors (2).
- Campaign and conversation update errors (2).
- Unreported analytics-mirror failure and sensitive-error logging (2).

Executed with `bunx vitest run`:
`src/lib/__tests__/{open-tracking,open-pixel-hardening,open-pixel-persistence-review,click-tracking,verification-token}.test.ts` and `tests/{domain-tracking,campaign-stats,campaign-stats-range-filter,campaign-stats-events,campaign-stats-dedupe,analytics-overview-upgrade,analytics-sequence-people,analytics-subject,warmup-analytics,campaign-bulk-rls,campaign-mailbox-isolation}.test.ts`.

These test failures do not mean production data was accessed; database failure, race and logging cases use synthetic responses. Database uniqueness and RLS behavior in production remain unverified.

## Remaining risks and required remediation

1. Fail closed if no private signing secret is available. Check the deployed secret configuration without displaying values. Coordinate any secret change with old-message token compatibility; blindly rotating it could invalidate previously sent links.
2. Reject extra segments and unknown message kinds; bound and validate token grammar before decoding. Keep signature validation mandatory after any supported normalization.
3. Remove Google-IP-only exclusion. Existing inputs provide no reliable proof that a generic Google-hosted browser request is a scanner. Treat uncertainty conservatively rather than excluding a genuine human open. The broad existing Apple address-block heuristic also warrants review; ownership alone is not proof of Mail Privacy Protection. Other scanners may remain indistinguishable from readers.
4. Check every database operation result, distinguish partial persistence from complete success, and design recovery so a failed analytics mirror is not dependent on another reader request. Preserve original raw hits.
5. Address concurrency using a database-safe atomic approach. Raw requests intentionally remain repeatable; deduplicating every request would discard genuine repeat opens. Bearer pixel links can be replayed by anyone possessing them; signatures cannot prove a human opened a message.
6. Resolve conversation campaign/lead attribution through verified message relationships, not unsupported token hints.
7. Replace raw-error diagnostic logging with fixed reasons / allowlisted nonsensitive error categories, including downstream automation errors. Infrastructure access/request logs were not inspected and may capture token-bearing URLs. IP forwarding headers are currently accepted without validation; spoofed headers and nonexclusive address ranges further limit classifier reliability.
8. Verify deployed table/index availability, permission boundaries and private-secret compatibility in an explicitly scoped safe environment before release. Existing schema files are evidence of intended shape, not proof of production shape.

The 128-bit truncated HMAC is not identified as a practical cryptographic weakness here; changing token length is not needed to establish the reported failures and could break historical links.

## Changes made in this review

- Updated `src/lib/__tests__/open-pixel-hardening.test.ts` to cover malformed/encoded signatures, strict parsing, public fallback and conservative scanner expectations.
- Added `src/lib/__tests__/open-pixel-persistence-review.test.ts` for mocked persistence, duplicates/concurrency, privacy, warmup boundaries, workspace and multiple-campaign isolation, and invalid-signature endpoint execution.
- Added this report and updated `roadmap.md`.

**No tracking implementation, open-rate formula, sending code, warmup code, production data, database schema or historical open records were changed by this review. No migration, email send, background worker, publish or deployment was performed.** This statement covers this review only; it does not audit earlier changes against production history.

**Decision: keep unpublished. Fix the confirmed blockers, rerun these tests, and complete scoped deployed-configuration/database verification before requesting deployment approval.**
---

## Remediation — 2026-10-10 UTC

**Readiness: code-level PASS (1606/1606 tests, 173/173 files). Deployment readiness: FAIL until the deployment-only checks below are done.** Nothing was published.

| Blocker | Fix |
| --- | --- |
| Signing secrets | Public publishable-key and hardcoded-literal fallbacks removed. Key order kept (`OPEN_TRACKING_SECRET` → `UNSUBSCRIBE_SECRET` → `SUPABASE_SERVICE_ROLE_KEY`) so already-sent tokens keep verifying; `SB_SERVICE_ROLE_KEY` added only last, where the public key used to be. Values under 16 chars ignored. No key → signing returns empty, verification rejects, and no pixel is injected (the email still sends). Never logged. |
| Token grammar | Exact `<base64url ≤2048>.<32 lowercase hex>`; extra segments, unknown/missing kinds, non-object payloads and malformed ids rejected. HMAC always verified. |
| Attribution | Campaign opens use only the verified campaign-message row. Conversation opens no longer copy campaign/lead hints from the token (stored as null). |
| Scanner | Google-IP-only exclusion removed; such hits are kept as real opens and labelled `google_network_unverified`. Apple and Gmail-proxy rules unchanged. |
| Database failures | Every read/insert/update/upsert result is checked. Read/insert failure → `write_failed` with no further writes. Raw event saved but count or analytics mirror failed → `partial_write` (never success). Automation only emits after the analytics row exists. A later hit repairs a missing mirror via the stable ignore-duplicate key. |
| Concurrency | Open count uses compare-and-swap (`update … where open_count = <read value>`, re-read and retry up to 6 times). Historical counts are only ever added to. First-opened is set once. |
| Sensitive logs | Endpoint, recorder and automation-emit logs now print fixed stage names plus at most a bare Postgres/PostgREST code. Canary tests prove recipient addresses, tokens and secrets embedded in errors do not reach logs. |

Test-only changes: a throwaway test signing key (`tests/setup/test-signing-secrets.ts`); the persistence mock now applies update filters like the real database; one tamper test was fixed because it was a no-op whenever the real signature ended in `0`; the lead-status test mock gained the `neq` filter the real database supports (6 failures there came from the mock, not product code).

### Deployment-only checks (NOT verified)
1. Which private key variable exists in the live runtime. If none of the private names is present there, live tokens were signed with the public key and **all previously sent pixels will stop recording** after this release (that is the intended fail-closed outcome, but it is a visible change).
2. Do not add a new `OPEN_TRACKING_SECRET` without a migration plan — it would change the signing key and invalidate historical pixels.
3. Expect reported open rates to rise for Gmail/Google-hosted recipients, because Google-network hits are no longer excluded.
4. Live table permissions, `email_engagement_events.external_id` uniqueness, and `email_open_events` column shape are not verified against production.
5. Same public/literal fallback pattern still exists in click tracking (`src/lib/click-tracking.ts`) and marketing open tracking (`src/lib/marketing/engagement-tracking.ts`); left unchanged to avoid breaking live links — separate follow-up.
6. Infrastructure request logs may still record token-bearing URLs; forwarding headers are trusted as before.

---

## Read-only production configuration check — 2026-10-10 15:11 UTC

Stopped early as instructed: the original signing key could not be confirmed. No secret values were read or printed. Nothing was deployed, rotated or changed.

| Check | Result | Evidence |
| --- | --- | --- |
| Signing-key lookup order (prepared code) | PASS | `OPEN_TRACKING_SECRET` → `UNSUBSCRIBE_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` → `SB_SERVICE_ROLE_KEY`; values under 16 chars ignored; nothing else. |
| Signing-key lookup order (currently live code) | PASS (code read) | Same first three, then `VITE_SUPABASE_PUBLISHABLE_KEY` (public), then literal `munchreach-open-tracking`. |
| Key names in project secret store | PASS (names only) | `OPEN_TRACKING_SECRET`: not set. `UNSUBSCRIBE_SECRET`: not set. `SB_SERVICE_ROLE_KEY`: set. `SUPABASE_SERVICE_ROLE_KEY`: not in the user secret store. |
| Key names in the live runtime | NOT VERIFIED | The only authorized runtime inspection (Admin environment status) runs on the live site behind an admin sign-in, which I can't use. Whether the platform injects `SUPABASE_SERVICE_ROLE_KEY` into the live runtime is unknown; in the sandbox it is injected but points at the sandbox project. |
| Configured key = key that signed already-sent tokens | NOT VERIFIED (blocking) | Proving this needs either the live runtime env or a real sent token; both were ruled out. A test fixture can't prove which key the live site used. |
| Live analytics table columns / unique keys / permissions | NOT VERIFIED | Database tools here reach the sandbox project, not production. Schema files show intent, not live shape. Skipped once the key check stopped the run. |
| Missing-key handling (prepared code) | PASS (code + tests) | No private key → no pixel is added, the email still sends, every token is rejected, and only `signing_secret_missing` is logged. |
| Old pixels after deployment | NOT VERIFIED — depends on the key above | If live used `SUPABASE_SERVICE_ROLE_KEY`, old pixels keep working. If live used the public key (no private key present), the new code signs with `SB_SERVICE_ROLE_KEY` and every pixel in already-sent emails silently stops recording opens; images still load. |

### Remaining fallbacks (documented only, not changed)
- Click tracking (`src/lib/click-tracking.ts`): `CLICK_TRACKING_SECRET` → `OPEN_TRACKING_SECRET` → `UNSUBSCRIBE_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY` (public, ships in the browser bundle) → literal `munchreach-click-tracking`. If the live site has no private key, click tokens can be forged.
- Marketing open tracking (`src/lib/marketing/engagement-tracking.ts`): `OPEN_TRACKING_SECRET` → `MARKETING_UNSUBSCRIBE_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` → literal `munchreach-marketing-open`. With no private key, tokens are signed with a value that appears in the source code.

### What would resolve it
Someone signed in as an admin opens Admin → environment status on the live site and reports only whether `SUPABASE_SERVICE_ROLE_KEY` is present (yes/no). Present → old pixels compatible. Absent → old pixels stop recording opens on release; this needs an explicit decision.

## Click / marketing-open remediation (2026-10-10)

Changed: `src/lib/click-tracking.ts`, `src/lib/click-tracking.server.ts`, `src/lib/marketing/engagement-tracking.ts`, `src/lib/marketing/engagement.server.ts`, `src/routes/api/public/click.ts`, `src/routes/api/public/marketing/open.ts`; added `tests/click-marketing-tracking-hardening.test.ts`.

- Removed `VITE_SUPABASE_PUBLISHABLE_KEY` and the literals `munchreach-click-tracking` / `munchreach-marketing-open`. Only private keys (min 16 chars) are accepted, in the previous order with `SB_SERVICE_ROLE_KEY` appended last. With no key: links are left unwrapped, no marketing pixel is added, every token is rejected.
- Strict token grammar (`<base64url>.<32 hex>`), object-only payloads, known kinds only, ID/email shape checks. No expiry exists in the token format; adding one would break already-sent links, so it was not introduced.
- Click recorder checks lookup/insert/update results, attributes campaign clicks from the stored message row, verifies workspace ownership, reports partial failures. Marketing recorder throws on lookup/duplicate-check/insert errors instead of silently writing or dropping. Logs carry no token, URL, email or raw error.

Compatibility: tokens signed with a private key that is still configured under the same name precedence keep verifying (tested with a fixture key). Tokens signed by the public-key or hardcoded fallbacks are now rejected by design. Which key the live runtime actually used historically is NOT VERIFIED.

Safe migration strategy: (1) confirm in the live Admin environment page which of the listed key names exist (names only); (2) if the first-present private key is unchanged, no action; (3) if historical tokens were signed by a fallback, accept that those old links/pixels stop recording (links still redirect to the site home, pixels still render) — never restore the fallback; (4) any future dedicated key must be added as an additional verify-only key, not by replacing the current one.

Known limitation: marketing open duplicate check is read-then-write (no unique constraint); concurrent duplicate opens remain possible. Fixing needs a schema change, not made.
