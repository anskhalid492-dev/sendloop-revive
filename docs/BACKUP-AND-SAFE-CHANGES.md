# Backups and safe database changes

The database plan in use has **no automatic backups and no point-in-time recovery**.
Nothing is recoverable unless a copy was taken beforehand. Two things follow from that:
take your own copies regularly, and never allow a change that can destroy rows.

---

## 1. Taking a backup (manual export)

Read-only. Safe against production. Writes one file per table, plus a `manifest.json`
with row counts so you can prove a backup is complete.

```sh
SUPABASE_URL=https://rihgzkofoxcjljlbvbya.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service role key> \
OUT_DIR=~/munchreach-backups \
bun scripts/export-backup.ts
```

Output: `~/munchreach-backups/<timestamp>/<table>.ndjson` + `manifest.json`.

One table only:

```sh
... ONLY=leads,campaigns bun scripts/export-backup.ts
```

**Where to get the key:** Supabase dashboard → Project Settings → API → `service_role`.
Never paste it into code, chat, or a committed file. Pass it on the command line only.

### When to run it

- Before any schema change, migration, or SQL you were handed to run.
- Before publishing a release that touches data handling.
- Otherwise on a fixed rhythm (daily or weekly, whatever your loss tolerance is).

### What it does and does not cover

| Covered | Not covered |
| --- | --- |
| Every row of every table exposed to the data API | Login accounts (`auth.users`) |
| Row counts per table for verification | Table structure, access rules, triggers, functions |
| | Scheduled jobs, stored secrets, files in storage |

Structure lives in `supabase/migrations/` and `supabase/manual/` in this repo, so it is
already version-controlled. Login accounts cannot be exported through this path — that
requires a paid-plan database dump. Treat account loss as the one gap this does not close.

### Verifying a backup

Open `manifest.json` and confirm:
- `failures` is empty,
- `row_total` is in the same ballpark as the previous run (a sudden drop means something
  deleted data, not that the backup failed),
- the tables that matter to you (`leads`, `campaigns`, `conversations`,
  `conversation_messages`, `sending_accounts`, `workspaces`, `profiles`) have plausible counts.

---

## 2. Restoring

```sh
# 1. Dry run — prints what it would write, touches nothing
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
DIR=~/munchreach-backups/<timestamp> \
bun scripts/import-backup.ts

# 2. Apply, one table at a time, parents before children
... DIR=... ONLY=workspaces CONFIRM=yes APPLY=1 bun scripts/import-backup.ts
... DIR=... ONLY=leads      CONFIRM=yes APPLY=1 bun scripts/import-backup.ts
```

Rules the restore script enforces: dry run unless `APPLY=1`, refuses to apply without
`CONFIRM=yes`, and only ever upserts — it never deletes or truncates. Rows that still
exist are updated in place; missing rows are re-inserted.

Order matters. Restore referenced tables first (`workspaces`, `profiles`, `plans`), then
the tables that point at them (`campaigns`, `leads`, `conversations`), then leaf tables
(`conversation_messages`, `email_events`). Restoring a child before its parent fails with
a reference error and changes nothing — safe to retry in the right order.

---

## 3. Rules for every future database change

Paste this block into any request that touches the database:

> This database has no backups and no point-in-time recovery, and holds live customer
> data. Before proposing SQL: state plainly which tables it touches and whether any
> existing row can be modified or removed. Never use `DROP TABLE`, `DROP COLUMN`,
> `TRUNCATE`, `DELETE` without a `WHERE`, `DROP SCHEMA`, or `ALTER COLUMN ... TYPE` on a
> populated column. Add columns as nullable or with a default instead of rewriting
> existing ones. Widen a `CHECK` constraint by dropping and re-adding it with the full
> allowed list, never by rewriting rows to fit. If existing rows must change, first show
> me a `SELECT` with the exact count of affected rows and wait for my go-ahead. Every new
> table in `public` gets `GRANT`s, row-level security enabled, and policies in the same
> migration. Never disable row-level security. Tell me clearly when a change is
> irreversible without a backup.

### Production is a separate database

Migration tooling here reaches the connected project only. Changes for the live site come
back as SQL for you to run in the dashboard. So the rule for those:

> Give me the exact production SQL, idempotent (`IF EXISTS` / `IF NOT EXISTS`), safe to
> run twice, with a one-line note of what each statement does and whether it can be
> undone. Do not bundle unrelated changes in one block.

### Rules for test and verification work

> Any test or verification must be scoped to explicitly named throwaway test accounts.
> Never touch the live customer base, never trigger real payment-provider or email-sending
> actions against real recipients.

---

## 4. Checklist before running handed-over SQL

1. Backup taken today, `failures` empty in the manifest.
2. Read every statement. Any `DROP`, `DELETE`, `TRUNCATE`, or `ALTER ... TYPE` → stop and ask.
3. Run the `SELECT` counts first where the change touches existing rows.
4. Run in the dashboard SQL editor, one block at a time.
5. Re-check the affected screen in the app before running the next block.
