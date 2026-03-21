# Task 2 — Implementation Notes

## Files Changed

### 1. `src/components/admin/org-feature-flags.tsx` (NEW)

- Follows `OrgMembersPanel` collapsible pattern: button toggles `expanded` state
- On expand: fetches `GET /api/admin/orgs/{orgId}/features`
- Renders 6 switches with human-readable labels from `FEATURE_LABELS` map
- On toggle: optimistic UI update, then `PUT /api/admin/orgs/{orgId}/features` with `{ [feature]: newValue }`
- On error: reverts to previous state with toast notification
- On success: updates from server response to ensure consistency

### 2. `src/components/admin/admin-org-list.tsx` (MODIFIED)

- Imported `OrgFeatureFlags` component
- Added feature flags expansion row (`<tr><td colSpan={7}>`) below the existing members panel row for each org
- Uses `colSpan={7}` to match existing column count (Name, Slug, Members, Status, Storage, Created, Actions)

### 3. `src/components/layout/app-sidebar.tsx` (MODIFIED)

- Added `canAccessFeature(feature)` helper inside `AppSidebar`:
  - Returns `true` if `isSuperAdmin` (super admins see all)
  - Returns `true` if `orgFeatures` is undefined (graceful fallback for stale sessions)
  - Otherwise checks `orgFeatures.includes(feature)`
- **Contract Hub**: gated with `canView('contracts') && canAccessFeature('contracts')`
- **Legal Hub**: gated with `canView('legal_hub') && canAccessFeature('legal_hub')`
- **Policies** (in Documents Hub): added `feature: "policies"` field to item config; filtered with `!item.feature || canAccessFeature(item.feature)`

## Design Decisions

- **No `next-auth.d.ts` needed**: Task 1 already added `orgFeatures?: string[]` via module augmentation in `src/auth.ts`
- **Optimistic UI for toggles**: Immediate visual feedback; reverts on API failure
- **Feature gating is additive to permissions**: Both `canView()` (permissions) and `canAccessFeature()` (feature flags) must pass — they compose with `&&`
- **Only 3 features gated in sidebar**: `contracts`, `legal_hub`, `policies` have sidebar entries. `template_editor`, `court_fee_calculator`, `qa_cards` have no dedicated sidebar items (gated at page/component level)
- **Graceful fallback**: undefined `orgFeatures` = all features enabled (matches Task 1 JWT behavior)
