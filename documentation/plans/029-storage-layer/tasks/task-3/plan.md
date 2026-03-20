# Task 3 Plan -- S3 Config Settings UI

## Files to Create

### `src/components/settings/storage-section.tsx` (new)
- `"use client"` directive
- Named export `StorageSection` with props `{ orgId: number; orgRole: string }`
- Early return `null` if `orgRole` is not `owner` or `admin`
- Fetch current config on mount via `GET /api/org/storage`
- Two states: **not configured** (form) and **configured** (summary + edit/remove)
- Form fields: bucket (required), region (required), accessKeyId (required), secretKey (required, type=password), endpoint (optional)
- Save: `PUT /api/org/storage` -- if 400 (test failed), show error inline; if 200, switch to configured state
- Remove: AlertDialog confirmation, then `DELETE /api/org/storage`, return to not-configured state
- Uses: Card, CardContent, CardHeader, CardTitle, Input, Label, Button, AlertDialog (full set), toast (sonner), Loader2 (lucide-react) for loading spinner
- Loading states on buttons via `isPending` guard
- Follows GDrive section pattern (Card wrapper, same structural style)

### `src/app/(app)/settings/page.tsx` (modify)
- Import `useSession` from `next-auth/react`
- Import `StorageSection` from `@/components/settings/storage-section`
- Call `useSession()` to get `sessionData`
- Extract `orgId = Number(sessionData?.user?.orgId)` and `orgRole = sessionData?.user?.orgRole`
- Render `<StorageSection orgId={orgId} orgRole={orgRole || ""} />` after `<GDriveSection />`

## UI States

1. **Loading**: Skeleton or spinner while fetching config on mount
2. **Not configured**: Form with 5 fields + Save button
3. **Configured**: Summary showing bucket, region, accessKeyId (masked as `***`), endpoint (if set). "Edit" button returns to form (pre-filled with non-secret fields). "Remove configuration" button with AlertDialog.
4. **Editing** (configured -> form): Same form but with pre-filled values (secretKey always empty -- must re-enter)
5. **Error**: Inline error message below Save button when PUT returns 400

## Patterns Followed

- GDrive section: Card wrapper, similar form layout, toast for feedback, `saving` state guard
- Members page: AlertDialog for destructive actions, ORG_ROLE_COLORS import pattern, `canManage` guard
- Design system: `cn()` for className, semantic tokens, Lucide icons individual import, `"use client"` directive
- No `window.confirm()` -- always AlertDialog

## Success Criteria Mapping

- Settings page loads with S3 section visible to owner/admin -> `orgRole` check in StorageSection
- Not configured state when no config -> initial fetch, `configured: false` response
- Save with invalid creds -> 400 from PUT, error shown inline
- Save with valid creds -> success state, bucket name displayed
- Remove with AlertDialog -> DELETE call, state reset
- Member role sees no S3 section -> early return null
- Persists across refresh -> re-fetches on mount
- Org isolation -> API routes handle this (Task 1), UI just passes orgId implicitly via session cookies

## Risks

- Settings page currently does not use `useSession` -- adding it is safe since it's already a `"use client"` component and the SessionProvider wraps the app
- No ORG_ROLE_COLORS usage needed in this component (task mentions it but there are no role-colored elements in the S3 config UI)
