# Task 3 Implementation Plan -- Admin UI

## Overview

Create the admin panel UI as a new `(admin)` route group with org list table, create org dialog, soft-delete AlertDialog, and restore functionality.

## Files to Create

### 1. `src/app/(admin)/layout.tsx` (new file -- server component)

- Import `auth` from `@/auth`, `redirect` from `next/navigation`
- Call `await auth()` -- if `!session?.user` redirect to `/login`, if `!session.user.isSuperAdmin` redirect to `/`
- Minimal wrapper: just a `<div>` with padding/container styling and a simple header ("Admin Panel" heading + "Back to App" link)
- NO `<html>` or `<body>` tags -- root layout at `src/app/layout.tsx` already provides those along with ThemeProvider, SessionProvider, Toaster
- NO `AppSidebar`, no org context
- No `ensureDb()` needed -- `auth()` handles DB initialization internally

### 2. `src/app/(admin)/admin/page.tsx` (new file -- server component + client island)

This page needs server-side data fetching but also interactive client components (dialogs, buttons). Strategy: **server component page** that fetches org data and passes it to a `"use client"` child component.

- Server component calls `await auth()` + isSuperAdmin guard (defense-in-depth)
- Fetches orgs by calling `GET /api/admin/orgs` using internal fetch with cookie forwarding (via `headers()` from `next/headers`)
- Renders heading + "Create organization" button trigger
- Passes org data to `<AdminOrgList>` client component

**Actually, simpler approach:** Since `router.refresh()` is needed for mutations (which is a client API), the page will be a server component that imports a client component. The server component fetches data, the client component handles all interactive UI.

Split:
- `src/app/(admin)/admin/page.tsx` -- server component, fetches data, renders `<AdminOrgListClient orgs={orgs} />`
- `src/components/admin/admin-org-list.tsx` -- "use client" component with the table, all action handlers, AlertDialogs

### 3. `src/components/admin/admin-org-list.tsx` (new file -- client component)

- Receives `orgs` array as prop (initial data from server)
- Renders table: Name, Slug, Members, Status, Created, Actions
- Status badge: uses Badge with outline variant + custom class from a local color map:
  - `active` -> green (same pattern as STATUS_COLORS)
  - `pending_deletion` -> red with "X days left"
  - `expired` -> red/muted
- Actions column:
  - Active orgs: Edit button (inline), Delete button (AlertDialog trigger)
  - Pending deletion orgs: Restore button, days remaining
- "Create organization" button -> opens `CreateOrgDialog`
- Delete AlertDialog: shows org name, member count warning, 30-day data retention note
- After mutations (delete, restore, edit): call `router.refresh()` to re-fetch server component data
- Uses `toast` from sonner for success/error feedback

### 4. `src/components/admin/create-org-dialog.tsx` (new file -- client component)

- Form fields: Organization Name (required), Slug (auto-generated, editable), Owner Email (optional)
- Slug auto-generation: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
- Client-side slug validation: `/^[a-z0-9-]+$/`
- On submit: `POST /api/admin/orgs` with `{ name, slug, ownerEmail }`
- Success state: if `inviteUrl` in response, show copy-to-clipboard UI with invite link
- Error state: inline error display for 400/409 responses
- After successful creation: call `onCreated()` callback -> parent calls `router.refresh()`

## Constants Addition

Add `ORG_STATUS_COLORS` to `src/lib/constants.ts`:
```
active: green badge colors (light/dark)
pending_deletion: red badge colors (light/dark)
expired: neutral/muted colors (light/dark)
```

## Key Patterns to Follow

1. **AlertDialog for destructive actions** -- no `window.confirm()` (design-system.md)
2. **Badge with `cn()` and color maps from constants** (design-system.md)
3. **`"use client"` on all interactive components** (design-system.md)
4. **`navigator.clipboard.writeText` for copy** (members page pattern)
5. **toast from sonner for feedback** (members page pattern)
6. **router.refresh() after mutations** (task description)
7. **Destructive button style: `bg-destructive text-white hover:bg-destructive/90`** (members page pattern)
8. **Table pattern: `rounded-lg border overflow-hidden` wrapper, `bg-muted/50` header** (members page pattern)

## How Success Criteria Are Satisfied

1. **Non-super admin visiting /admin -> redirected**: Layout checks `isSuperAdmin`, redirects to `/`. Also protected by `auth.config.ts`.
2. **/admin page renders org list with correct columns and status badges**: Server component fetches from API, client component renders table with Name, Slug, Members, Status, Created, Actions.
3. **Create org form validation**: Client-side name required check + slug regex validation before submit.
4. **Invite link shown with copy button**: After POST returns `inviteUrl`, show Input + Copy button (same pattern as members page).
5. **Delete AlertDialog shows org name**: AlertDialog content interpolates `{orgName}` and `{memberCount}`.
6. **Pending-deletion orgs show days remaining + restore button**: Status badge shows "X days left", Actions column shows Restore button.
7. **Restore button calls API + page refreshes**: `POST /api/admin/orgs/[id]/restore` then `router.refresh()`.

## Risks

- Server-side fetch to own API requires passing cookies for auth. Will use `fetch()` with `headers()` from `next/headers` to forward the cookie header. If that doesn't work, can fall back to calling DB functions directly (but prefer API for consistency).
- The `(admin)` route group layout must NOT include `<html>`/`<body>` since the root layout already provides them. The task description says to include them but that's incorrect -- following the actual `(app)` layout pattern instead.
