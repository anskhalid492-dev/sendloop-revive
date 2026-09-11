# File storage on Cloudflare R2

All files now live in the private R2 bucket (`R2_BUCKET_NAME`, default
`munchreach-files`). The backend handles auth, metadata and jobs only — no file
bytes pass through it, apart from server-generated exports and the public media
passthrough.

## Pieces

| File | Purpose |
| --- | --- |
| `src/lib/r2.server.ts` | AWS SigV4 signing (Web Crypto), presign + server-side object helpers |
| `src/lib/files-model.ts` | Categories, key builder, limits, legacy key mapping |
| `src/lib/files.functions.ts` | Authenticated presign / confirm / download / delete / list endpoints |
| `src/lib/file-storage.ts` | Browser helpers: direct upload, signed download, CSV export |

| `supabase/manual/r2-files-table.sql` | `files` metadata table for production |

## Key structure

```
imports/{user_id}/{uuid}.csv
exports/{user_id}/{uuid}.csv
leads/{user_id}/{uuid}.csv
campaigns/{user_id}/{campaign_id}/{uuid}.csv
invoices/{user_id}/{invoice_id}.pdf
reports/{user_id}/{uuid}.pdf
tmp/{user_id}/{uuid}.tmp        <- lifecycle-deleted after 24-48h
avatars/{user_id}/{uuid}.jpg
workspace-logos/{user_id}/{uuid}.png
support/{user_id|ticket_id}/{uuid}-name.ext
media/{user_id}/{uuid}-name.ext
```

## Rules enforced server-side

- Every presign requires a valid session.
- The owner segment of the key must match the caller, unless they are platform
  admin/support, or the object is a shared asset (`media/`, `workspace-logos/`).
- 50 MB hard limit, allow-listed MIME types.
- 60 presign requests per user per minute.
- Upload URLs live 5 minutes, download URLs 5-15 minutes.
- `tmp/` rows get `expires_at` set 24h ahead.

## Migration

Completed 2026-09: all legacy bucket objects were copied into R2 under `legacy/`
prefixes and the one-time copy helper was removed. Existing `files` rows with
`legacy/` keys continue to resolve through the normal signed-download path.

## Safe to delete after verification

Once the migration reports `done: true` for every bucket and uploads/downloads
are confirmed working in the app, these legacy buckets are no longer read or
written by any code path and can be deleted manually:

- `avatars`
- `workspace-logos`
- `support-attachments`
- `blog-media`
- `review-media`

Nothing else in the codebase touches Supabase Storage.
