# Plan 029: Storage Layer

> Execute: /uc:plan-execution 029

## Objective

Add per-org S3-compatible storage support to ComplianceA. Each organization can configure their own S3 bucket (AWS S3, Cloudflare R2, MinIO) as a file storage backend. Existing files stay on the Railway `/data` volume (coexist approach — no migration). New uploads go to S3 when configured. All file I/O is routed through a storage driver abstraction. As a prerequisite, local files are moved to org-namespaced paths (`DOCUMENTS_DIR/org-{id}/...`) to close the multi-tenancy gap where all orgs currently share one flat directory.

## Context

- [Architecture Overview](../../technology/architecture/overview.md)
- [Tech Stack](../../technology/architecture/tech-stack.md) — `@aws-sdk/client-s3` added
- [Database Schema](../../technology/architecture/database-schema.md) — `storage_backend`, `storage_key` columns added
- [Security Standard](../../technology/standards/security.md) — download security model
- [Database Standard](../../technology/standards/database.md) — migration pattern
- [Plan 027 — Org Foundation](../027-org-foundation/) — org context in session + DB
- [Plan 028 — Invite Flow](../028-org-member-invite-flow/) — prerequisite

## Tech Stack

- **`@aws-sdk/client-s3`** — S3-compatible object storage client (AWS S3, Cloudflare R2, MinIO via custom endpoint)
- **Node.js `crypto` (built-in)** — AES-256-GCM for credential encryption at rest
- **sql.js** — `ALTER TABLE ADD COLUMN` migration for `storage_backend`, `storage_key`
- **Next.js App Router** — new `/api/org/storage` routes
- **React / Shadcn UI** — S3 config form on settings page

## Scope

### In Scope
- `lib/storage-crypto.js` — AES-256-GCM encrypt/decrypt using `STORAGE_ENCRYPTION_KEY` env var
- `lib/storage.js` — storage driver: `putFile(orgId, prefix, filename, buffer)` / `getFile(orgId, storageBackend, storageKey, localPath)` / `deleteFile(orgId, storageBackend, storageKey, localPath)` — dispatches to local or S3 based on org config
- `documents` table: `storage_backend TEXT DEFAULT 'local'` and `storage_key TEXT` columns via ALTER TABLE migration
- Same columns on `contract_documents.file_path` disambiguation and `contract_invoices` invoice/payment paths
- New per-org local path layout: `DOCUMENTS_DIR/org-{id}/documents/`, `DOCUMENTS_DIR/org-{id}/invoices/`, etc. — new uploads use org-namespaced paths; existing files keep old paths (coexist)
- `GET /api/org/storage` — return current S3 config (with secret masked)
- `PUT /api/org/storage` — save S3 config (encrypt secret, test connection before persisting)
- `POST /api/org/storage/test` — test bucket access without saving
- `DELETE /api/org/storage` — remove S3 config (revert to local)
- Update `saveUploadedFile` in `src/lib/server-utils.ts` to accept `orgId` and call storage driver
- Update document upload route to pass `orgId` and store `storage_backend` + `storage_key` on the DB row
- Update all download routes to check `storage_backend` and stream from S3 or local fs accordingly:
  - `src/app/api/documents/[id]/download/route.ts`
  - `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts`
  - `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts`
  - `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts`
  - `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts`
- S3 config section in `src/app/(app)/settings/page.tsx`: bucket, region, access key ID, secret key (masked), endpoint (optional), test button, save/delete

### Out of Scope
- Migration of existing files to S3 (coexist: old files stay on `/data`)
- Presigned URL upload (server-side proxy only)
- Storage quotas or usage tracking
- GDrive sync path (GDrive downloads still write to local GDRIVE_DIR)
- Encryption of file contents (credentials only)
- Cross-region replication or versioning

## Success Criteria

- [ ] `STORAGE_ENCRYPTION_KEY` env var present → `lib/storage-crypto.js` can encrypt/decrypt a test value round-trip
- [ ] Admin saves S3 config → credentials encrypted in `app_settings`; `GET /api/org/storage` returns config with secret masked as `"*****"`
- [ ] `POST /api/org/storage/test` with invalid credentials returns a clear error; with valid credentials returns `{ success: true }`
- [ ] Uploading a document when S3 is configured → file lands in S3 bucket under `org-{id}/{filename}`; `documents.storage_backend = 's3'` and `documents.storage_key` populated
- [ ] Uploading a document when S3 is NOT configured → file saved to `DOCUMENTS_DIR/org-{id}/documents/`; `documents.storage_backend = 'local'`
- [ ] Downloading an S3-stored document → file streamed from S3, correct content-type header
- [ ] Downloading a local-stored document → file streamed from local fs (existing behavior preserved)
- [ ] Deleting S3 config (DELETE /api/org/storage) → subsequent uploads revert to local storage
- [ ] Existing documents (storage_backend = null/local, old path format) still download correctly — no regressions
- [ ] Two orgs cannot access each other's S3-stored files (orgId prefix enforced in storage key)

---

## Tasks

### Task 1: Storage Config Layer — Encryption, DB Schema, Config API

**Description:**

**Encryption utility (`lib/storage-crypto.js`):**
```javascript
// Uses Node.js built-in crypto, AES-256-GCM
// STORAGE_ENCRYPTION_KEY env var: 32 bytes base64-encoded
// encrypt(plaintext) → { iv, ciphertext, tag } as base64 JSON string
// decrypt(encryptedStr) → plaintext string
// If STORAGE_ENCRYPTION_KEY is not set, throw with a clear message
export function encrypt(plaintext) { ... }
export function decrypt(encryptedStr) { ... }
```

**DB schema migrations (`lib/db.js` `initDb()`):**
Add via try/catch ALTER TABLE ADD COLUMN:
- `ALTER TABLE documents ADD COLUMN storage_backend TEXT DEFAULT 'local'`
- `ALTER TABLE documents ADD COLUMN storage_key TEXT`
- `ALTER TABLE contract_documents ADD COLUMN storage_backend TEXT DEFAULT 'local'`
- `ALTER TABLE contract_documents ADD COLUMN storage_key TEXT`
- `ALTER TABLE contract_invoices ADD COLUMN invoice_storage_backend TEXT DEFAULT 'local'`
- `ALTER TABLE contract_invoices ADD COLUMN invoice_storage_key TEXT`
- `ALTER TABLE contract_invoices ADD COLUMN payment_storage_backend TEXT DEFAULT 'local'`
- `ALTER TABLE contract_invoices ADD COLUMN payment_storage_key TEXT`

Update `lib/db.d.ts` for any new DB function signatures.

**Config API routes (`src/app/api/org/storage/`):**

`GET /api/org/storage` — return current config (owner/admin only):
- Read keys from `getOrgSettings(orgId)`: `s3Bucket`, `s3Region`, `s3AccessKeyId`, `s3SecretEncrypted`, `s3Endpoint`
- If `s3SecretEncrypted` exists: return `{ configured: true, bucket, region, accessKeyId, secretKey: '*****', endpoint }`
- If not configured: return `{ configured: false }`

`PUT /api/org/storage` — save config (owner/admin only):
- Body: `{ bucket, region, accessKeyId, secretKey, endpoint? }`
- Validate all required fields non-empty
- Call `POST /api/org/storage/test` logic inline to verify access before persisting
- If test fails: return 400 with error message from test
- On success: encrypt `secretKey` with `encrypt(secretKey)`, store all keys via `setOrgSetting(orgId, key, value)`, `saveDb()`, `logAction()`
- Return `{ success: true }`

`POST /api/org/storage/test` — test without saving (owner/admin only):
- Body: `{ bucket, region, accessKeyId, secretKey, endpoint? }`
- Create `S3Client` with provided credentials
- Send a `HeadBucketCommand({ Bucket: bucket })` — verifies bucket exists and credentials have access
- Return `{ success: true }` or `{ success: false, error: "Bucket not found" | "Access denied" | string }`

`DELETE /api/org/storage` — remove config (owner only):
- Delete all `s3*` keys from `app_settings` for this org via `setOrgSetting(orgId, key, null)` for each
- `saveDb()`, `logAction()`
- Return 204

**`@aws-sdk/client-s3` install:**
The executor must run `npm install @aws-sdk/client-s3` as part of this task.

**Files:**
- `lib/storage-crypto.js` — new
- `lib/db.js` — 8 ALTER TABLE migrations in initDb()
- `lib/db.d.ts` — update if new DB functions added
- `src/app/api/org/storage/route.ts` — new (GET, PUT, DELETE)
- `src/app/api/org/storage/test/route.ts` — new (POST)
- `package.json` — add `@aws-sdk/client-s3`

**Patterns:**
- `documentation/technology/standards/database.md` (ALTER TABLE with try/catch)
- `documentation/technology/standards/authentication-authorization.md` (auth guard, role checks)
- `documentation/technology/standards/rest-api.md` (saveDb before logAction, error shapes)

**Success Criteria:**
- `encrypt("test") → decrypt(result) === "test"` (round-trip)
- `GET /api/org/storage` without S3 configured returns `{ configured: false }`
- `PUT /api/org/storage` with valid credentials: config persisted, secret not stored plaintext (verify via DB inspection: `s3SecretEncrypted` value is not the original secret)
- `PUT /api/org/storage` with invalid credentials: returns 400 before persisting anything
- `POST /api/org/storage/test` with valid S3 credentials returns `{ success: true }`
- `POST /api/org/storage/test` with invalid bucket/credentials returns `{ success: false, error: "..." }`
- `DELETE /api/org/storage` clears all s3* keys; subsequent `GET /api/org/storage` returns `{ configured: false }`
- All 8 ALTER TABLE migrations run without error on existing DB

**Dependencies:** None

---

### Task 2: Storage Driver and All File I/O Routes

**Description:**

**Storage driver (`lib/storage.js`):**
```javascript
// Reads org S3 config from getOrgSettings(orgId) + decrypt()
// Dispatches to local or S3 based on config presence

export async function putFile(orgId, prefix, filename, buffer) {
  // prefix: 'documents' | 'invoices' | 'contract-attachments' | 'case-attachments' | 'gdrive'
  // Returns { storageBackend, storageKey, localPath }
  // If S3 configured for org: upload to S3, storageKey = `org-${orgId}/${prefix}/${filename}`
  // Else: write to DOCUMENTS_DIR/org-{orgId}/{prefix}/{filename}, storageBackend = 'local'
}

export async function getFile(orgId, storageBackend, storageKey, localPath) {
  // Returns Buffer
  // If storageBackend === 's3': GetObjectCommand → collect stream → Buffer
  // Else: fs.readFile(localPath)
}

export async function deleteFile(orgId, storageBackend, storageKey, localPath) {
  // If storageBackend === 's3': DeleteObjectCommand
  // Else: fs.unlink(localPath) with try/catch (file may not exist)
}
```

**Update `saveUploadedFile` (`src/lib/server-utils.ts`):**
Current signature: `saveUploadedFile(file: File, destDir: string): Promise<{filePath, fileName}>`
New signature: `saveUploadedFile(file: File, destDir: string, orgId?: number): Promise<{filePath, fileName, storageBackend, storageKey}>`
- If `orgId` provided: call `putFile(orgId, prefix, filename, buffer)` and return storage metadata
- If no `orgId`: fall back to existing behavior (legacy callers)

**Update upload route (`src/app/api/documents/upload/route.ts`):**
- Pass `orgId = Number(session.user.orgId)` to `saveUploadedFile`
- After upload: `addDocument(..., { storageBacked, storageKey })` — or update the document row immediately after insert
- New DB function: `setDocumentStorage(docId, storageBackend, storageKey)` if addDocument doesn't support these columns yet

**Update all download routes:**

For each download route, replace the current pattern:
```typescript
// BEFORE:
const filePath = document.path;
const resolvedPath = path.resolve(filePath);
if (!resolvedPath.startsWith(resolvedDocsDir)) return 403;
const buffer = await fs.promises.readFile(resolvedPath);
```

With the storage-aware pattern:
```typescript
// AFTER:
const buffer = await getFile(
  Number(session.user.orgId),
  document.storage_backend || 'local',
  document.storage_key,
  document.path  // fallback for legacy local files
);
```

Routes to update:
1. `src/app/api/documents/[id]/download/route.ts` — uses `document.path`
2. `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts` — uses `contractDoc.file_path`
3. `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts` — uses `caseDoc.file_path`
4. `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` — uses `invoice.invoice_file_path`
5. `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` — uses `invoice.payment_confirmation_path`

The path-traversal guard (`resolvedPath.startsWith(resolvedDocsDir)`) is replaced by the storage driver's internal routing. For S3 files, the `orgId` prefix enforces isolation (`org-${orgId}/...`).

**Document delete path:**
Update the document DELETE route (`src/app/api/documents/[id]/route.ts`) to call `deleteFile(orgId, storageBackend, storageKey, localPath)` when deleting a document.

**Files:**
- `lib/storage.js` — new storage driver
- `lib/storage-crypto.js` — imported by storage.js (created in Task 1)
- `src/lib/server-utils.ts` — update `saveUploadedFile`
- `src/app/api/documents/upload/route.ts` — pass orgId, store storage metadata
- `src/app/api/documents/[id]/route.ts` — delete file from storage on document delete
- `src/app/api/documents/[id]/download/route.ts` — use storage driver
- `src/app/api/contracts/[id]/documents/[contractDocId]/download/route.ts` — use storage driver
- `src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.ts` — use storage driver
- `src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` — use storage driver
- `src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` — use storage driver

**Patterns:**
- `documentation/technology/standards/database.md` (parameterized queries)
- `documentation/technology/standards/security.md` (download security model)
- `documentation/technology/standards/rest-api.md` (streaming responses)
- `lib/gdrive.js` (pattern for reading org credentials and using external SDK)

**Success Criteria:**
- Uploading a document with S3 configured → `documents.storage_backend = 's3'`, `documents.storage_key = 'org-{id}/documents/{filename}'`; file exists in S3 bucket
- Uploading a document without S3 configured → `documents.storage_backend = 'local'`, `documents.storage_key = null`; file exists at `DOCUMENTS_DIR/org-{id}/documents/{filename}`
- Downloading an S3-stored document → correct file content returned, correct `content-type` header
- Downloading a legacy local document (old path, no storage_backend) → file streamed correctly (backward compatibility)
- Deleting a document with S3 backend → S3 object deleted
- All 5 download routes work for both local and S3 backends
- Run `npm test` → 0 regressions

**Dependencies:** Task 1

---

### Task 3: S3 Config Settings UI

**Description:**

Add an S3 storage configuration section to `src/app/(app)/settings/page.tsx` following the same pattern as the existing GDrive section.

**S3 Config Section component (new file or inline):**
```tsx
// Shows current state:
// - If configured: bucket name, region, access key ID (masked), "Remove" button
// - If not configured: "Configure S3 Storage" form

// Form fields:
// - Bucket name (required)
// - Region (required, e.g. "us-east-1")
// - Access Key ID (required)
// - Secret Access Key (required, password input)
// - Endpoint URL (optional, placeholder: "https://... (leave blank for AWS S3)")

// Buttons:
// - "Test Connection" → POST /api/org/storage/test → show success/error inline
// - "Save" → PUT /api/org/storage (only enabled after successful test, or always enabled with test inline on save)
// - "Remove configuration" (only shown when configured) → DELETE /api/org/storage with AlertDialog confirmation

// UX flow (test-then-save):
// Option A: "Test" button separate from "Save" — user must test before save button is enabled
// Option B: "Save" triggers test inline and only persists if test passes (backend already enforces this via PUT)
// Use Option B — PUT already tests before saving, so "Save" is the only action needed
// Show test result feedback inline before the final success state

// Visibility: owners and admins can view and edit; members see no section
```

**Add to settings page:**
- Import and render `<StorageSection orgId={session.user.orgId} orgRole={session.user.orgRole} />` in `src/app/(app)/settings/page.tsx`
- Section appears after GDrive section
- Fetch current config on mount via `GET /api/org/storage`

**Files:**
- `src/app/(app)/settings/page.tsx` — add StorageSection
- `src/components/settings/storage-section.tsx` — new component (or inline in settings page)

**Patterns:**
- `documentation/technology/standards/design-system.md` (Shadcn Input, Button, AlertDialog, Badge, cn())
- Existing GDrive section in `settings/page.tsx` — follow same structural pattern

**Success Criteria:**
- Settings page loads with S3 section visible to owner/admin
- S3 section shows "not configured" state when no config exists
- Filling form and clicking "Save": if credentials invalid → error shown inline, nothing persisted; if valid → success state, bucket name displayed
- "Remove configuration" with AlertDialog → config cleared, form reverts to empty state
- Member role sees no S3 section (orgRole check)
- Saving config persists across page refresh
- Changing S3 config for one org does not affect another org's config

**Dependencies:** Task 1 (parallel with Task 2)

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/tech-stack.md` | Updated | Added @aws-sdk/client-s3 and Node.js crypto to storage section |
| `documentation/technology/architecture/database-schema.md` | Updated | Added storage_backend and storage_key columns to documents table |
| `documentation/product/requirements/features.md` | Updated | Added Storage Configuration section under Organization Management |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| S3 credentials in DB: encrypt() called but STORAGE_ENCRYPTION_KEY not set | Medium | High | encrypt() throws clearly if env var missing; PUT route fails loudly |
| Legacy download routes break for old file paths | Low | High | getFile() falls back to `localPath` when storage_backend is null/local |
| S3 GetObject timeout on large files | Low | Medium | Use streaming response (pipe S3 stream to NextResponse); don't buffer entire file |
| Org prefix not enforced → cross-org S3 access | Low | Critical | storage driver always prepends `org-${orgId}/` to S3 key; cannot be bypassed by API caller |
| Task 2 scope too large (5 download routes + upload + driver) | Medium | Medium | Executor batches: driver → upload → downloads one by one. May escalate for split if needed |
| `@aws-sdk/client-s3` adds bundle weight | Low | Low | Server-only import (runtime = "nodejs"); not included in client bundle |
