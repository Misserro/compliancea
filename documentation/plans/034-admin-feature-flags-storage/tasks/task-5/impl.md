# Task 5 — Async Data Migration Job: Implementation Notes

## Files Changed

### New files
- `src/lib/migration-worker.ts` — async migration logic with per-file progress tracking
- `src/app/api/admin/migrations/storage/route.ts` — POST to trigger migration job
- `src/app/api/admin/migrations/storage/status/route.ts` — GET to poll migration status
- `src/components/admin/storage-migration.tsx` — admin panel UI with progress bar and status display

### Modified files
- `lib/db.js` — added `migration_jobs` table migration + 3 new DB functions (`createMigrationJob`, `updateMigrationJob`, `getLatestMigrationJob`)
- `lib/db.d.ts` — added TypeScript declarations for the 3 new DB functions
- `src/lib/db-imports.ts` — re-exported the 3 new DB functions
- `src/app/(admin)/admin/page.tsx` — added `StorageMigration` component between PlatformStorageConfig and Organizations sections

## Key Design Decisions

1. **`putFile()` handles all routing** — migration worker calls `putFile(orgId, prefix, filename, buffer)` and uses the returned `{ storageBackend, storageKey }`. No manual S3 credential resolution.

2. **Three-category tracking** — files are counted as `migrated` (uploaded to S3), `failed` (error), or `skipped` (no S3 configured for org). This gives admins clear visibility into why files weren't migrated.

3. **Org resolution for contract tables** — `contract_documents` and `contract_invoices` both have `contract_id` FK to `documents.id`. The parent document's `org_id` determines which org's storage policy to use. Resolved via JOIN in the collection query.

4. **Invoice table has TWO file columns** — `invoice_file_path`/`invoice_storage_backend`/`invoice_storage_key` and `payment_confirmation_path`/`payment_storage_backend`/`payment_storage_key`. Each file counts separately in totals.

5. **Per-file `saveDb()`** — since sql.js is in-memory with file persistence, `saveDb()` is called after each file to ensure progress survives a crash.

6. **`setImmediate()` for async kick-off** — API route creates the job row, saves DB, returns `{ jobId }` immediately. Worker runs in background via `setImmediate`.

7. **Re-runnable** — completed/failed migrations don't block re-running. Only `running`/`pending` status blocks. Re-running will pick up files still on `storage_backend = 'local'`, including previously failed ones.

## DB Section Label
All Task 5 additions in `lib/db.js` are under `// ── Migration Jobs (Plan 034 Task 5) ──` sections.

## Column Mapping

| Table | Local path column | Backend column | Key column |
|-------|------------------|----------------|------------|
| `documents` | `path` | `storage_backend` | `storage_key` |
| `contract_documents` | `file_path` | `storage_backend` | `storage_key` |
| `contract_invoices` (invoice) | `invoice_file_path` | `invoice_storage_backend` | `invoice_storage_key` |
| `contract_invoices` (payment) | `payment_confirmation_path` | `payment_storage_backend` | `payment_storage_key` |

## Migration Worker Prefix Mapping

| Table | S3 prefix |
|-------|-----------|
| `documents` | `documents` |
| `contract_documents` | `contract-attachments` |
| `contract_invoices` (invoice) | `invoices` |
| `contract_invoices` (payment) | `payment-confirmations` |
