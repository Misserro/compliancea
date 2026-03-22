# Task 3 — Implementation Plan: Migration Worker Per-Org Filtering + own_s3→platform_s3

## Overview

Extend migration infrastructure with per-org scoping and a new `own_s3 → platform_s3` transfer direction. Three files modified: `lib/db.js`, `src/lib/migration-worker.ts`, `src/lib/db-imports.ts`.

## Changes

### 1. `lib/db.js` — Schema + New DB Functions

**Schema migration (after line 761, inside `initDb`):**
```js
try { db.run(`ALTER TABLE migration_jobs ADD COLUMN org_id INTEGER`); } catch (e) {}
try { db.run(`ALTER TABLE migration_jobs ADD COLUMN migration_type TEXT DEFAULT 'local_to_platform_s3'`); } catch (e) {}
```
Uses the same try/catch pattern as other ALTER TABLE statements (line 745) — safe for existing DBs.

**`createMigrationJobForOrg(orgId, migrationType)`:**
```js
export function createMigrationJobForOrg(orgId, migrationType) {
  const result = run(
    `INSERT INTO migration_jobs (status, org_id, migration_type) VALUES ('pending', ?, ?)`,
    [orgId, migrationType]
  );
  return result.lastInsertRowId;
}
```

**`getLatestMigrationJobForOrg(orgId)`:**
```js
export function getLatestMigrationJobForOrg(orgId) {
  return get(
    `SELECT * FROM migration_jobs WHERE org_id = ? ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
}
```

### 2. `src/lib/db-imports.ts` — Re-exports

Add to the export list:
- `createMigrationJobForOrg`
- `getLatestMigrationJobForOrg`

### 3. `src/lib/migration-worker.ts` — New Worker Functions

**Fix existing bug (line 181):**
Change `result.storageBackend === "s3"` to `result.storageBackend !== "local"` — Task 2 changed `putFile` to return `'org_s3'`/`'platform_s3'` instead of `'s3'`, so the old check would mark all migrated files as "skipped".

**New imports:**
- Add `GetObjectCommand` import (from `@aws-sdk/client-s3` via storage.js helpers, or import directly)
- Add `getS3Config`, `getPlatformS3Config`, `getS3Client` — but these are not exported from storage.js. Instead, import `getFile` logic or use the exported `getFile`/`putFile`.

Actually, looking more carefully: `storage.js` exports `putFile`, `getFile`, `deleteFile` and the internal helpers (`getS3Config`, `getPlatformS3Config`, `getS3Client`, `resolveReadConfig`) are NOT exported. For `transferS3File`, we need direct S3 client access.

**Approach for transferS3File:** Import `S3Client`, `GetObjectCommand`, `PutObjectCommand` directly from `@aws-sdk/client-s3`. Import `getOrgSettings`, `getPlatformSettings` from `db-imports` and `decrypt` from `storage-crypto.js` to build configs locally, OR — simpler — export `getS3Config`, `getPlatformS3Config`, `getS3Client` from `storage.js`.

**Decision: Export helpers from storage.js.** Add exports for `getS3Config`, `getPlatformS3Config`, `getS3Client`. This avoids duplicating config-building logic.

**`collectLocalFilesForOrg(orgId)`:**
Same three queries as `collectFilesToMigrate()` but each adds `AND d.org_id = ?` (documents query) or the join already provides `d.org_id` so we add `AND d.org_id = ?` to the WHERE clause. Parameter: `[orgId]`.

**`collectOwnS3FilesForOrg(orgId)`:**
New interface `MigrationS3File` extending `MigrationFile` with `storageKey` instead of `localPath`. Three queries mirroring the local ones but filtering `storage_backend IN ('s3', 'org_s3')` instead of `= 'local'`. Returns files with their `storageKey` values.

```typescript
interface MigrationS3File {
  table: string;
  id: number;
  storageKey: string;
  orgId: number;
  prefix: string;
  column?: "invoice" | "payment";
}
```

Queries:
1. `documents`: `WHERE d.storage_backend IN ('s3','org_s3') AND d.storage_key IS NOT NULL AND d.org_id = ?`
2. `contract_documents`: `WHERE cd.storage_backend IN ('s3','org_s3') AND cd.storage_key IS NOT NULL AND cd.document_id IS NULL AND d.org_id = ?`
3. `contract_invoices`: `WHERE d.org_id = ? AND ((ci.invoice_storage_backend IN ('s3','org_s3') AND ci.invoice_storage_key IS NOT NULL) OR (ci.payment_storage_backend IN ('s3','org_s3') AND ci.payment_storage_key IS NOT NULL))`

**`transferS3File(storageKey, sourceConfig, targetConfig)`:**
```typescript
async function transferS3File(
  storageKey: string,
  sourceConfig: S3Config,
  targetConfig: S3Config
): Promise<string> {
  const sourceClient = getS3Client(sourceConfig);
  const response = await sourceClient.send(
    new GetObjectCommand({ Bucket: sourceConfig.bucket, Key: storageKey })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);

  const targetClient = getS3Client(targetConfig);
  await targetClient.send(
    new PutObjectCommand({
      Bucket: targetConfig.bucket,
      Key: storageKey,        // same key path
      Body: body,
      ContentType: response.ContentType || "application/octet-stream",
      ContentLength: body.length,
    })
  );
  return storageKey;
}
```

**`updateS3FileRecord(file, storageKey)`:**
Same as `updateFileRecord` but always sets `storage_backend = 'platform_s3'`.

**`runOrgMigration(jobId, orgId, type)`:**
```typescript
export async function runOrgMigration(
  jobId: number,
  orgId: number,
  type: "local_to_platform_s3" | "own_s3_to_platform_s3"
): Promise<void> {
  try {
    if (type === "local_to_platform_s3") {
      // Same logic as global runMigration but org-scoped
      const files = collectLocalFilesForOrg(orgId);
      // ... update job status, iterate files, use putFile, updateFileRecord
      // Same pattern as runMigration but with org-scoped file list
    } else if (type === "own_s3_to_platform_s3") {
      const files = collectOwnS3FilesForOrg(orgId);
      const sourceConfig = getS3Config(orgId);
      const targetConfig = getPlatformS3Config();
      // iterate files, transferS3File each, updateFileRecord to 'platform_s3'
    }
    // Update job completed
  } catch (err) {
    // Update job failed
  }
}
```

## File Change Summary

| File | Changes |
|------|---------|
| `lib/db.js` | 2 ALTER TABLE statements, 2 new functions |
| `lib/storage.js` | Export `getS3Config`, `getPlatformS3Config`, `getS3Client` |
| `src/lib/db-imports.ts` | Add 2 new re-exports |
| `src/lib/migration-worker.ts` | Fix line 181 bug, add 5 new functions, new imports |

## Risk Assessment

- **Low risk:** Schema changes are additive (nullable column + column with default) — no data loss.
- **Low risk:** Existing `runMigration` function unchanged except the line 181 fix.
- **Line 181 fix is critical:** Without it, the global migration would mark all files as "skipped" since `putFile` now returns `'org_s3'`/`'platform_s3'` instead of `'s3'`.
- **Non-destructive:** Source files in org S3 are never deleted during `own_s3_to_platform_s3` migration.
