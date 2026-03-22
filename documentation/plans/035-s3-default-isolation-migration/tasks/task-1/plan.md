# Task 1 — Implementation Plan

## Changes

### 1. `lib/db.js` — `getAllOrganizations()` (line 3799)

Add `o.storage_policy` to the SELECT clause so admin panel receives actual storage policy per org.

**Before:**
```sql
SELECT o.id, o.name, o.slug, o.created_at, o.deleted_at,
       COUNT(om.user_id) as member_count
```

**After:**
```sql
SELECT o.id, o.name, o.slug, o.created_at, o.deleted_at, o.storage_policy,
       COUNT(om.user_id) as member_count
```

### 2. `lib/db.js` — `createOrganization()` (line 3832)

Change INSERT to explicitly set `storage_policy = 'platform_s3'`.

**Before:**
```sql
INSERT INTO organizations (name, slug) VALUES (?, ?)
```

**After:**
```sql
INSERT INTO organizations (name, slug, storage_policy) VALUES (?, ?, 'platform_s3')
```

### 3. `src/app/api/admin/orgs/route.ts` — GET handler

Map `org.storage_policy` to `storagePolicy` in the enriched response object.

Add to the return object at line 48:
```ts
storagePolicy: org.storage_policy || 'local',
```

### 4. `src/app/api/admin/orgs/route.ts` — POST handler

After creating org and before returning, check if platform S3 is configured by calling `getPlatformSettings()` and looking for an `s3Bucket` key. If not found, add `warning` to response.

- Import `getPlatformSettings` from `@/lib/db-imports`
- After `saveDb()`, call `getPlatformSettings()` and check for `s3Bucket`
- If not configured, add `warning: "Platform S3 is not configured. Files will fail to upload until platform S3 is set up."` to response

### 5. `src/components/admin/create-org-dialog.tsx` — Warning banner

After successful POST, store `data.warning` in state. In the invite URL success state (lines 148-180), display an amber warning banner when `data.warning` is present. Also handle the no-invite-URL success path.

- Add `warning` state variable
- Set it from `data.warning` after successful POST
- Show amber/yellow banner in success state when warning is present
- Show warning even in the non-invite path (use toast + warning state)

## Files changed

1. `lib/db.js` — 2 functions modified
2. `src/app/api/admin/orgs/route.ts` — GET + POST handlers modified, 1 import added
3. `src/components/admin/create-org-dialog.tsx` — warning state + banner added

## No changes needed

- `lib/db-imports.ts` — `getPlatformSettings` already exported (line 178)
