# Task 4 Implementation Plan: Permission Management UI

## Overview

Add permission management UI controls to two existing pages:
1. `/org/members` page -- per-member permission editing via a Dialog
2. `/settings/org` page -- org default permissions section

## Files to Create/Modify

### New File: `src/components/org/member-permissions-dialog.tsx`

A standalone Dialog component for viewing/editing a single member's permissions.

**Props:** `member: { userId: number; name: string | null; email: string; role: string }`, `open: boolean`, `onOpenChange: (open: boolean) => void`, `onPermissionsChanged?: () => void`

**Behavior:**
- On open: `GET /api/org/members/[id]/permissions` to load current permissions
- Displays 5 rows (one per resource) using `RESOURCES` and `RESOURCE_LABELS` from `@/lib/permissions`
- Each row: resource label + Select dropdown with options: none, view, edit, full
- On Select change: immediately `PUT /api/org/members/[id]/permissions` with `{ permissions: { [resource]: newLevel } }` (partial update)
- Update local state optimistically, show toast on success/failure
- "Reset to defaults" Button at bottom: calls `POST /api/org/members/[id]/permissions/reset`, updates all local state from response
- Loading skeleton while fetching
- Only shown for members with role === 'member' (owners/admins bypass permissions)

**UI components used:** Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button, Badge (for permission level colors)

### Modified: `src/app/(app)/org/members/page.tsx`

**Changes:**
- Import `MemberPermissionsDialog` from `@/components/org/member-permissions-dialog`
- Import `Shield` icon from lucide-react (for permissions button)
- Add state: `permDialogMember` (Member | null) to track which member's dialog is open
- In table header: no new column needed -- add "Permissions" button in existing Actions column
- In table body: for each member with role === 'member', render a Shield icon Button in the Actions cell (only when `canManage` is true)
- Clicking the button sets `permDialogMember` to that member, opening the dialog
- Render `<MemberPermissionsDialog>` once at page level, controlled by `permDialogMember` state

### Modified: `src/app/(app)/settings/org/page.tsx`

**Changes:**
- Import `RESOURCES`, `RESOURCE_LABELS`, `PermissionLevel` from `@/lib/permissions`
- Import Select components, Card, CardContent, CardHeader, CardTitle, Shield icon
- Add state: `defaults` (Record<string, string> | null), `defaultsLoading` (boolean), `savingResource` (string | null)
- Add `loadDefaults` callback: `GET /api/org/permissions` on mount (only if canEdit)
- Add `handleDefaultChange(resource, action)`: `PUT /api/org/permissions` with `{ defaults: { [resource]: action } }` -- auto-save on change
- Render a new Card section below the existing General card (only when `canEdit`):
  - CardTitle: Shield icon + "Default Member Permissions"
  - Description: "Default permission levels applied to new members when they join."
  - Table/list of 5 rows: resource label + Select dropdown (none/view/edit/full)
  - Show loading skeleton while fetching
  - Toast on success/error

## Permission Level Badge Colors

Define a `PERMISSION_LEVEL_COLORS` map for badge styling within the dialog component (follows pattern from `ORG_ROLE_COLORS` in constants.ts):
- `none`: red-ish (destructive feel)
- `view`: neutral/gray
- `edit`: blue
- `full`: green

Will add to `src/lib/constants.ts` as `PERMISSION_LEVEL_COLORS` to follow existing pattern.

## API Contracts (from Task 3 routes)

- `GET /api/org/members/[id]/permissions` -> `{ permissions: { documents: 'full', ... } }`
- `PUT /api/org/members/[id]/permissions` body `{ permissions: { resource: action } }` -> `{ permissions: { ... } }`
- `POST /api/org/members/[id]/permissions/reset` -> `{ permissions: { ... } }`
- `GET /api/org/permissions` -> `{ defaults: { documents: 'full', ... } }`
- `PUT /api/org/permissions` body `{ defaults: { resource: action } }` -> `{ defaults: { ... } }`

## Success Criteria Mapping

1. "Org admin can view current permission level for each member per resource" -- Dialog shows all 5 resources with current levels
2. "Changing a permission level via dropdown calls the API and updates immediately" -- Select onChange -> PUT call -> state update
3. "Reset to defaults restores member to org defaults" -- Reset button -> POST reset -> state refresh
4. "Org default permissions section in settings shows current defaults with editable dropdowns" -- New Card on settings page
5. "Changing org defaults via UI persists across page refresh" -- auto-save PUT on change
6. "Non-admin members see no permission controls (canManage check)" -- all permission UI gated on canManage/canEdit

## Risks

- Members page could get busy with the extra button per row -- mitigated by using a compact icon button (Shield) that only appears for member-role users
- Dialog opening triggers a fetch per member -- acceptable since it's on-demand, not pre-loaded for all members
