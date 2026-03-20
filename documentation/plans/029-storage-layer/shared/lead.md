# Lead Notes — Plan 029-storage-layer

## Plan Overview

Add per-org S3-compatible storage support. Each org can configure an S3 bucket (AWS S3, Cloudflare R2, MinIO). Existing files coexist on local Railway `/data` volume — no migration. New uploads go to S3 when configured. New uploads also org-namespaced locally (closes multi-tenancy gap).

## Concurrency Decision

- 3 tasks → up to 2 concurrent task-teams
- Task 1 runs first (no dependencies)
- Tasks 2 and 3 run concurrently after Task 1 completes

## Task Dependency Graph

- Task 1: no dependencies — **foundational**
- Task 2: depends on Task 1 — storage driver needs config layer + DB schema
- Task 3: depends on Task 1 — UI needs config API; parallel with Task 2

## Key Architectural Constraints

1. **`@aws-sdk/client-s3` must be installed** by Task 1 executor (`npm install @aws-sdk/client-s3`)
2. **Credential encryption**: AES-256-GCM via Node.js built-in `crypto`, `STORAGE_ENCRYPTION_KEY` env var (32 bytes base64-encoded). Throw if env var missing.
3. **Per-org S3 config via `setOrgSetting(orgId, key, value)`** — NOT `setAppSetting` (which ignores org_id). Keys: `s3Bucket`, `s3Region`, `s3AccessKeyId`, `s3SecretEncrypted`, `s3Endpoint`
4. **`documents.path` backward compatibility** — existing files have `storage_backend = null/local` and absolute local paths. New files: `storage_backend = 'local'` with org-namespaced path OR `storage_backend = 's3'` with S3 key. Download routes must handle all three cases.
5. **`saveUploadedFile` is the single write choke point** (`src/lib/server-utils.ts:57`) — Task 2 extends this with optional `orgId` param
6. **S3 object key format**: always `org-{orgId}/{prefix}/{filename}` — cross-org access impossible
7. **`PUT /api/org/storage` tests connection before persisting** — backend-enforced; if test fails, 400 returned, nothing written to DB
8. **saveDb() BEFORE logAction()** — systemic pattern from plans 027+028

## Critical Decisions

- Coexist (not migrate): old files stay on `/data`, `storage_backend` column distinguishes
- Server-side proxy upload (not presigned URLs)
- Local files org-namespaced for new uploads: `DOCUMENTS_DIR/org-{id}/documents/`
- Test endpoint (`POST /api/org/storage/test`) uses `HeadBucketCommand`
- GDrive sync path is OUT OF SCOPE (Task 2 covers document downloads only)

## Systemic Pattern (from Task 1 review failure)

**MODULE BRIDGE REQUIRED for lib/storage-crypto.js:**
Any TypeScript file in `src/` that needs `encrypt`/`decrypt` MUST import from the bridge:
```typescript
import { encrypt, decrypt } from "@/lib/storage-crypto-imports";
```
NOT directly from `../../lib/storage-crypto.js` (forbidden by module-separation.md).

Task 1 created `src/lib/storage-crypto-imports.ts` — Task 2 executors must use this bridge.

Also: `await ensureDb()` is required as the FIRST statement in EVERY route handler.

---

## Execution Complete

**Plan:** 029-storage-layer
**Tasks:** 3 completed, 0 skipped, 0 escalated
**Wall-clock:** ~33 minutes

### Tasks Completed
- **Task 1**: lib/storage-crypto.js (AES-256-GCM encrypt/decrypt), 8 ALTER TABLE migrations (storage_backend/storage_key on documents/contract_documents/contract_invoices), GET/PUT/DELETE /api/org/storage, POST /api/org/storage/test (HeadBucketCommand), src/lib/storage-crypto-imports.ts bridge
- **Task 2**: lib/storage.js (putFile/getFile/deleteFile with local+S3 dispatch), lib/storage.d.ts, src/lib/storage-imports.ts bridge, saveUploadedFile extended with orgId, upload route updated (setDocumentStorage), document DELETE route (deleteFile), all 5 download routes updated (getFile replaces fs.readFile + traversal guard), DOC_COLUMNS updated, setDocumentStorage DB function
- **Task 3**: src/components/settings/storage-section.tsx (S3 config form, configured/not-configured states, AlertDialog remove, inline+toast errors), settings page updated with StorageSection after GDriveSection

### Files Modified (key)
- `lib/storage-crypto.js` — new AES-256-GCM util
- `lib/storage.js` — new storage driver
- `lib/storage.d.ts`, `lib/db.d.ts`, `lib/db.js` — declarations + migrations + setDocumentStorage
- `src/lib/storage-crypto-imports.ts`, `src/lib/storage-imports.ts`, `src/lib/db-imports.ts` — bridges
- `src/lib/server-utils.ts` — saveUploadedFile extended
- `src/app/api/org/storage/route.ts` + `test/route.ts` — new config API
- `src/app/api/documents/upload/route.ts` — org storage dispatch
- `src/app/api/documents/[id]/route.ts` — deleteFile on delete
- 5 download routes — getFile replaces fs.readFile
- `src/components/settings/storage-section.tsx` — new UI component
- `src/app/(app)/settings/page.tsx` — StorageSection integrated
- `package.json` — @aws-sdk/client-s3
- `tests/unit/storage-crypto.test.ts` + `tests/unit/storage-driver-unit.test.ts` + `tests/integration/storage-config-api.test.ts` + `tests/integration/storage-driver.test.ts` — 92 new tests

### Decisions Made During Execution
- Module bridge required: `src/lib/storage-crypto-imports.ts` (Task 1 review caught this)
- S3 path as documents.path: `result.localPath ?? result.storageKey ?? ""` — avoids UNIQUE constraint crash on second S3 upload (Task 2 review caught this)
- server-utils.ts may import lib/storage.js directly (bridge-layer file exception per module-separation.md)
- case_documents table NOT given storage columns (not in original plan scope; case attachment downloads are local-only for now)

### Test Results
- Per-task tests: 363/363 passed
- Final gate (full suite): **PASSED** — 363/363, 13 test files, zero regressions

### Follow-up Items
- Add module-separation bridge requirement to standards docs (PM recommendation — all 3 tasks hit this first-pass)
- Add `ensureDb()` first-statement reminder to rest-api.md (same pattern failure)
- Plan 030: next feature TBD
- case_documents storage columns could be added in a future plan if case attachment S3 support is needed

## Agents Active

- knowledge-storage-layer
- pm-storage-layer
- executor-1, reviewer-1, tester-1 (Task 1)
- executor-2, reviewer-2, tester-2 (Task 2 — after Task 1)
- executor-3, reviewer-3, tester-3 (Task 3 — after Task 1, parallel with Task 2)
