# Task 5 — Async Data Migration Job: Implementation Plan

## Summary

Build the full data migration pipeline: `migration_jobs` DB table + functions, async background worker, admin trigger/status APIs, and admin panel UI with progress display.

## File Changes

### 1. `lib/db.js` — Migration Jobs table + DB functions

**Migration (in `initDb`):**
```sql
CREATE TABLE IF NOT EXISTS migration_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | running | completed | failed
  total_files INTEGER DEFAULT 0,
  migrated_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**New DB functions:**
- `createMigrationJob()` — INSERT with status='pending', returns lastInsertRowId
- `updateMigrationJob(id, patch)` — UPDATE specific fields (status, total_files, migrated_files, failed_files, error, started_at, completed_at). Build SET clause dynamically from patch keys, using snake_case column mapping.
- `getLatestMigrationJob()` — `SELECT * FROM migration_jobs ORDER BY created_at DESC LIMIT 1`

### 2. `src/lib/migration-worker.ts` — Async migration logic

**Core function:** `runMigration(jobId: number): Promise<void>`

**Algorithm:**
1. Query all files needing migration from 3 tables:
   - `documents` WHERE `storage_backend = 'local'` — columns: `id, path, org_id` (path = local file path)
   - `contract_documents` WHERE `storage_backend = 'local'` — columns: `id, file_path, contract_id` (need to JOIN with documents to get org_id via contract's parent doc)
   - `contract_invoices` WHERE `invoice_storage_backend = 'local'` OR `payment_storage_backend = 'local'` — columns: `id, invoice_file_path, payment_confirmation_path, contract_id` (same org resolution)
2. Count total files, update job: `{ status: 'running', total_files: count, started_at: now }`
3. For each file:
   a. Read file from local path using `fs.readFile()`
   b. Determine org_id (from document record or via contract parent)
   c. Call `putFile(orgId, prefix, filename, buffer, contentType)` — this automatically routes to the correct S3 backend based on org policy
   d. If `putFile` returns `storageBackend: 's3'`: update the DB record's `storage_backend` and `storage_key` columns; increment `migrated_files`
   e. If `putFile` returns `storageBackend: 'local'` (no S3 configured for this org): skip — increment `failed_files` with note "no S3 configured"
   f. On error: increment `failed_files`, log error, continue
   g. After each file: `updateMigrationJob(jobId, { migrated_files, failed_files })`
4. On completion: `updateMigrationJob(jobId, { status: 'completed', completed_at: now })`
5. On catastrophic error: `updateMigrationJob(jobId, { status: 'failed', error: message, completed_at: now })`

**Table-specific details:**
- `documents`: path column = `path`, update `storage_backend` + `storage_key` via `setDocumentStorage(id, backend, key)`
- `contract_documents`: path column = `file_path`, update `storage_backend` + `storage_key` via direct SQL
- `contract_invoices`: TWO file columns — `invoice_file_path`/`invoice_storage_backend`/`invoice_storage_key` and `payment_confirmation_path`/`payment_storage_backend`/`payment_storage_key`. Each counts as a separate file in the total.

**Org resolution for contract_documents / contract_invoices:**
Both reference `contract_id` which is a foreign key to `documents.id`. The parent document's `org_id` is the org for the contract attachment/invoice. Query: `SELECT d.org_id FROM documents d WHERE d.id = ?` using the `contract_id`.

**Prefix mapping:**
- `documents` → prefix `"documents"`
- `contract_documents` → prefix `"contract-attachments"`
- `contract_invoices` invoice → prefix `"invoices"`
- `contract_invoices` payment → prefix `"payment-confirmations"`

### 3. `src/app/api/admin/migrations/storage/route.ts` — POST trigger

- Protected by `requireSuperAdmin`
- Check `getLatestMigrationJob()` — if status is `'running'` or `'pending'`, return 409 Conflict with `{ error: "Migration already in progress" }`
- Create job: `createMigrationJob()`
- Kick off worker: `setImmediate(() => runMigration(jobId).catch(console.error))`
- Return `{ jobId }`
- Call `saveDb()` after creating the job row

### 4. `src/app/api/admin/migrations/storage/status/route.ts` — GET poll

- Protected by `requireSuperAdmin`
- `getLatestMigrationJob()` → return job object or `{ status: 'none' }` if no jobs exist
- Response: `{ status, total, migrated, failed, error, startedAt, completedAt }`

### 5. `src/components/admin/storage-migration.tsx` — Admin UI

**Component:** `StorageMigration`

**States:**
- `idle` — show "Migrate Data to S3" button
- `running` — show progress bar, counts ("X of Y migrated, Z failed"), polls every 2s
- `completed` — summary card with counts, "Migration Complete" badge
- `failed` — error display
- `no_s3` — button disabled with tooltip "No S3 storage configured"

**Logic:**
- On mount: fetch `/api/admin/migrations/storage/status` to check for existing/running job
- Also fetch `/api/admin/platform/storage` to check if any S3 is configured
- Button click: POST to `/api/admin/migrations/storage`, start polling
- Polling: `setInterval` every 2000ms while status is `running` or `pending`
- Stop polling when status is `completed` or `failed`

### 6. `src/app/(admin)/admin/page.tsx` — Integration

Add `<StorageMigration />` component between `<PlatformStorageConfig />` and the Organizations section.

### 7. Type declarations

- `lib/db.d.ts` — add `createMigrationJob`, `updateMigrationJob`, `getLatestMigrationJob`
- `src/lib/db-imports.ts` — re-export the 3 new functions

## Key Design Decisions

1. **`putFile` handles routing** — we don't manually determine S3 credentials. We call `putFile(orgId, prefix, filename, buffer)` and it routes based on org policy. If an org has no S3 configured (policy=local, no platform S3), putFile returns `storageBackend: 'local'` — we count this as "skipped" not "failed".

2. **Per-file progress** — `updateMigrationJob` called after every single file to enable real-time 2s polling.

3. **Non-destructive** — local files never deleted. Only DB `storage_backend` and `storage_key` columns updated.

4. **Contract files → org via parent doc** — `contract_documents.contract_id` and `contract_invoices.contract_id` both FK to `documents.id`, which has `org_id`.

5. **`saveDb()` after each file** — since this is sql.js (in-memory with file persistence), we need to call `saveDb()` periodically so progress survives a crash. Call it after each batch of N files or after each file if count is small.

6. **`setImmediate` for async kick-off** — the API route creates the job row, saves DB, then kicks off the worker asynchronously. The route returns immediately with the jobId.
