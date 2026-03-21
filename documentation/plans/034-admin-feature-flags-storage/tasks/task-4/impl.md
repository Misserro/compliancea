# Task 4 — Storage Routing Update: Implementation Notes

## Changes Made

### `lib/storage.js` (only file modified)

**New helper functions:**

1. **`getPlatformS3Config()`** — Reads platform S3 credentials from `platform_settings` table via `getPlatformSettings()`. Decrypts `s3SecretEncrypted` using `decrypt()`. Returns same shape as `getS3Config()` or `null` if not configured.

2. **`resolveWriteBackend(orgId)`** — Three-tier dispatch chain for writes:
   - If org has own S3 credentials → `{ type: 'org_s3', config }`
   - Else if org `storage_policy === 'platform_s3'` AND platform S3 configured → `{ type: 'platform_s3', config }`
   - Else → `{ type: 'local', config: null }`

3. **`resolveReadS3Config(orgId)`** — For reads/deletes: tries org S3 first, falls back to platform S3. Returns config or `null`.

**Updated exports:**

- **`putFile()`** — Now uses `resolveWriteBackend()` instead of just `getS3Config()`. Both `org_s3` and `platform_s3` paths produce `storageBackend: 's3'` with identical key format `org-{id}/{prefix}/{filename}`.

- **`getFile()`** — Now uses `resolveReadS3Config()` instead of `getS3Config()`. Tries org S3 credentials first, falls through to platform S3. The `storageBackend` column on the document record determines S3 vs local — no re-routing based on current policy.

- **`deleteFile()`** — Same change as `getFile()`: uses `resolveReadS3Config()`.

**New imports added:** `getPlatformSettings`, `getOrgStoragePolicy` from `./db.js`.

## Files NOT Changed

- **`lib/db.js`** — Task 3 already added `getPlatformSettings()`, `getOrgStoragePolicy()`, and `storage_policy` column. No additions needed.
- **`src/lib/server-utils.ts`** — `saveUploadedFile()` calls `putFile(orgId, "documents", safeName, buffer, file.type)`. Three-tier routing is fully encapsulated in `putFile`. No changes needed.

## Design Decisions

- **S3 credential resolution for reads**: org S3 config is tried first (via `getS3Config`), then platform S3. This works because: if org has own S3 creds, those were used at write time; if org doesn't have own creds, platform S3 was used. Edge case where policy changed after upload (org had own_s3, switched to platform_s3, old creds removed) means old files in the org bucket become inaccessible until migration (Task 5).
- **Both S3 modes produce `storageBackend: 's3'`**: We don't distinguish `org_s3` vs `platform_s3` in the stored record. The credential resolution at read time handles this transparently.
- **Cross-org isolation**: Both org S3 and platform S3 use key prefix `org-{orgId}/...`. On the shared platform bucket, each org's files are namespaced. Since callers always pass the specific record's `storageKey`, cross-org access is impossible at the storage layer.
