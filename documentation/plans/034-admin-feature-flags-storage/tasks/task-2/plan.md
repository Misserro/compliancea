# Task 2 — Implementation Plan

## Overview

Add feature toggle panel to admin panel (per-org) and apply frontend feature gating to sidebar navigation.

## Codebase Analysis

### Task 1 Deliverables (already merged)
- `src/lib/feature-flags.ts` — `FEATURES` constant: `['contracts', 'legal_hub', 'template_editor', 'court_fee_calculator', 'policies', 'qa_cards']`, `Feature` type, `requireOrgFeature()` guard
- `src/app/api/admin/orgs/[id]/features/route.ts` — GET returns `{ contracts: true, ... }`, PUT accepts partial `{ contracts: false }`
- `src/auth.ts` — `orgFeatures?: string[]` already on Session and JWT types; populated in both jwt() branches; super admins get all features

### Existing Patterns
- **Admin org list** (`admin-org-list.tsx`): Table with per-row expansion via `<React.Fragment>`. `OrgMembersPanel` follows a collapsible pattern: button toggles `expanded` state, fetches data on expand, renders inside a `<tr><td colSpan={6}>` below the org row.
- **Sidebar** (`app-sidebar.tsx`): Uses `canView(resource)` for permission-based gating. `sessionData?.user?.isSuperAdmin` already checked for admin panel link.
- **Switch component** exists at `src/components/ui/switch.tsx` (Radix-based).

### Feature-to-Sidebar Mapping
| Feature | Sidebar Section | What to hide |
|---------|----------------|--------------|
| `contracts` | Contract Hub group | Entire "Contract Hub" section (Contracts + Obligations) |
| `legal_hub` | Legal Hub group | Entire "Legal Hub" section (Cases + Templates) |
| `template_editor` | (sub-feature of legal_hub) | No separate sidebar item — gated at page level only |
| `court_fee_calculator` | (embedded in case form) | No sidebar item — gated at component level only |
| `policies` | Documents Hub > Policies | "Policies" item within Documents Hub |
| `qa_cards` | (no sidebar item) | No sidebar item — gated at API/page level only |

Only `contracts`, `legal_hub`, and `policies` need sidebar gating. The others (`template_editor`, `court_fee_calculator`, `qa_cards`) have no dedicated sidebar entries.

## Files to Create/Modify

### 1. `src/components/admin/org-feature-flags.tsx` (NEW)

**Purpose**: Expandable feature toggle card for each org row in admin panel.

**Design**:
- Follows `OrgMembersPanel` pattern: collapsible section with `expanded` state
- On expand: `GET /api/admin/orgs/{id}/features` to load current state
- Renders 6 switches (one per feature) with human-readable labels
- On toggle: `PUT /api/admin/orgs/{id}/features` with `{ [feature]: newValue }`
- Optimistic UI: toggle immediately, revert on error with toast

**Feature labels map**:
```ts
const FEATURE_LABELS: Record<string, string> = {
  contracts: "Contracts",
  legal_hub: "Legal Hub",
  template_editor: "Template Editor",
  court_fee_calculator: "Court Fee Calculator",
  policies: "Policies",
  qa_cards: "Q&A Cards",
};
```

**Props**: `{ orgId: number }`

### 2. `src/app/(admin)/admin/page.tsx` (MODIFY)

**Change**: Pass org features section rendering to `AdminOrgList` — no page-level change needed since the feature flags panel lives inside the per-org expansion area (same as members panel). The `AdminOrgList` component handles its own expansion rows.

Actually, looking at the architecture: `admin/page.tsx` currently passes `orgs` to `AdminOrgList`, which renders the table with per-row expansion. The `OrgFeatureFlags` component will be added as another expansion row inside `AdminOrgList`, alongside `OrgMembersPanel`. No changes needed to `admin/page.tsx`.

### 3. `src/components/admin/admin-org-list.tsx` (MODIFY)

**Change**: Add `OrgFeatureFlags` expansion panel below `OrgMembersPanel` for each org row.

- Import `OrgFeatureFlags` component
- Add another `<tr><td colSpan={6}>` with `<OrgFeatureFlags orgId={org.id} />` after the members panel row

### 4. `src/components/layout/app-sidebar.tsx` (MODIFY)

**Change**: Add feature gating alongside existing permission gating.

- Add `canAccessFeature(feature)` helper that checks `sessionData?.user?.orgFeatures` — returns `true` if super admin or if feature is in array (or array is undefined for graceful fallback)
- Gate "Contract Hub" group: wrap with `canAccessFeature('contracts')`
- Gate "Legal Hub" group: wrap with `canAccessFeature('legal_hub')`
- Gate "Policies" item in Documents Hub: add `feature` field to the item config and filter by it

### 5. `src/types/next-auth.d.ts` — NOT NEEDED

Task 1 already added `orgFeatures?: string[]` to both Session and JWT types directly in `src/auth.ts` via module augmentation. No separate `.d.ts` file needed.

## Implementation Order

1. `org-feature-flags.tsx` — new component (independent)
2. `admin-org-list.tsx` — add feature flags panel to org rows
3. `app-sidebar.tsx` — add feature gating

## Edge Cases

- **Super admin sidebar**: `canAccessFeature()` returns `true` when `isSuperAdmin` — all items visible
- **Undefined orgFeatures**: treat as all-enabled (matches Task 1's JWT behavior for stale sessions)
- **Org isolation**: each `OrgFeatureFlags` instance fetches for its own `orgId` — no cross-org leaking
- **Concurrent toggles**: each PUT is independent per-feature; no race condition risk
