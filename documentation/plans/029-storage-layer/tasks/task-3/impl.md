## Task 3 Complete -- S3 Config Settings UI

### Files Created
- **`src/components/settings/storage-section.tsx`** -- New `"use client"` component. Named export `StorageSection` with props `{ orgId: number; orgRole: string }`. Returns null for non-owner/admin roles. Fetches config from `GET /api/org/storage` on mount. Two UI states: not-configured (form with 5 fields) and configured (summary with Edit/Remove buttons). Save calls `PUT /api/org/storage`, showing inline error on 400 or success toast on 200. Remove uses AlertDialog confirmation then calls `DELETE /api/org/storage`. Loading states on Save and Remove buttons via `Loader2` spinner.

### Files Modified
- **`src/app/(app)/settings/page.tsx`** -- Added `useSession` import from `next-auth/react`, `StorageSection` import. Called `useSession()` in component body. Renders `<StorageSection orgId={Number(sessionData?.user?.orgId)} orgRole={sessionData?.user?.orgRole || ""} />` after `<GDriveSection />`.

### Key Implementation Details
- **Role gating**: `StorageSection` returns `null` if `orgRole` is not `owner` or `admin`. No S3 section visible to members.
- **Configured state summary**: Shows bucket, region, access key ID (as returned by API -- already masked by backend for secret), and endpoint if set. Secret always shown as `*****` in summary.
- **Edit flow**: Pre-fills form with non-secret values from current config. Secret key field is always blank (user must re-enter). Cancel returns to summary view.
- **Error handling**: PUT 400 errors shown as inline red text below the Save button (not toast). Network/unexpected errors use toast.error.
- **AlertDialog for Remove**: Matches the pattern from `org/members/page.tsx` -- destructive action styled with `bg-destructive text-white hover:bg-destructive/90`.
- **No ORG_ROLE_COLORS usage**: The task mentioned this pattern but the S3 config UI has no role-colored elements. Pattern was noted but not needed.
- **TypeScript clean**: `npx tsc --noEmit` passes with zero errors.

### INTEGRATION Notes
- Depends on Task 1 API routes: `GET /api/org/storage`, `PUT /api/org/storage`, `DELETE /api/org/storage`
- No dependency on Task 2 (storage driver)
