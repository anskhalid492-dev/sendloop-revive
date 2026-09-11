# Migration History

This file is the single place that records past infrastructure migrations.
All other scripts and docs must stay free of retired project IDs, URLs, and
credentials — if a historical script needs them, pass them via environment
variables at run time.

## 2026-09 — Supabase project migration

- **What:** The app's database/auth backend was migrated from the original
  Lovable-managed Supabase project (`ciaxsdojimcupxzpbpev`) to the
  company-owned Supabase project (`rihgzkofoxcjljlbvbya`), which is hard-pinned
  in `src/integrations/supabase/config.ts`.
- **When:** Schema drift scripts applied and full verification completed on
  2026-09-11 (see `docs/FINAL-MIGRATION-VERIFICATION-2026-09-11.md` for the
  verification methodology; the retired project's ID appears only in this
  history file).
- **Result:** 100% of schema and data confirmed present in the new project;
  production (`munchreach.com`) verified functional. The old project was then
  paused by the owner.
- **File storage:** All file storage moved to Cloudflare R2 (bucket
  `munchreach-files`) in the same period — see `docs/file-storage-r2.md`.
  Supabase Storage is no longer used by the application.
- **Rollback:** None retained. The old project is paused and scheduled for
  decommission; do not repoint anything to it.
