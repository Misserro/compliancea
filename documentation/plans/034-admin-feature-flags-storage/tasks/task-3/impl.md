# Task 3 — Implementation Notes

## Files Changed

### New files
- `src/app/api/admin/platform/storage/route.ts` — GET/PUT/DELETE for platform S3 config
- `src/app/api/admin/platform/storage/test/route.ts` — POST to test platform S3 connection
- `src/components/admin/platform-storage-config.tsx` — admin UI form for platform S3 config

### Modified files
- `lib/db.js` — added `platform_settings` table migration, `storage_policy` column on `organizations`, and 5 new DB functions
- `lib/db.d.ts` — added TypeScript declarations for new DB functions (and Task 1's missing ones)
- `src/lib/db-imports.ts` — re-exported new DB functions
- `src/app/(admin)/admin/page.tsx` — added PlatformStorageConfig component above org list; passes `storagePolicy` to org list
- `src/app/api/admin/orgs/[id]/route.ts` — PATCH handler accepts `storage_policy` with enum validation
- `src/components/admin/admin-org-list.tsx` — added Storage column with policy dropdown per org; added `storagePolicy` to Org interface
- `src/components/settings/storage-section.tsx` — read-only info card when `storagePolicy === 'platform_s3'`
- `src/app/api/org/storage/route.ts` — GET response now includes `storagePolicy` field

## Key Decisions

1. **`getPlatformSettings()` returns raw key-value rows** — Task 4 should call it and build the decrypted config object using `decrypt()` from storage-crypto. This keeps the DB layer simple and consistent with `getOrgSettings()`.

2. **Storage policy fetched via `/api/org/storage` GET** — the settings page is a client component, so StorageSection fetches the policy from the existing storage endpoint (extended to include `storagePolicy`). No new endpoint needed.

3. **`storage_policy` in PATCH handler** — handled separately from the `name`/`slug` generic string loop per reviewer feedback. Uses `updateOrgStoragePolicy()` directly with enum validation.

4. **`saveDb()` called explicitly** in all API routes after mutations — `run()` does NOT auto-save.

5. **`db.d.ts` updated** — also added Task 1's missing `getOrgFeatures` and `setOrgFeature` declarations that were causing TS errors.

## DB Section Label
All Task 3 additions in `lib/db.js` are under `// ── Platform S3 & Storage Policy (Plan 034 Task 3) ──` sections (both migration and functions).
