# Task 4 Plan — Case Assignment UI: case creation dialog + case detail reassignment

## Overview
Update three UI components to surface the `assigned_to` / `assigned_to_name` fields added by Tasks 1-2:
1. **NewCaseDialog** — admin member picker for initial assignment
2. **CaseMetadataForm** (case detail Overview tab) — display assignee + admin reassignment dropdown
3. **CaseCard** — show assignee name

## Files to Modify

### 1. `src/components/legal-hub/new-case-dialog.tsx`
- Import `useSession` from `next-auth/react`
- Add state: `assignedTo` (string, user_id), `members` (array fetched from `/api/org/members`)
- On dialog open (when `open` flips to true), if admin/owner, fetch `/api/org/members` and populate members list
- Render a `<select>` after the Case Type field, labeled "Przypisany do" (Assigned to), only when `orgRole !== 'member'`
- Default selection: current user's ID (`session.user.id`)
- Include `assigned_to` in the POST body (as a number) when admin submits
- Add `assignedTo` and `members` to the `reset()` function
- Pattern: use native `<select>` element (consistent with existing case_type selector in same file and type filter in legal-hub-dashboard.tsx)

### 2. `src/components/legal-hub/case-metadata-form.tsx`
- Import `useSession` from `next-auth/react`
- Import `toast` (already imported)
- In **view mode**, add a new field row "Przypisany do" showing `legalCase.assigned_to_name` (or em-dash if null)
- For admin/owner users in view mode: render the field as a `<select>` dropdown with org members, showing current assignee as selected. On change, immediately PATCH `/api/legal-hub/cases/${caseId}` with `{ assigned_to: selectedUserId }` and call `onSaved()` to re-fetch.
- For member users: render read-only text display
- Fetch members list on mount (only for admin/owner) via `/api/org/members`
- Place the "Przypisany do" field as the first field in the metadata grid (prominent position)

### 3. `src/components/legal-hub/case-card.tsx`
- Import `User` icon from lucide-react (consistent with existing icon usage)
- In the bottom info row (court + created date area), add assignee name display: `legalCase.assigned_to_name`
- Show as a small text element: "Assigned: [name]" next to existing court/date info
- Only render if `assigned_to_name` is not null

## Key Patterns Followed
- `useSession()` from `next-auth/react` for client components (same as legal-hub-dashboard.tsx)
- `sessionData?.user?.orgRole` for role checking (same pattern as org/members page)
- `sessionData?.user?.id` for current user ID
- Native `<select>` elements (NOT shadcn Select — no select.tsx exists, and all existing selects in legal-hub use native HTML)
- `GET /api/org/members` returns `{ members: [{ user_id, name, email, role }] }`
- `PATCH /api/legal-hub/cases/[id]` with `{ assigned_to: number }` for reassignment
- `toast.success()` / `toast.error()` from sonner for feedback (used in case-metadata-form.tsx)

## Success Criteria Mapping
1. Admin creating a case sees member picker defaulting to self -- NewCaseDialog changes
2. Member creating a case has no picker -- conditional render on orgRole
3. Case detail shows "Przypisany do: [name]" -- CaseMetadataForm view mode
4. Admin sees reassignment dropdown, on change case re-fetches -- CaseMetadataForm admin select
5. Member sees read-only assignee -- CaseMetadataForm member view
6. Case card shows assignee name -- CaseCard changes
7. Member case list shows only their cases -- already handled by API (Task 2), no UI change needed

## Risks
- Members list fetch could fail silently -- will handle with fallback (show current user only, or disable picker)
- Race condition: if admin reassigns while metadata form is in edit mode, the edit save could overwrite. Mitigation: reassignment is separate from the edit form (inline select in view mode only).
