# Task 4 Implementation — Case Assignment UI: case creation dialog + case detail reassignment

## Changes

### Modified: `src/components/legal-hub/new-case-dialog.tsx`
- **Imports:** Added `useEffect` from react, `useSession` from `next-auth/react`
- **Interface:** Added local `OrgMember` interface (`user_id`, `name`, `email`, `role`)
- **Session:** Added `useSession()` hook, derived `isAdmin` (`orgRole !== 'member'`) and `currentUserId`
- **State:** Added `assignedTo` (string) and `members` (OrgMember array)
- **useEffect (line 41-58):** When dialog opens and user is admin, fetches `GET /api/org/members` to populate member list. Sets default `assignedTo` to current user's ID.
- **reset():** Now also clears `assignedTo` and `members`
- **handleSubmit (line 93-103):** Builds body object; if admin and `assignedTo` is set, includes `assigned_to: Number(assignedTo)` in POST body
- **Render (line 179-196):** After Case Type field, renders a `<select>` labeled "Przypisany do" for admins when members are loaded. Members see no picker.

### Modified: `src/components/legal-hub/case-metadata-form.tsx`
- **Imports:** Added `useEffect` from react, `useSession` from `next-auth/react`
- **Interface:** Added local `OrgMember` interface
- **Session:** Added `useSession()` hook, derived `isAdmin`
- **State:** Added `members` (OrgMember array) and `reassigning` (boolean)
- **useEffect (line 48-57):** On mount, if admin, fetches `GET /api/org/members`
- **handleReassign (line 59-78):** PATCHes `/api/legal-hub/cases/${caseId}` with `{ assigned_to: Number(newUserId) }`, shows toast, calls `onSaved()` to re-fetch case data
- **View mode (line 374-392):** Added "Przypisany do" as the FIRST field in the metadata grid. Admin sees a `<select>` dropdown with org members (current assignee pre-selected); member sees read-only text (`assigned_to_name` or em-dash)

### Modified: `src/components/legal-hub/case-card.tsx`
- **Import:** Added `User` icon from `lucide-react`
- **Render (line 71-76):** Added assignee name display in the court/date info row. Shows a small `User` icon + `assigned_to_name` when present.

## Integration Notes
- INTEGRATION: Consumes `assigned_to` and `assigned_to_name` fields from the `LegalCase` type (added by Task 1)
- INTEGRATION: Sends `assigned_to` in POST body to Task 2's case creation API
- INTEGRATION: Sends `assigned_to` in PATCH body to Task 2's case update API
- All member fetching uses `GET /api/org/members` (existing endpoint, returns `{ members: [{ user_id, name, email, role }] }`)
- TypeScript compiles cleanly with no errors
