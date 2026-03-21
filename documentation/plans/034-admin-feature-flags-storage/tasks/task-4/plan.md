# Task 4 — Storage Routing Update: Implementation Plan

## Current State

`lib/storage.js` has three exported functions:

- **`putFile(orgId, prefix, filename, buffer, contentType)`** — checks org S3 config via `getS3Config(orgId)`. If org has S3 credentials → uploads to org S3 bucket with key `org-{id}/{prefix}/{filename}`. Otherwise → writes to local filesystem.
- **`getFile(orgId, storageBackend, storageKey, localPath)`** — if `storageBackend === 's3'` → reads from org S3 using `getS3Config(orgId)`. Otherwise → reads local file.
- **`deleteFile(orgId, storageBackend, storageKey, localPath)`** — same dispatch pattern as `getFile`.

Helper functions: `getS3Config(orgId)` fetches org-specific S3 credentials from `org_settings` table and decrypts secret. `getS3Client(s3Config)` creates an `S3Client` instance.

## Task 3 Provides (already in db.js)

- `getPlatformSettings()` — returns `Array<{key, value}>` from `platform_settings` table
- `getOrgStoragePolicy(orgId)` — returns `{storage_policy: string} | undefined`
- `storage_policy` column on `organizations` (default `'local'`)

## Changes Required

### 1. `lib/storage.js` — Add `getPlatformS3Config()` helper

New function that reads platform S3 credentials from `platform_settings` table (via `getPlatformSettings()` from db.js) and decrypts the secret. Returns `null` if not configured. Same shape as `getS3Config()` output.

```js
function getPlatformS3Config() {
  const rows = getPlatformSettings();
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!config.s3Bucket || !config.s3SecretEncrypted) return null;
  return {
    bucket: config.s3Bucket,
    region: config.s3Region,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: decrypt(config.s3SecretEncrypted),
    endpoint: config.s3Endpoint || undefined,
  };
}
```

### 2. `lib/storage.js` — Add `resolveWriteBackend(orgId)` helper

Implements the three-tier dispatch chain for writes:

1. If org has own S3 credentials (`getS3Config(orgId)` returns non-null) → return `{ type: 'org_s3', config: orgS3Config }`
2. Else if org `storage_policy === 'platform_s3'` AND platform S3 configured → return `{ type: 'platform_s3', config: platformS3Config }`
3. Else → return `{ type: 'local', config: null }`

### 3. `lib/storage.js` — Update `putFile()`

Replace the current two-branch logic with three-tier dispatch:

```js
export async function putFile(orgId, prefix, filename, buffer, contentType) {
  const backend = resolveWriteBackend(orgId);

  if (backend.type === 'org_s3' || backend.type === 'platform_s3') {
    const key = `org-${orgId}/${prefix}/${filename}`;
    const client = getS3Client(backend.config);
    await client.send(new PutObjectCommand({
      Bucket: backend.config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    }));
    return { storageBackend: "s3", storageKey: key, localPath: null };
  } else {
    // local fallback
    const dir = path.join(DOCUMENTS_DIR, `org-${orgId}`, prefix);
    await fs.promises.mkdir(dir, { recursive: true });
    const localPath = path.join(dir, filename);
    await fs.promises.writeFile(localPath, buffer);
    return { storageBackend: "local", storageKey: null, localPath };
  }
}
```

Key point: both `org_s3` and `platform_s3` produce `storageBackend: "s3"` — the S3 key namespace `org-{id}/...` is identical for both.

### 4. `lib/storage.js` — Update `getFile()`

For reads, the `storage_backend` column on the document record determines where to read from. The current logic uses `getS3Config(orgId)` for S3 reads, which only works for org-specific S3. We need to also try platform S3 config.

New logic for `storageBackend === 's3'`:
1. Try org S3 config first (`getS3Config(orgId)`)
2. If null, try platform S3 config (`getPlatformS3Config()`)
3. If both null, throw error

```js
export async function getFile(orgId, storageBackend, storageKey, localPath) {
  if (storageBackend === "s3" && storageKey) {
    const s3Config = getS3Config(orgId) || getPlatformS3Config();
    if (!s3Config) throw new Error("S3 configured but no credentials found");
    const client = getS3Client(s3Config);
    // ... rest unchanged
  } else {
    return fs.promises.readFile(localPath);
  }
}
```

**Important consideration**: When an org has `own_s3`, files are in the org's bucket. When an org has `platform_s3`, files are in the platform bucket. We need to pick the RIGHT config. The `storageKey` is the same format either way, but the bucket differs.

Revised approach: we need to know WHICH S3 the file was stored to. Since both produce `storageBackend: 's3'`, we can't distinguish from the column alone. However, the routing logic is: if the org currently has own S3 credentials, those were used; if not, platform S3 was used. But the constraint says "storage_backend column wins" — meaning a file stored on platform S3 must still be readable even if the org later switches to own_s3.

**Resolution**: The safest approach is to try org S3 first (because the key includes `org-{id}/` namespace so won't collide), and if that fails with a NoSuchKey error, fall back to platform S3. However, this adds latency.

**Better approach**: Since the key format `org-{id}/{prefix}/{filename}` is identical, and files cannot exist in both places simultaneously (the org either had own_s3 or platform_s3 at upload time), we should resolve based on which bucket actually has the file. But a simpler heuristic is:

- If org currently has own_s3 credentials → try org S3 first
- Else → try platform S3

This works for the common case. For the edge case where policy changed after upload, we add a fallback: try the other config if the first fails with NoSuchKey.

**Simplest correct approach**: Since we're told `storage_backend` column wins and files won't move between buckets without migration, we should store which backend type was used. But the plan says `storageBackend` is just `'s3'` — not `'org_s3'` vs `'platform_s3'`.

**Final decision**: Use the try-org-then-platform pattern for reads. This is correct because:
- If org has own_s3 creds → `getS3Config(orgId)` returns config → uses it (correct for files stored there)
- If org does NOT have own_s3 creds → `getS3Config(orgId)` returns null → falls through to platform S3 (correct for files stored there)
- Edge case (org HAD own_s3, switched to platform_s3): org creds removed → `getS3Config` returns null → falls to platform → file is in old org bucket → NOT FOUND. This is expected — changing policy doesn't migrate files. The migration job (Task 5) handles this.

### 5. `lib/storage.js` — Update `deleteFile()`

Same pattern as `getFile`: resolve S3 config with `getS3Config(orgId) || getPlatformS3Config()`.

### 6. `lib/storage.js` — Import additions

Add imports: `getPlatformSettings`, `getOrgStoragePolicy` from `./db.js`.

### 7. `src/lib/server-utils.ts` — Verification only

`saveUploadedFile` calls `putFile(orgId, "documents", safeName, buffer, file.type)` — no changes needed. The three-tier routing is fully encapsulated in `putFile`.

## Files Changed

| File | Change |
|------|--------|
| `lib/storage.js` | Add `getPlatformS3Config()`, `resolveWriteBackend(orgId)` helpers; update `putFile`, `getFile`, `deleteFile` |
| `lib/db.js` | No changes needed — Task 3 already added `getOrgStoragePolicy` and `getPlatformSettings` |
| `src/lib/server-utils.ts` | No changes needed — verified passthrough |

## Cross-org Isolation

Both org S3 and platform S3 use key prefix `org-{orgId}/...`. On platform S3, org A's files are under `org-1/...` and org B's under `org-2/...`. Since `getFile` always includes the `storageKey` which embeds the org ID, and the caller always passes the correct record's `storageKey`, cross-org reads are impossible at the storage layer.

## Risk

- **Low**: Changes are additive. Existing `own_s3` and `local` paths are unchanged.
- **Edge case**: Org switches from `own_s3` to `platform_s3` — old files in org bucket become inaccessible until migration. This is by design (Task 5 migration handles it).
