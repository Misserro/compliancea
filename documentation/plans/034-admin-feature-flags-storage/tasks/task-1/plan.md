# Task 1 — Org Feature Flags: DB, API, and Backend Enforcement

## Implementation Plan

### 1. `lib/db.js` — Database Layer

**Migration (inside `initDb()`):**
- Add `org_features` table after the Permission tables (Plan 031) section:
  ```sql
  CREATE TABLE IF NOT EXISTS org_features (
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    feature TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, feature)
  )
  ```
- Placed in a clearly labeled `// ── Org Feature Flags (Plan 034) ──` section

**New DB functions (at end of file, labeled section):**

- `getOrgFeatures(orgId)` — Returns all rows from `org_features` WHERE `org_id = ?`. Returns array of `{feature, enabled}`.
- `setOrgFeature(orgId, feature, enabled)` — `INSERT OR REPLACE INTO org_features (org_id, feature, enabled, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`. Calls `saveDb()`.

### 2. `src/lib/feature-flags.ts` — Feature Constants & Guard

**Exports:**

- `FEATURES` — Static array: `['contracts', 'legal_hub', 'template_editor', 'court_fee_calculator', 'policies', 'qa_cards']`
- `getOrgFeaturesFromDb(orgId: number): string[]` — Calls `getOrgFeatures(orgId)` from db-imports, applies opt-out logic: any feature NOT in the DB or with `enabled = 1` is considered enabled. Returns array of enabled feature keys.
- `requireOrgFeature(feature: string)` — Mirrors `requireSuperAdmin` pattern. Reads session via `auth()`, checks `session.user.isSuperAdmin` (bypass if true), then checks `session.user.orgFeatures` includes the feature. Returns `NextResponse` 401/403 or `null`.

### 3. `src/lib/db-imports.ts` — Re-export new DB functions

Add `getOrgFeatures` and `setOrgFeature` to the existing export list.

### 4. `src/app/api/admin/orgs/[id]/features/route.ts` — Admin API

**GET handler:**
- Protected by `requireSuperAdmin`
- Calls `getOrgFeaturesFromDb(orgId)` to get enabled features list
- Returns object with all 6 features as keys, boolean values: `{ contracts: true, legal_hub: true, ... }`
- Features not in DB default to `true` (opt-out model)

**PUT handler:**
- Protected by `requireSuperAdmin`
- Accepts JSON body like `{ contracts: false, legal_hub: true }`
- Validates that all keys are in `FEATURES` array
- Calls `setOrgFeature()` for each provided key
- Returns updated features map

### 5. `src/auth.ts` — JWT Enrichment

**Changes to `jwt()` callback:**
- Add `orgFeatures` to JWT type declaration (both `Session` and `JWT` interfaces)
- In the first sign-in branch (`if (user)`): after loading permissions, call `getOrgFeaturesFromDb(orgId)` and set `token.orgFeatures`
- In the subsequent request branch (`else if`): after refreshing permissions, call `getOrgFeaturesFromDb(token.orgId)` and set `token.orgFeatures`
- Super admins: set `token.orgFeatures = FEATURES` (all features always enabled)
- In `session()` callback: copy `token.orgFeatures` to `session.user.orgFeatures`

### Key Design Decisions

- **Opt-out model**: absence of row = enabled. `getOrgFeaturesFromDb` iterates all `FEATURES` and only marks as disabled if there's an explicit `enabled = 0` row.
- **Super admin bypass**: in `requireOrgFeature()`, check `isSuperAdmin` first → return null (allow). Also in JWT, super admins always get full `FEATURES` array.
- **No saveDb() in GET paths**: only PUT/write operations call `saveDb()`.
- **DB section clearly labeled**: `// ── Org Feature Flags (Plan 034) ──` to avoid conflicts with Task 3.
