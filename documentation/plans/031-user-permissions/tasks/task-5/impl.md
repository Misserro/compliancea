## Task 5 Complete — UI Feature Hiding

### Files Modified

1. **`src/components/layout/app-sidebar.tsx`** (sidebar nav group hiding)
   - Added import: `PERMISSION_LEVELS`, `PermissionLevel` from `@/lib/permissions`
   - Added `permissions` extraction from `sessionData?.user?.permissions`
   - Added `canView(resource)` helper: returns true when permissions is null/undefined (owner/admin bypass), or when permission level >= 1 (view)
   - Contract Hub group: wrapped in `{canView('contracts') && (...)}`
   - Legal Hub group: wrapped in `{canView('legal_hub') && (...)}`
   - Documents Hub group: refactored from static array to filtered array with per-item resource check. Items check `canView('documents')` or `canView('policies')` depending on the nav item. Entire group hidden when filtered array is empty.
   - Dashboard and bottom standalones (Settings, Organization, Members) always visible

2. **`src/app/(app)/documents/page.tsx`** (hide upload/action bar, pass permission props)
   - Added imports: `useSession`, `PERMISSION_LEVELS`, `PermissionLevel`
   - Added `permLevel` helper (module-level)
   - Computed `canEdit` (level >= 2) and `canDelete` (level >= 3) from session permissions
   - `<UploadSection>` conditionally rendered only when `canEdit`
   - `<ActionBar>` conditionally rendered only when `canEdit`
   - `canEdit` and `canDelete` passed as props to `<DocumentList>`

3. **`src/components/documents/document-list.tsx`** (prop threading)
   - Added `canEdit?: boolean` and `canDelete?: boolean` to `DocumentListProps`, `DeptSectionProps`, `DocTypeSectionProps`
   - Added to destructuring in all three component functions
   - Included in both `sharedProps` objects
   - Passed through to `<DocumentCard>` in DocTypeSection

4. **`src/components/documents/document-card.tsx`** (hide edit/delete buttons)
   - Added `canEdit?: boolean` (default true) and `canDelete?: boolean` (default true) to `DocumentCardProps`
   - Edit metadata (Pencil) button: wrapped in `{canEdit && (...)}`
   - Retag (Tags) button: wrapped in `{canEdit && (...)}`
   - Process (Play) button: wrapped in `canEdit ? (...) : null`
   - Delete (Trash2) button: wrapped in `{canDelete && (...)}`
   - Download button: always visible (view-level action)
   - Manage contract button: always visible (view-level action)

5. **`src/components/contracts/contracts-tab.tsx`** (hide "Add New Contract")
   - Added imports: `useSession`, `PERMISSION_LEVELS`, `PermissionLevel`
   - Added `permLevel` helper, computed `canEdit` for 'contracts' resource
   - "Add New Contract" button wrapped in `{canEdit && (...)}`

6. **`src/components/legal-hub/legal-hub-dashboard.tsx`** (hide "New Case")
   - Added imports: `useSession`, `PERMISSION_LEVELS`, `PermissionLevel`
   - Added `permLevel` helper, computed `canEdit` for 'legal_hub' resource
   - "New Case" button wrapped in `{canEdit && (...)}`

### Not Modified (with rationale)

- **QA Cards page**: No UI page component exists. Only API routes at `api/qa-cards/`. Nothing to hide.
- **Policies page** (`src/app/(app)/policies/page.tsx`): No create or delete buttons exist. It's a filtered view of documents. Upload happens through the documents page.
- **QA Cards sidebar nav**: No nav item exists in the current sidebar. Nothing to hide.

### Permission Helper Pattern Used

```typescript
const permLevel = (perms: Record<string, string> | null | undefined, resource: string) =>
  PERMISSION_LEVELS[(perms?.[resource] ?? 'full') as PermissionLevel] ?? 3;
```

- Returns numeric level 0-3
- null/undefined permissions returns 3 (full access) — owner/admin/superAdmin bypass
- Missing resource key defaults to 'full' — backward compatible

### INTEGRATION Notes

- All components use `useSession()` from `next-auth/react` to access `sessionData?.user?.permissions`
- The `permissions` field in session is set by Task 2 (JWT integration): `Record<string, 'none'|'view'|'edit'|'full'>` for members, `null` for owner/admin
- These are soft UI hints only — API enforcement (Task 2) is the hard gate
- `canEdit` and `canDelete` props on DocumentCard default to `true` so existing usages outside the documents page are unaffected
