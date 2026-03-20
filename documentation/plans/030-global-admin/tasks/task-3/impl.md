# Task 3 Implementation Notes -- Admin UI

## Changes Made

### src/lib/constants.ts (modified)
- Added `ORG_STATUS_COLORS` color map with entries for `active` (green), `pending_deletion` (red), `expired` (neutral/muted)
- Follows existing pattern: both light and dark mode classes per entry
- Placed above `ORG_ROLE_COLORS` for logical grouping

### src/app/(admin)/layout.tsx (new file -- server component)
- Calls `await auth()` with isSuperAdmin guard; redirects to `/login` if no session, `/` if not super admin
- Minimal wrapper: header with "Admin Panel" heading + "Back to App" link to `/dashboard`
- NO `<html>` or `<body>` tags -- root layout at `src/app/layout.tsx` already provides those with ThemeProvider, SessionProvider, Toaster
- NO AppSidebar, no org context, no ensureDb (auth() handles DB internally)

### src/app/(admin)/admin/page.tsx (new file -- server component)
- Defense-in-depth: calls `auth()` + isSuperAdmin guard (alongside layout guard)
- Calls `ensureDb()` then `getAllOrganizations()` directly via db-imports (avoids internal API fetch complexity)
- Enriches raw org data with status/daysUntilDeletion computation (same logic as GET /api/admin/orgs)
- Passes typed `Org[]` array to `<AdminOrgList>` client component
- Page heading: "Organizations" with description

### src/components/admin/admin-org-list.tsx (new file -- "use client" component)
- Receives `orgs` prop from server component
- Renders org table with columns: Name, Slug, Members, Status, Created, Actions
- Status badges use `Badge` with `outline` variant + `ORG_STATUS_COLORS` class from constants
- Inline editing: Edit button sets editing state, shows Input fields for name/slug with Save/Cancel buttons
- PATCH /api/admin/orgs/[id] for save, with client-side validation (name required, slug regex)
- Delete: AlertDialog with org name, member count, 30-day retention warning
- DELETE /api/admin/orgs/[id] on confirm
- Restore: Button calls POST /api/admin/orgs/[id]/restore for pending_deletion orgs
- All mutations call `router.refresh()` after success
- "Create organization" button opens CreateOrgDialog
- toast from sonner for success/error feedback
- Icons imported individually from lucide-react: Plus, Pencil, Trash2, RotateCcw, Check, X

### src/components/admin/create-org-dialog.tsx (new file -- "use client" component)
- Controlled Dialog via open/onOpenChange/onCreated props
- Form fields: Organization Name (required), Slug (auto-generated from name, editable), Owner Email (optional)
- Slug auto-generation: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
- Manual slug editing disables auto-generation (tracked via `slugManuallyEdited` state)
- Client-side validation: name required, slug format check (`/^[a-z0-9-]+$/`)
- POST /api/admin/orgs with { name, slug, ownerEmail? }
- Two UI states:
  1. Form state: name/slug/email inputs + Create/Cancel buttons + inline error display
  2. Success state with invite URL: shows Input (readonly) + Copy button (navigator.clipboard.writeText) + Done button
- Inline error display in destructive/10 bg for 400/409 responses
- Form resets on close or after Done

## Patterns Followed
- AlertDialog for destructive actions (no window.confirm) per design-system.md
- Badge with cn() and ORG_STATUS_COLORS from constants per design-system.md
- "use client" on all interactive components per design-system.md
- navigator.clipboard.writeText for copy (same pattern as members page)
- toast from sonner for feedback (same pattern as members page)
- router.refresh() after mutations (server component re-fetch pattern)
- Table styling: rounded-lg border overflow-hidden wrapper, bg-muted/50 header, divide-y body (same as members page)
- Destructive button: bg-destructive text-white hover:bg-destructive/90 (same as members page AlertDialog)
- Icons imported individually from lucide-react
- cn() for all className merging

## Build Verification
- TypeScript: `npx tsc --noEmit` passes with zero errors
