# MunchReach — Supabase Migration, Phase 2 (Structure only)

Production was not modified. This bundle rebuilds the **complete MunchReach
database structure** in a new Supabase project. It contains **no data**: no rows,
no auth users, no storage objects, no secrets, no provider credentials.

## Files

| File | Purpose |
| --- | --- |
| `00_extensions.sql` | pgcrypto, uuid-ossp, pg_net, supabase_vault (correct schemas) + pg_cron |
| `01_public_schema.sql` | The whole `public` schema: 123 tables, 13 enums, 69 functions, 68 user triggers, 300 indexes, 192 foreign keys, 233 RLS policies, all GRANTs |
| `03_realtime.sql` | Re-adds the 30 realtime tables + `REPLICA IDENTITY FULL` (never part of a schema dump) |
| `02_verify.sql` | Object-count verification query |
| `04_rls_isolation_check.sql` | RLS posture checks (RLS on every table, no unconditional anon/authenticated policies, security-definer ACLs, workspace-scoped policy map) |
| `baseline.txt` | Production counts, used as the pass/fail reference |
| `apply.sh` | Applies 00 → 01 → 03, then diffs counts against `baseline.txt` |

`01_public_schema.sql` is a `pg_dump --schema-only` of production, byte-preserved
except for two safe edits: `CREATE SCHEMA public` → `IF NOT EXISTS`, and the
removal of 120 GRANT/DEFAULT-PRIVILEGE lines targeting the Lovable-infrastructure
roles `sandbox_exec` and `supabase_read_only_user`, which do not exist in a
customer-owned project. No table, column, constraint, function, trigger, index,
policy or enum was altered. The 139 historical migrations in
`supabase/migrations/` remain the audit trail; this consolidated dump is their
exact end state and is the safe thing to replay (replaying 139 files in order
reproduces intermediate states and drifts on already-fixed objects).

## Run

```bash
cd supabase/migration-phase2
./apply.sh "postgresql://postgres:<password>@db.<new-project-ref>.supabase.co:5432/postgres"
```

`pg_cron` only installs on the `postgres` database and may need enabling from the
project's Database → Extensions screen first. Run as the project's `postgres`
superuser role.

## Verification performed here

The bundle was applied end-to-end to a scratch PostgreSQL 17 instance seeded with
a Supabase-shaped prelude (roles `anon`/`authenticated`/`service_role`/`postgres`/
`supabase_admin`, `auth`/`storage`/`extensions`/`vault`/`net`/`cron` schemas,
`auth.uid()`/`auth.role()`/`auth.jwt()`, `auth.users`, `storage.objects`).
It applied with **zero errors**, then was compared against production.

Counts, OLD → NEW:

| Object | Old | New |
| --- | --- | --- |
| Tables (public) | 123 | 123 |
| Tables with RLS enabled | 123 | 123 |
| Enums | 13 | 13 |
| Functions (public) | 69 | 69 |
| Triggers — user-defined | 68 | 68 |
| Triggers — total incl. FK-internal | 822 | 822 |
| RLS policies | 233 | 233 |
| Foreign keys | 192 | 192 |
| Indexes | 300 | 300 |
| Realtime-published tables | 30 | 30 |

Beyond counts, a per-object structural diff of **4,878 signatures** — every
column (type, default, nullability), every policy (command, `USING`,
`WITH CHECK`), every index definition, every function body hash, every trigger
definition, every constraint definition, every enum label with its sort order,
and every `anon`/`authenticated`/`service_role` table privilege — produced
**0 differences**.

### Count corrections to the Phase 1 report

Phase 1 transposed three figures. The catalog-verified values are: foreign keys
**192** (not 233), indexes **300** (not 192), triggers **68 user-defined / 822
including FK-internal** (not 300). Table, function, policy and enum counts in
Phase 1 were correct.

## Not covered by this phase (by design)

Auth users and identities, storage buckets and object bytes, storage RLS
policies, `pg_cron` job definitions and their runner URLs, secrets (including
`PROVIDER_CREDENTIALS_KEY`), Google OAuth, webhooks, and all customer data.
Those are Phase 3+.
