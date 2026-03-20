# Task 2 Plan: Storage Driver and All File I/O Routes

## Files to Create

### 1. `lib/storage.js` -- Storage driver (new)
- `getS3Config(orgId)` -- reads org settings, decrypts secret, returns config or null
- `getS3Client(s3Config)` -- creates S3Client instance
- `putFile(orgId, prefix, filename, buffer, contentType)` -- writes to S3 or local
- `getFile(orgId, storageBackend, storageKey, localPath)` -- reads from S3 or local
- `deleteFile(orgId, storageBackend, storageKey, localPath)` -- deletes from S3 or local
- Imports: `@aws-sdk/client-s3`, `fs`, `path`, `DOCUMENTS_DIR` from `./paths.js`, `getOrgSettings` from `./db.js`, `decrypt` from `./storage-crypto.js`

### 2. `src/lib/storage-imports.ts` -- Bridge file (new)
- Re-exports `putFile`, `getFile`, `deleteFile` from `../../lib/storage.js`

## Files to Modify

### 3. `lib/db.js` -- Add `setDocumentStorage` function + update DOC_COLUMNS
- Add `setDocumentStorage(docId, storageBackend, storageKey)` function using `run()` to UPDATE documents SET storage_backend, storage_key
- **CRITICAL**: Update `DOC_COLUMNS` constant to include `storage_backend, storage_key` so that `getDocumentById()` returns these fields (currently missing from the column list despite columns existing in table)

### 4. `lib/db.d.ts` -- Add type declaration
- `export function setDocumentStorage(...args: any[]): any;`

### 5. `src/lib/db-imports.ts` -- Add bridge export
- Add `setDocumentStorage` to the export list

### 6. `src/lib/server-utils.ts` -- Update `saveUploadedFile`
- Add optional `orgId?: number` parameter
- When `orgId` provided: call `putFile(orgId, 'documents', safeName, buffer, file.type)` via dynamic import of `../../lib/storage.js`
- Return extended shape: `{ filePath, fileName, storageBackend?, storageKey? }`
- When no `orgId`: existing local behavior (backward compatible)
- Note: server-utils.ts already imports from `../../lib/` directly (it's a bridge-layer file per module-separation.md)

### 7. `src/app/api/documents/upload/route.ts` -- Pass orgId, store storage metadata
- Pass `orgId` to `saveUploadedFile(file, destDir, orgId)`
- After `addDocument()`, call `setDocumentStorage(documentId, storageBackend, storageKey)` if returned from saveUploadedFile
- Import `setDocumentStorage` from `@/lib/db-imports`

### 8. `src/app/api/documents/[id]/route.ts` -- Delete file from storage
- Import `deleteFile` from `@/lib/storage-imports`
- Before the `deleteDocument()` call, add `await deleteFile(orgId, doc.storage_backend, doc.storage_key, doc.path)`

### 9-13. Five download routes -- Replace fs.readFile + path traversal with storage driver

Each route gets the same pattern change:
- Import `getFile` from `@/lib/storage-imports`
- Remove `import fs from "fs/promises"` and `import path from "path"`
- Remove path traversal guard (`resolvedPath.startsWith(...)`)
- Replace `fs.readFile(resolvedPath)` with `getFile(orgId, doc.storage_backend || 'local', doc.storage_key, doc.path)`
- Keep MIME type detection (use `path.extname` on doc.path/file_name for local; for S3 derive from storage_key)
- Note: `path` may still be needed for `path.extname()` and `path.basename()`

Routes:
1. `src/app/api/documents/[id]/download/route.ts`
2. `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts`
3. `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts`
4. `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts`
5. `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts`

## Key Decisions

1. **DOC_COLUMNS must be updated** -- Task 1 added the DB columns but did not update the SELECT column list. Without this, `getDocumentById()` won't return `storage_backend`/`storage_key`.
2. **Path traversal guard for local files** -- For local files, `getFile()` in storage.js calls `fs.promises.readFile(localPath)` directly. The path comes from the DB (not user input), and orgId-prefix isolation applies to new files. Legacy files keep old paths. The storage driver trusts the DB path.
3. **`saveUploadedFile` imports storage.js directly** -- `server-utils.ts` is already a bridge-layer file that imports from `../../lib/` directly, so it can import from `../../lib/storage.js` without a bridge.
4. **Download routes keep `path` import** -- still needed for `path.extname()` and `path.basename()`.
5. **Remove `fs` import from download routes** -- no longer needed since `getFile` handles all file reading.
6. **saveDb() before logAction()** -- followed in all mutation paths per systemic pattern.

## Risks

- DOC_COLUMNS update is a cross-cutting change that affects all document queries. Low risk since we're only adding columns.
- The 5 download routes are a large surface area. Each must be tested for both local and S3 backends.
- Contract documents download route has a redirect case (linked library doc) that must be preserved.
