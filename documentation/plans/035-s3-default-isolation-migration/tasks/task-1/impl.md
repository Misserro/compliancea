# Task 1 — Implementation Notes

## Changes Made

### 1. `lib/db.js` — `getAllOrganizations()` (line 3799)
- Added `o.storage_policy` to the SELECT clause
- Bug fix: previously the admin panel dropdown always showed "Local" for all orgs because storage_policy was never returned from the query

### 2. `lib/db.js` — `createOrganization()` (line 3832)
- Changed INSERT from `(name, slug)` to `(name, slug, storage_policy)` with explicit `'platform_s3'` value
- New organizations now default to platform_s3 instead of relying on the column default

### 3. `src/app/api/admin/orgs/route.ts` — GET handler
- Added `storagePolicy: org.storage_policy || "local"` to the enriched response object
- The `|| "local"` fallback handles orgs created before the ALTER TABLE migration added the column

### 4. `src/app/api/admin/orgs/route.ts` — POST handler
- Added `getPlatformSettings` to imports from `@/lib/db-imports`
- After org creation, calls `getPlatformSettings()` and checks for `s3Bucket` and `s3SecretEncrypted` keys
- If either is missing, adds `warning` field to the 201 response (non-blocking — org is still created)

### 5. `src/components/admin/create-org-dialog.tsx`
- Added `warning` and `success` state variables
- After successful POST, stores `data.warning` if present
- Three success paths:
  1. **Invite URL present:** Shows invite URL + warning banner (if any) + Done button
  2. **No invite URL + warning:** Shows success state with warning banner + Done button (dialog stays open)
  3. **No invite URL + no warning:** Immediately calls `onCreated()` (existing behavior)
- Warning banner uses amber/yellow styling: `bg-amber-50 border-amber-200 text-amber-800`
- `resetForm()` clears both `warning` and `success` states

## Files Changed
- `lib/db.js` — lines 3801, 3833
- `src/app/api/admin/orgs/route.ts` — import + GET mapping + POST warning logic
- `src/components/admin/create-org-dialog.tsx` — warning/success states + two warning banner locations

## Not Changed
- `lib/db-imports.ts` — `getPlatformSettings` was already exported (line 178)
- `src/app/(admin)/admin/page.tsx` — already maps `org.storage_policy` to `storagePolicy` (line 56)
- `src/components/admin/admin-org-list.tsx` — already has `storagePolicy: string` in Org interface (line 36)
- `getActiveOrganizations()` — not used in admin panel; left unchanged to minimize scope
