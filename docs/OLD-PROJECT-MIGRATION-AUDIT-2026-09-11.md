# Old → New backend audit (2026-09-11)

OLD: `ciaxsdojimcupxzpbpev` (Lovable-managed, untouched — read-only access used)
NEW / live: `rihgzkofoxcjljlbvbya` (what munchreach.com uses)

Access used: direct SQL (read-only) on OLD; service-role REST + Auth Admin API on NEW.
Nothing in OLD was modified. Nothing was written to NEW yet.

## Step 1–2 results

### Tables
- OLD public tables: 154. All 142 tables exposed on NEW exist in OLD too (no NEW-only tables).
- **12 tables exist in OLD but NOT in NEW** (verified individually, PGRST205 "table not found"):
  `admin_permission_grants`, `admin_security_events`, `admin_sessions`, `admin_rate_limits`,
  `api_keys`, `api_rate_counters`, `api_idempotency_keys`, `api_jobs`,
  `webhook_endpoints`, `webhook_deliveries`, `campaign_unsubscribes`, `sending_domain_tracking`.
  These back the admin-session/audit, public API-key, outbound-webhook, unsubscribe and
  domain-tracking features — those features are currently broken in production.

### Columns
6 columns exist in OLD but not NEW:
`campaigns.paused_at`, `campaigns.pause_reason`, `sending_accounts.paused_at`,
`sending_accounts.pause_reason`, `campaign_messages.message_id`,
`notification_preferences.positive_reply_notifications`.

### Auth users
OLD 33 users, NEW 40. **All 33 OLD user IDs exist in NEW** with identical UUIDs. No gap.

### Storage
OLD storage had exactly 2 objects (1 avatar, 1 support screenshot). Both verified present in
Cloudflare R2 under `legacy/avatars/...` and `legacy/support-attachments/...`. All 5 old buckets
otherwise empty. No further storage migration needed.

### Data spot-check (values, not counts)
- profiles: 5/5 identical
- workspace_members: 5/5 identical
- workspaces: 4/5 identical (1 row differs on `updated_at` + `checklist_dismissed` — NEW is newer)
- campaigns: 3/5 identical, 2 OLD-only rows
- leads: 5/5 OLD rows absent from NEW

### Rows present in OLD but absent from NEW
NEW is far larger overall (76 tables have more rows than OLD) — it is the live dataset.
The OLD-only rows are pre-cutover development/test records:

| Table | old | new | old-only rows |
|---|---|---|---|
| warmup_recipients | 3488 | 914 | 3488 |
| inbound_event_actions | 1662 | 218 | 1661 |
| email_events | 657 | 6905 | 646 |
| warmup_health | 247 | 5390 | 166 |
| warmup_events | 124 | 394 | 99 |
| outbound_messages | 50 | 7375 | 39 |
| campaign_recipients | 49 | 4000 | 49 |
| leads | 33 | 4163 | 33 |
| campaign_messages | 28 | 4000 | 28 |
| provider_health_events | 184 | 10033 | 32 |
| provider_routing_events | 179 | 5162 | 31 |
| usage_audit_log | 43 | 47098 | 25 |
| sending_account_checks | 41 | 145 | 24 |
| lead_retention_runs | 21 | 4 | 20 |
| billing_audit_log | 22 | 91 | 14 |
| lead_activities | 13 | 52 | 13 |
| site_pages | 45 | 44 | 12 |
| warmup_jobs | 49 | 130 | 37 |
| crm_stages | 126 | 162 | 6 |
| billing_plan_prices | 6 | 14 | 6 |
| campaign_steps | 5 | 8 | 4 |
| warmup_daily_stats | 6 | 26 | 4 |
| campaigns | 12 | 12 | 3 |
| conversation_events | 23 | 112 | 3 |
| leads/lead_lists/conversations/conversation_messages/inbound_routes/others | — | — | 1–2 each |
| plans | 5 | 5 | 1 |
| admin_security_events / admin_sessions / admin_rate_limits | 13 / 5 / 1 | — | table missing |

Composite-key tables not machine-comparable: `billing_provider_secrets` (1/1),
`workspace_usage_counters` (10/43).

## Step 3 — what is prepared

`supabase/manual/prod-drift-2026-09-11.sql` — additive-only script generated from OLD:
the 12 missing tables (columns, constraints, indexes), the 6 missing columns, supporting
functions, grants, RLS enable + policies. No drops, no deletes.

**It must be run manually in the live project's SQL editor** — automated migration tooling in
this workspace only reaches the OLD project, and no SQL/DDL channel exists to the live project
from here (service-role REST cannot execute DDL).

## Step 5 — blocked

Repointing this workspace's built-in Cloud binding from OLD to the live project is **not
possible from my side**. Per your instruction: stopping here. Do not delete or disable the old
project — pausing it would also remove this workspace's backend tooling fallback.
