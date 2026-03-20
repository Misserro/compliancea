# Task 1 Implementation Notes -- Org Schema, Auth Org Context, Settings Persistence

## Changes Made

### lib/db.js -- Schema, Migrations, Bootstrap, New Functions
- **Created 3 new tables:** `organizations`, `org_members`, `org_invites` (lines 583-613)
- **Added indexes:** `idx_org_members_user`, `idx_org_invites_org`, `idx_org_invites_email` (lines 615-617)
- **Added `org_id` column** to 11 tables via ALTER TABLE ADD COLUMN with try/catch: documents, legal_cases, contract_obligations, tasks, legal_holds, policy_rules, qa_cards, audit_log, case_templates, chunks, product_features (lines 619-631)
- **Added `user_id` column** to audit_log via same pattern (lines 633-638)
- **Recreated `app_settings` table** with composite PK `(org_id, key)` -- old table renamed, data migrated with org_id=1, old table dropped (lines 640-666)
- **First-run bootstrap** (lines 710-735): if organizations table is empty, inserts "Default Organization", backfills org_id=1 on all data tables, enrolls all existing users as owners
- **New exported functions** (end of file):
  - `getDefaultOrg()` -- returns first org by id ASC
  - `getOrgById(id)` -- returns org by id
  - `getOrgMemberByUserId(userId)` -- returns first membership with org name via JOIN, ordered by joined_at ASC
  - `addOrgMember(orgId, userId, role, invitedBy)` -- inserts into org_members
  - `getOrgSettings(orgId)` -- returns all setting rows for an org
  - `setOrgSetting(orgId, key, value)` -- upserts a setting
  - `deleteOrgSettings(orgId)` -- deletes all settings for an org

### lib/db.d.ts -- Type Declarations
- Added declarations for all 7 new exported functions

### src/lib/db-imports.ts -- Re-exports
- Added re-exports for all 7 new functions

### src/auth.ts -- Type Augmentation + JWT/Session Callbacks
- Added `orgId?: number`, `orgRole?: string`, `orgName?: string` to both Session.user and JWT type augmentations
- Imported `getOrgMemberByUserId` from db-imports
- JWT callback: on first sign-in, looks up org membership and sets token.orgId/orgRole/orgName
- JWT callback: on subsequent requests, lazy re-hydrates org context if token.orgId is missing
- Session callback: propagates orgId, orgRole, orgName from token to session

### src/app/(app)/layout.tsx -- Org Membership Guard
- After session revocation check, added `if (!session.user.orgId) redirect("/no-org")`

### src/app/no-org/page.tsx -- New Error Page
- Created OUTSIDE the (app) route group to avoid infinite redirect loop (the (app) layout redirects to /no-org when orgId is missing)
- Simple page with explanation text and sign-out button

### src/app/api/auth/register/route.ts -- Auto-enroll
- After creating user, looks up default org via `getDefaultOrg()` and inserts org_members row with role='member'

### lib/settings.js -- DB-backed Per-org Store
- Replaced in-memory `currentSettings` singleton with DB-backed functions
- `getSettings(orgId=1)` -- reads from app_settings, merges with defaults for missing keys
- `updateSettings(orgId=1, updates)` -- upserts each key-value pair; supports legacy call signature `updateSettings(updates)` for backward compatibility
- `resetSettings(orgId=1)` -- deletes all org settings rows
- `getDefaultSettings()` -- unchanged, returns static defaults
- Values are JSON-serialized/deserialized for proper type handling (booleans, numbers, arrays)

### lib/settings.d.ts -- Updated with proper signatures
- `getSettings(orgId?: number)` returning `Record<string, any>`
- `updateSettings(orgId?: number | Record<string, any>, updates?: Record<string, any>)` supporting legacy call signature
- `resetSettings(orgId?: number)`
- `getDefaultSettings()` unchanged

### src/lib/settings-imports.ts -- No changes needed (pass-through re-exports)

### Settings API Routes
- **`/api/settings/route.ts`** -- Added auth guard (401 if no session), passes session.user.orgId to getSettings/updateSettings
- **`/api/settings/defaults/route.ts`** -- Added auth guard (401 if no session)
- **`/api/settings/reset/route.ts`** -- Added auth guard (401 if no session), passes session.user.orgId to resetSettings

## INTEGRATION Notes for Task 2 and Task 3

- **Task 2:** All DB query functions still work without orgId -- Task 2 will add the orgId parameter. The `getSettings()` call in `ask/route.ts` and `desk/analyze/route.ts` uses default orgId=1 until Task 2 passes the proper value.
- **Task 3:** `session.user.orgName` is available for sidebar display. Org API routes can use `getOrgById`, `getOrgMemberByUserId`, etc.
- **GOTCHA:** The `no-org` page is at `src/app/no-org/page.tsx` (NOT inside `(app)/no-org/`) to avoid infinite redirect loop from the (app) layout guard.
- **GOTCHA:** `app_settings` table PK changed from `key TEXT` to `(org_id, key)`. Any code doing `INSERT OR REPLACE INTO app_settings` with just `key` as the conflict target will break -- must include `org_id`.
- **GOTCHA:** The existing `getAppSetting(key)` and `setAppSetting(key, value)` functions in db.js still exist but now operate on the new schema. `getAppSetting` queries without org_id filter so may return unexpected results. Task 2 should update these or they should be deprecated in favor of `getOrgSettings`/`setOrgSetting`.

## Review Fix Cycle 1

- **Fix 1:** Updated `lib/settings.d.ts` with proper function signatures reflecting the new orgId parameter
- **Fix 2:** Removed inner try/catch from app_settings migration -- errors now propagate from the destructive rename/create/insert/drop sequence. Also changed `REFERENCES organizations(id)` to `DEFAULT 1` per reviewer suggestion (avoids FK constraint issue during migration when org may not exist yet)

## Build Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors
- Next.js build: `npx next build` completes successfully, all pages compile
