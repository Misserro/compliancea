# Task 5 Implementation Plan: UI Feature Hiding

## Overview

Conditionally hide navigation items and action buttons based on `session.user.permissions`. This is a soft UI gate — API enforcement (Task 2) is the hard gate.

## Files to Modify

### 1. `src/components/layout/app-sidebar.tsx` — Sidebar nav group hiding

**Changes:**
- Import `PERMISSION_LEVELS` and `PermissionLevel` from `@/lib/permissions`
- Extract `permissions` from `sessionData?.user?.permissions`
- Add `canView(resource: string)` helper: returns true if permissions is null/undefined (owner/admin/superAdmin), or if the permission level for the resource is >= 1 (view)
- Wrap each nav group in a conditional render:
  - Contract Hub group (Contracts + Obligations): `canView('contracts')`
  - Legal Hub group (Cases + Templates): `canView('legal_hub')`
  - Documents Hub group (Documents, Policies, Analyze & Process, Ask Library): `canView('documents')`
  - Note: Policies nav item lives inside Documents Hub — it will be hidden when `!canView('documents')`. Additionally, since Policies is a separate resource, we could hide just the Policies item when `!canView('policies')` while keeping other Documents Hub items visible. The task description says "Policies: show if canView('policies')" so I'll filter the Documents Hub items to also conditionally include Policies based on `canView('policies')`.
- QA Cards: no nav item currently exists in sidebar, so nothing to hide
- Dashboard and bottom standalones (Settings, Organization, Members) always visible

**Implementation detail for Documents Hub:** The Documents Hub has 4 items as an array. I'll conditionally filter this array:
  - "Documents", "Analyze & Process", "Ask Library" shown if `canView('documents')`
  - "Policies" shown if `canView('policies')`

The entire Documents Hub group is hidden if no items remain after filtering.

### 2. `src/app/(app)/documents/page.tsx` — Hide upload section

**Changes:**
- Import `useSession` (already available via parent), `PERMISSION_LEVELS`, `PermissionLevel` from `@/lib/permissions`
- Add `useSession()` hook, extract permissions
- Add `permLevel` helper
- Conditionally render `<UploadSection>` only when `permLevel(permissions, 'documents') >= 2` (edit or higher)
- Conditionally render `<ActionBar>` only when `permLevel(permissions, 'documents') >= 2` (the scan/process/retag operations are edit-level actions)

### 3. `src/components/documents/document-card.tsx` — Hide delete button

**Changes:**
- Accept optional `canDelete?: boolean` prop (default true for backward compat)
- Conditionally render the Trash2 delete button only when `canDelete` is true
- Also accept optional `canEdit?: boolean` prop for edit metadata, process, retag buttons

### 4. `src/components/documents/document-list.tsx` — Pass permission props through

**Changes:**
- Accept optional `canEdit?: boolean` and `canDelete?: boolean` props
- Pass them through to `DocTypeSection` -> `DocumentCard`

### 5. `src/app/(app)/documents/page.tsx` — Pass permission props to DocumentList

**Changes (combined with item 2 above):**
- Pass `canEdit` and `canDelete` props to `<DocumentList>` based on permission level

### 6. `src/components/contracts/contracts-tab.tsx` — Hide "Add New Contract" button

**Changes:**
- Import `useSession` from `next-auth/react` and `PERMISSION_LEVELS`, `PermissionLevel` from `@/lib/permissions`
- Add `permLevel` helper
- Extract permissions from session
- Conditionally render the "Add New Contract" button only when `permLevel(permissions, 'contracts') >= 2`

### 7. `src/components/legal-hub/legal-hub-dashboard.tsx` — Hide "New Case" button

**Changes:**
- Import `useSession` from `next-auth/react` and `PERMISSION_LEVELS`, `PermissionLevel` from `@/lib/permissions`
- Add `permLevel` helper
- Extract permissions from session
- Conditionally render the "New Case" button only when `permLevel(permissions, 'legal_hub') >= 2`

### 8. No QA Cards page exists — skip

QA Cards only has API routes, no page component in the UI. Nothing to hide.

### 9. Policies page — no create/delete buttons exist — skip

The policies page at `src/app/(app)/policies/page.tsx` has no create or delete buttons. It's a filtered view of documents. The upload for policies happens through the documents page upload section.

## Helper Pattern

```typescript
import { PERMISSION_LEVELS, PermissionLevel } from "@/lib/permissions";

const permLevel = (perms: Record<string, string> | null | undefined, resource: string) =>
  PERMISSION_LEVELS[(perms?.[resource] ?? 'full') as PermissionLevel] ?? 3;
```

This returns a numeric level (0-3). null/undefined permissions = full access (returns 3).

## Success Criteria Mapping

1. "Member with permissions.contracts='none' -> Contract Hub nav hidden" -> Sidebar `canView('contracts')` returns false when level is 0
2. "Member with permissions.documents='view' -> Documents nav visible but Upload button hidden" -> `canView('documents')` returns true (level 1 >= 1), but `permLevel >= 2` is false so UploadSection hidden
3. "Member with permissions.legal_hub='full' -> all Legal Hub UI visible and functional" -> `canView('legal_hub')` true, "New Case" visible (level 3 >= 2)
4. "Owner/admin: all nav items always visible (permissions=null bypass)" -> `canView` returns true when permissions is null
5. "Super admin: all nav items always visible" -> Super admin has permissions=null in JWT

## Risks

- The Documents Hub contains Policies as a sub-item. Need to handle the case where documents=view but policies=none — Policies nav item should be hidden but rest of Documents Hub visible.
- DocumentCard delete button is nested deep (page -> DocumentList -> DeptSection -> DocTypeSection -> DocumentCard). Prop threading is necessary.
