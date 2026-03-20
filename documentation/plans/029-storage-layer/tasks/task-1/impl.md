## Task 1 Complete -- Storage Config Layer: Encryption, DB Schema, Config API

### Files Created
- **`lib/storage-crypto.js`** -- AES-256-GCM encryption utility using Node.js crypto. Reads `STORAGE_ENCRYPTION_KEY` env var (base64-encoded 32 bytes). Exports `encrypt(plaintext)` and `decrypt(encryptedStr)`. Throws with clear messages if env var missing or wrong length.
- **`src/lib/storage-crypto-imports.ts`** -- Bridge file re-exporting `encrypt` and `decrypt` from `lib/storage-crypto.js`. Route files import via `@/lib/storage-crypto-imports` per module-separation standard.
- **`src/app/api/org/storage/route.ts`** -- GET (read config, mask secret), PUT (validate+test+encrypt+persist), DELETE (clear all s3* keys). Auth: owner/admin for GET/PUT, owner-only for DELETE.
- **`src/app/api/org/storage/test/route.ts`** -- POST (test S3 connection without saving). Auth: owner/admin. Includes `await ensureDb()` per rest-api standard.

### Files Modified
- **`lib/db.js`** (line ~714) -- Added 8 ALTER TABLE migrations in `initDb()` using batch pattern: storage_backend + storage_key on documents, contract_documents, contract_invoices (invoice_ and payment_ prefixed).
- **`package.json`** + **`package-lock.json`** -- Added `@aws-sdk/client-s3` dependency via npm install.

### Key Implementation Details

- **Encryption format**: encrypt() returns a JSON string `{"iv":"hex","ciphertext":"hex","tag":"hex"}` (not double-base64). decrypt() parses this JSON and reverses. This is simpler and avoids the double-encoding mentioned in the plan.
- **S3 error handling**: Uses both `error.name` and `error.$metadata?.httpStatusCode` to detect NotFound (404), AccessDenied (403), and BadRequest (400) from HeadBucketCommand -- per knowledge agent guidance about unreliable error names in recent SDK versions.
- **Custom endpoint support**: When `endpoint` is provided (for R2/MinIO), region is set to `"auto"` and `forcePathStyle` is enabled.
- **DELETE uses setOrgSetting(orgId, key, null)**: This sets value to SQL NULL via INSERT OR REPLACE. GET checks `config.s3SecretEncrypted` truthiness -- null/empty means not configured.
- **saveDb() before logAction()**: Followed per task spec. Note that `run()` inside `setOrgSetting()` already calls `saveDb()` internally, but the explicit call follows the established pattern in `src/app/api/org/route.ts`.
- **logAction options**: Passes `{ userId, orgId }` to logAction for audit trail association per existing pattern.

### INTEGRATION Notes for Task 2
- **`encrypt`/`decrypt`** are exported from `lib/storage-crypto.js` -- Task 2's storage driver will import `decrypt` to read encrypted S3 credentials.
- **DB columns**: `storage_backend` defaults to `'local'`, `storage_key` defaults to NULL. Task 2 should set these on document insert/update.
- **getOrgSettings(orgId)** returns `[{key, value}]` array. Convert to map: `Object.fromEntries(settings.map(s => [s.key, s.value]))`. The `s3SecretEncrypted` value must be passed through `decrypt()` to get the original secret key.

### INTEGRATION Notes for Task 3
- **GET /api/org/storage** returns `{ configured: true, bucket, region, accessKeyId, secretKey: "*****", endpoint }` or `{ configured: false }`.
- **PUT /api/org/storage** accepts `{ bucket, region, accessKeyId, secretKey, endpoint? }` and returns `{ success: true }` or `{ error: string }` with status 400.
- **POST /api/org/storage/test** accepts same body as PUT and returns `{ success: true }` or `{ success: false, error: string }`.
- **DELETE /api/org/storage** returns 204 with no body.

### Review Fix Cycle 1
- **Fix 1**: Created `src/lib/storage-crypto-imports.ts` bridge file and changed `route.ts` to import via `@/lib/storage-crypto-imports` instead of deep relative path. Per module-separation standard.
- **Fix 2**: Added `import { ensureDb } from "@/lib/server-utils"` and `await ensureDb()` to `test/route.ts` POST handler. Per rest-api standard rule 2.
