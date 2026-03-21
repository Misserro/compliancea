# Task 1 — Implementation Notes

## Files Changed

### 1. `lib/db.js`
- **Migration**: Added `org_features` table (lines ~737-747) in a clearly labeled `// ── Org Feature Flags (Plan 034) ──` section, placed BEFORE the Permission tables section to avoid conflicts with Task 3.
- **Functions** (end of file):
  - `getOrgFeatures(orgId)` — returns `[{feature, enabled}]` rows
  - `setOrgFeature(orgId, feature, enabled)` — upsert via `ON CONFLICT ... DO UPDATE`

### 2. `src/lib/db-imports.ts`
- Re-exported `getOrgFeatures` and `setOrgFeature` in a labeled `// Org Feature Flags (Plan 034)` section.

### 3. `src/lib/feature-flags.ts` (NEW)
- `FEATURES` constant: `['contracts', 'legal_hub', 'template_editor', 'court_fee_calculator', 'policies', 'qa_cards']`
- `Feature` type derived from `FEATURES`
- `requireOrgFeature(feature, session)` — mirrors `requireSuperAdmin` pattern:
  - Returns 401 if no session
  - Returns null (allow) if `isSuperAdmin`
  - Returns null if `orgFeatures` is undefined (graceful for stale sessions / first deploy, per lead feedback)
  - Returns 403 if feature not in `orgFeatures`

### 4. `src/app/api/admin/orgs/[id]/features/route.ts` (NEW)
- **GET**: Returns `{ contracts: true, legal_hub: true, ... }` for all 6 features (opt-out: absent = enabled)
- **PUT**: Accepts partial update `{ contracts: false }`, validates keys against `FEATURES`, persists via `setOrgFeature()`
- Both protected by `requireSuperAdmin`

### 5. `src/auth.ts`
- Type augmentation: `orgFeatures?: string[]` added to BOTH `Session.user` and `JWT` interfaces
- Import: added `getOrgFeatures` from db-imports and `FEATURES` from feature-flags
- JWT callback — BOTH branches enriched:
  - Super admin: `token.orgFeatures = [...FEATURES]` (all features always)
  - Has orgId: queries DB, builds disabled set, filters `FEATURES`
  - No orgId: defaults to all features enabled
- Session callback: `session.user.orgFeatures = token.orgFeatures`

## Design Decisions
- **Opt-out model**: No row = enabled. Only `enabled = 0` rows disable features.
- **Super admin bypass**: Checked BEFORE `getOrgFeatures` call in JWT (avoids undefined orgId issue).
- **Undefined orgFeatures = all enabled**: Per lead feedback, stale sessions before re-login won't lock users out.
- **DB section clearly labeled**: `// ── Org Feature Flags (Plan 034) ──` — Task 3 can safely add its own section.
