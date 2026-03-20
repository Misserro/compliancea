# Task 1 Plan: Storage Config Layer -- Encryption, DB Schema, Config API

## Files to Create/Modify

### New Files
1. **`lib/storage-crypto.js`** -- AES-256-GCM encryption utility
2. **`src/app/api/org/storage/route.ts`** -- GET, PUT, DELETE for S3 config
3. **`src/app/api/org/storage/test/route.ts`** -- POST to test S3 connection

### Modified Files
4. **`lib/db.js`** -- 8 ALTER TABLE migrations in `initDb()` (inserted before `initSystemTemplates()` call at line 715)
5. **`package.json`** -- `@aws-sdk/client-s3` dependency via `npm install`

## Implementation Details

### 1. `lib/storage-crypto.js`

- Import Node.js built-in `crypto`
- Read `STORAGE_ENCRYPTION_KEY` from `process.env`; throw with clear message if missing or not 32 bytes after base64 decode
- `encrypt(plaintext)`:
  - Generate random 12-byte IV
  - Create cipher with `crypto.createCipheriv('aes-256-gcm', key, iv)`
  - Encrypt, get auth tag (16 bytes)
  - Return `JSON.stringify({ iv, ciphertext, tag })` where all values are base64-encoded, then base64-encode the entire JSON string
- `decrypt(encryptedStr)`:
  - Base64-decode to JSON string, parse to get `{ iv, ciphertext, tag }`
  - Create decipher with `crypto.createDecipheriv('aes-256-gcm', key, iv_buffer)`
  - Set auth tag, decrypt, return plaintext
- Export both functions as named exports

### 2. DB Migrations in `lib/db.js`

Insert 8 ALTER TABLE statements in `initDb()` just before the `initSystemTemplates()` call (around line 714). Use the batch migration pattern:

```javascript
// Storage-layer columns
const storageDocCols = [
  { table: "documents", name: "storage_backend", def: "TEXT DEFAULT 'local'" },
  { table: "documents", name: "storage_key", def: "TEXT" },
  { table: "contract_documents", name: "storage_backend", def: "TEXT DEFAULT 'local'" },
  { table: "contract_documents", name: "storage_key", def: "TEXT" },
  { table: "contract_invoices", name: "invoice_storage_backend", def: "TEXT DEFAULT 'local'" },
  { table: "contract_invoices", name: "invoice_storage_key", def: "TEXT" },
  { table: "contract_invoices", name: "payment_storage_backend", def: "TEXT DEFAULT 'local'" },
  { table: "contract_invoices", name: "payment_storage_key", def: "TEXT" },
];
for (const col of storageDocCols) {
  try {
    db.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.def}`);
  } catch (e) {
    // Column already exists
  }
}
```

### 3. `src/app/api/org/storage/route.ts` (GET, PUT, DELETE)

Follow existing `src/app/api/org/route.ts` pattern exactly:
- Imports: NextRequest, NextResponse, auth, ensureDb, getOrgSettings, setOrgSetting, saveDb, logAction
- `export const runtime = "nodejs"`
- Auth guard: `!session?.user` -> 401

**GET** (owner/admin):
- Role check: orgRole must be 'owner' or 'admin'
- Read settings via `getOrgSettings(orgId)` -> array of {key, value}
- Convert to map, check for `s3SecretEncrypted`
- Return `{ configured: true, bucket, region, accessKeyId, secretKey: '*****', endpoint }` or `{ configured: false }`

**PUT** (owner/admin):
- Parse JSON body with try/catch
- Validate required: bucket, region, accessKeyId, secretKey (non-empty strings)
- Test connection inline: create S3Client, send HeadBucketCommand
- If test fails -> 400 with error
- On success: `encrypt(secretKey)`, store all 5 keys via `setOrgSetting(orgId, key, value)`
- Call `saveDb()` explicitly, then `logAction()`
- Return `{ success: true }`

**DELETE** (owner only):
- Role check: orgRole must be 'owner'
- Delete all s3* keys: `setOrgSetting(orgId, key, null)` for each of: s3Bucket, s3Region, s3AccessKeyId, s3SecretEncrypted, s3Endpoint
- Call `saveDb()`, then `logAction()`
- Return 204 (no body)

### 4. `src/app/api/org/storage/test/route.ts` (POST)

- Auth guard + owner/admin role check
- Parse body: { bucket, region, accessKeyId, secretKey, endpoint? }
- Create S3Client with credentials + optional endpoint
- Send HeadBucketCommand({ Bucket: bucket })
- Return `{ success: true }` or `{ success: false, error: message }`

### 5. npm install

Run `npm install @aws-sdk/client-s3` to add the dependency.

## Key Decisions

- **setOrgSetting with null for DELETE**: The task spec says `setOrgSetting(orgId, key, null)`. This will INSERT OR REPLACE with value=null. GET checks for `s3SecretEncrypted` being present and non-null, so this effectively means "not configured".
- **saveDb() call**: `run()` already calls `saveDb()` internally, but the pattern in existing code (org/route.ts) calls `saveDb()` explicitly after mutations before `logAction()`. I will follow this pattern.
- **S3Client import**: `@aws-sdk/client-s3` is server-only (runtime = "nodejs"), no client bundle impact.
- **logAction options**: Will pass `{ orgId }` in options to logAction for audit trail org association.

## Risks

- `setOrgSetting(orgId, key, null)` does INSERT OR REPLACE with null value rather than DELETE. If GET logic checks for the key's existence (row present), it would still see "configured". Mitigation: GET checks whether the value is truthy, not just whether the row exists.

## Success Criteria Mapping

1. encrypt/decrypt round-trip -- tested by crypto module design
2. GET without S3 -> { configured: false } -- getOrgSettings returns empty or null-valued rows
3. PUT with valid creds -> encrypted secret persisted
4. PUT with invalid creds -> 400 before persist (HeadBucketCommand inline)
5. POST /test with valid -> { success: true }
6. POST /test with invalid -> { success: false, error }
7. DELETE -> clears all keys, GET returns { configured: false }
8. 8 ALTER TABLE migrations run idempotently
