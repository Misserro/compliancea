# Task 3 — Platform S3 Config and Per-Org Storage Policy

## Implementation Plan

### 1. Database Layer (`lib/db.js`)

**Migrations (in `initDb()`):**
- Add `platform_settings` table: `key TEXT PK`, `value TEXT`, `updated_at DATETIME`
- Add `storage_policy` column to `organizations`: `TEXT DEFAULT 'local'` (values: `'local'` | `'platform_s3'` | `'own_s3'`)
- Both use `try/catch` pattern for ALTER TABLE (same as existing migrations)

**New DB functions (clearly labeled section at bottom):**
- `getPlatformSettings()` — returns all rows from `platform_settings`; decrypts `s3SecretEncrypted` value before returning so Task 4 gets ready-to-use credentials
- `setPlatformSetting(key, value)` — upsert into `platform_settings`
- `deletePlatformSettings()` — delete all rows from `platform_settings`
- `updateOrgStoragePolicy(orgId, policy)` — update `organizations.storage_policy` for given org
- `getOrgStoragePolicy(orgId)` — return `storage_policy` for given org (useful for Task 4)

### 2. Platform Storage API (`src/app/api/admin/platform/storage/route.ts`)

**GET** — returns current platform S3 config (masked secret) or `{ configured: false }`
**PUT** — validates required fields (bucket, region, accessKeyId, secretKey), encrypts secret with `encrypt()` from storage-crypto, persists all keys via `setPlatformSetting()`, calls `saveDb()`
**DELETE** — calls `deletePlatformSettings()`, calls `saveDb()`

All three protected by `requireSuperAdmin()`.

### 3. Platform Storage Test API (`src/app/api/admin/platform/storage/test/route.ts`)

**POST** — accepts S3 credentials in body, creates `S3Client`, calls `HeadBucketCommand` to test connectivity. Returns `{ success: true }` or `{ success: false, error: "..." }`. Protected by `requireSuperAdmin()`.

Pattern mirrors existing `src/app/api/org/storage/test/route.ts`.

### 4. Platform Storage Config Component (`src/components/admin/platform-storage-config.tsx`)

Form component with fields: bucket, region, accessKeyId, secretKey, endpoint (optional).
Two action buttons: "Test Connection" and "Save".
- Test calls POST `/api/admin/platform/storage/test`
- Save calls PUT `/api/admin/platform/storage`
- Shows configured state with masked secret and Edit/Remove buttons
- Pattern mirrors existing `StorageSection` component

### 5. Admin Page Update (`src/app/(admin)/admin/page.tsx`)

Add "Platform Storage" section above the Organizations section. Imports and renders `PlatformStorageConfig` component.

### 6. Admin Org List Update (`src/components/admin/admin-org-list.tsx`)

- Add `storagePolicy` to `Org` interface
- Add "Storage" column header
- Add storage policy `<select>` dropdown per org row with options: Local, Platform S3, Own S3
- On change, calls `PATCH /api/admin/orgs/{id}` with `{ storage_policy: value }`

### 7. Admin Org PATCH Route Update (`src/app/api/admin/orgs/[id]/route.ts`)

- Add `storage_policy` to allowed fields in PATCH handler
- Validate value is one of `'local'`, `'platform_s3'`, `'own_s3'`
- Persist via `updateOrgStoragePolicy(orgId, policy)` (or direct SQL)

### 8. Org Settings Storage Section Update (`src/components/settings/storage-section.tsx`)

- Accept new prop `storagePolicy` (or fetch it)
- If `storagePolicy === 'platform_s3'`: render read-only info card saying storage is managed by platform admin, hide the S3 config form
- If `storagePolicy === 'own_s3'` or `'local'`: show existing form as-is

### DB Imports Update (`src/lib/db-imports.ts`)

Add exports for all new DB functions: `getPlatformSettings`, `setPlatformSetting`, `deletePlatformSettings`, `updateOrgStoragePolicy`, `getOrgStoragePolicy`

## Conflict Awareness

- Task 1 adds `org_features` table and related functions to `lib/db.js` — our additions go in a clearly labeled `// ── Platform S3 & Storage Policy (Plan 034 Task 3) ──` section
- Task 5 adds `migration_jobs` table — no overlap
- Admin page (`page.tsx`) may be modified by Task 2 — our section is at the top (Platform Storage), theirs adds per-org features

## File Change Order

1. `lib/db.js` (migrations + functions)
2. `src/lib/db-imports.ts` (re-exports)
3. `src/app/api/admin/platform/storage/route.ts` (new)
4. `src/app/api/admin/platform/storage/test/route.ts` (new)
5. `src/components/admin/platform-storage-config.tsx` (new)
6. `src/app/(admin)/admin/page.tsx` (modify)
7. `src/app/api/admin/orgs/[id]/route.ts` (modify)
8. `src/components/admin/admin-org-list.tsx` (modify)
9. `src/components/settings/storage-section.tsx` (modify)
