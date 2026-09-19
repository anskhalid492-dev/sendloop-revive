# Mailbox authentication checks for customer-connected mailboxes

Customers connect their own mailboxes (IMAP/SMTP). We never host their domain, so
the job is: independently check what their domain publishes, tell them exactly
where to fix it, keep re-checking, and never push a mailbox past what their own
mail provider tolerates.

Good news on reuse: most of the machinery already exists and works.

- Independent DNS reads over public resolvers (Google + Cloudflare, cache-busted,
  with a "couldn't check" state that never reports a false failure) — already
  built and used for sending domains.
- Provider DNS-requirement handling, MX comparison, de-duplication, readiness
  vocabulary and customer-safe copy — already built.
- A daily re-check job pattern (`recheck-domains`) and a mailbox poller job.
- Per-mailbox daily/hourly caps with warmup sitting under campaigns, pause
  reasons, and a health score field.

What's missing is the piece specific to this model: a check keyed to a *mailbox's
own domain* (not a domain we provisioned), with selector discovery, host
detection, per-host volume ceilings, and the customer-facing status.

## What gets built

### 1. Mailbox domain authentication check (new, pure + server)

New `src/lib/mailbox-auth-check.ts` (pure scoring/parsing, fully testable) and
`src/lib/mailbox-auth-check.server.ts` (the lookups, reusing the existing
resolver layer):

- **SPF** — read root TXT; pass only on exactly one `v=spf1` record; report
  multiple SPF records, missing record, `+all`, and whether a lookup-heavy record
  is likely over the 10-lookup limit.
- **DKIM** — probe a selector list in parallel (`default`, `google`, `selector1`,
  `selector2`, `k1`, `k2`, `s1`, `s2`, `mail`, `dkim`, `zoho`, `hostingermail-a/b/c`,
  `titan1`, `smtp`, `mandrill`, plus the host-specific ones implied by the
  detected MX). Pass when any selector returns a usable key; record which
  selector matched. Not found ≠ "no DKIM" — it's reported as "not detectable",
  because selectors can be private.
- **DMARC** — `_dmarc` TXT; pass on exactly one valid record; flag duplicates,
  syntax errors, missing `v=DMARC1`, and report the policy (`none`/`quarantine`/
  `reject`) as information rather than a failure.
- **Host detection** — root MX, mapped to Google Workspace, Microsoft 365,
  Hostinger, GoDaddy/Secureserver, Zoho, Titan/Namecheap, Yahoo, Proton, Zimbra,
  or "custom", plus free-mailbox detection (gmail.com, outlook.com, …).
- One overall verdict: `pass` / `warn` / `fail` / `unchecked`, with per-record
  reasons in plain language. A resolver outage is always `unchecked`, never
  `fail`.

### 2. Provider-specific fix instructions

New `src/lib/mailbox-auth-guides.ts`: for each detected host, the exact place to
add records (Google Admin → Apps → Gmail → Authenticate email; Microsoft 365
Admin → Settings → Domains → DNS records; Hostinger hPanel → Domains → DNS Zone
→ Manage; GoDaddy Domain Portfolio → DNS; Zoho Mail Admin → Domains →
Authentication), the record they need, and the DNS-host caveat (records live
wherever DNS is hosted, not necessarily the mail host). Free-mailbox addresses
get the honest answer: you cannot publish records for gmail.com — use a domain
mailbox for cold outreach.

### 3. Status shown at connect time, before the mailbox can send

`saveMailboxConnection` runs the check straight after the SMTP/IMAP test, stores
the result, and returns it. The connect screen then shows a pass/fail row per
record with the host-specific fix steps and a "Re-check" button.

Gating: a mailbox whose domain fails authentication is saved as connected but
held out of campaign sending (existing pause/eligibility state, with a clear
reason). SPF or DKIM failing = held. DMARC missing = warning only, still allowed.
Customers can override a DMARC warning; they cannot override a hard SPF/DKIM
failure into a campaign silently.

### 4. Periodic re-checks

A new daily runner (same shared-secret pattern as the existing cron routes),
oldest-checked-first, bounded batch, one domain checked once even when several
mailboxes share it. Plus a cheap pre-send guard: if a mailbox's stored check is
older than ~24h it re-checks before the run starts. A domain that breaks after
connection pauses those mailboxes with a specific reason and raises the existing
Action Center alert — instead of a campaign quietly mass-failing.

### 5. Per-host safe sending ceilings

New `src/lib/mailbox-provider-limits.ts` mapping detected host → conservative
daily ceiling and warmup ramp cap (personal Gmail well below Google Workspace,
Microsoft 365 below Workspace, generic shared hosting lower still). This feeds
the *existing* capacity layer as an additional ceiling, so:
- the effective daily limit is the lower of the customer's setting and the host
  ceiling, and
- warmup's ramp target is capped the same way (the ramp already accepts a
  capacity ceiling with a reason, so this slots in without touching the stage
  machine).

No existing limit is raised. Campaign scheduler, warmup stage rules and
reservation priorities stay as they are.

### 6. Health indicator per mailbox

One shared helper turns (auth verdict + connection state + pause/bounce state +
capacity) into green / yellow / red with a one-line reason, used in the mailbox
list, the sending page and the dashboard card, so the same mailbox never shows
two different colours. Red/yellow rows link straight to the fix steps.

## Existing mailboxes — yes, retroactively

Nothing about this depends on having been present at connect time: the check only
needs the email address. On first deploy the daily runner walks every already-
connected mailbox (grouped by domain, oldest first) and fills in status, so all
current mailboxes get a verdict within the first day without anyone reconnecting.
Existing mailboxes are **not** auto-paused by that first sweep — the first pass
reports only, and blocking applies from the next check onward, so no live
campaign is interrupted by a backfill.

## Technical notes

- Additive SQL only, re-runnable: auth columns on `mailboxes`
  (`auth_status`, `spf_status`, `dkim_status`, `dkim_selector_found`,
  `dmarc_status`, `dmarc_policy`, `mail_host`, `auth_detail` jsonb,
  `auth_checked_at`, `provider_daily_ceiling`), plus an index on
  `auth_checked_at`. No column is dropped or repurposed.
- Reuses `resolve`/`resolveAll` in `src/lib/dns.server.ts`; `TransientDnsError`
  keeps a resolver outage out of the failure path.
- Pure modules (parsing, verdict, guides, limits, health colour) get unit tests:
  single vs duplicate SPF, `+all`, no SPF, each DKIM selector outcome, duplicate/
  invalid DMARC, each MX→host mapping, free-mailbox case, resolver outage stays
  `unchecked`, ceiling never raises a limit, first-sweep does not pause.
- Untouched: campaign scheduler and sending limits, warmup ramp/safety logic,
  bounce classification, mailbox synchronisation, campaign analytics.

## Effort

Roughly: checker + guides ~1 build pass, connect-time UI and gating ~1, cron +
pre-send guard ~1, per-host ceilings + health indicator ~1. The DNS transport,
resolver-disagreement handling and capacity layer are already done, which is the
part that usually takes longest.
