## Task 4 Complete -- Permission Management UI

- Created: `src/components/org/member-permissions-dialog.tsx` (new file)
  - Dialog component for managing per-member permissions
  - Fetches `GET /api/org/members/[id]/permissions` on open
  - 5 resource rows with Select dropdowns (none/view/edit/full)
  - Optimistic updates via `PUT /api/org/members/[id]/permissions` (partial update per resource)
  - "Reset to organization defaults" button via `POST /api/org/members/[id]/permissions/reset`
  - Loading skeleton while fetching, toast feedback on success/error
  - Uses `RESOURCES`, `RESOURCE_LABELS` from `@/lib/permissions`
  - Uses `PERMISSION_LEVEL_COLORS` from `@/lib/constants` for colored Badge in dropdowns

- Modified: `src/app/(app)/org/members/page.tsx`
  - Added import: `Shield` icon, `MemberPermissionsDialog` component
  - Added state: `permDialogMember` (Member | null)
  - Added Shield icon Button in Actions column for members with `role === 'member'` (only visible when `canManage`)
  - Rendered `MemberPermissionsDialog` once at page level, controlled by `permDialogMember` state
  - Owners/admins who are not role=member do NOT show the Shield button (they bypass permissions anyway)

- Modified: `src/app/(app)/settings/org/page.tsx`
  - Added imports: Select components, Shield icon, `RESOURCES`, `RESOURCE_LABELS`, `PERMISSION_LEVEL_COLORS`
  - Added state: `defaults`, `defaultsLoading`, `savingResource`
  - Added `loadDefaults` callback (fetches `GET /api/org/permissions` on mount when `canEdit`)
  - Added `handleDefaultChange` function (auto-save via `PUT /api/org/permissions` on Select change)
  - Added "Default Member Permissions" Card section below existing General card (only when `canEdit`)
  - 5 resource rows with Select dropdowns, optimistic updates, toast feedback

- Modified: `src/lib/constants.ts`
  - Added `PERMISSION_LEVEL_COLORS` constant (follows `ORG_ROLE_COLORS` pattern)
  - none=red, view=neutral, edit=blue, full=green

- TypeScript: compiles clean (`npx tsc --noEmit` passes with no errors)

- INTEGRATION: Task 5 (UI Feature Hiding) does not depend on this task. No shared exports introduced beyond what already exists in `@/lib/permissions` and `@/lib/constants`.
