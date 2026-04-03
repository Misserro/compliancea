# Task 3 Plan -- Super-Admin Token Usage Dashboard

## Files to Create/Modify

### 1. `src/app/api/admin/token-usage/route.ts` (NEW)
- GET endpoint following exact pattern from `src/app/api/admin/orgs/route.ts`
- `export const runtime = "nodejs";`
- `auth()` for session, `requireSuperAdmin(session)` guard at top
- `await ensureDb()` before DB access
- Call `getTokenUsageSummary()` with no filters
- Return `NextResponse.json({ usage: data })` (already sorted by estimatedCostUsd DESC from the DB helper)
- Wrap in try/catch, return 500 on error

### 2. `src/app/(admin)/admin/token-usage/page.tsx` (NEW)
- Server component (async function), following pattern from `admin/users/page.tsx`
- `auth()` session, redirect to `/login` if no session, redirect to `/` if not super admin
- `await ensureDb()`, call `getTokenUsageSummary()` directly (server component, no need for API fetch)
- Render page with:
  - Header: h2 "Token Usage" + subtitle
  - HTML table matching exact style from `admin-user-list.tsx`: `rounded-lg border overflow-hidden`, `w-full text-sm`, `bg-muted/50` thead, `divide-y` tbody
  - Columns: User, Email, Organization, Claude Input Tokens, Claude Output Tokens, Voyage Tokens, Est. Cost (USD)
  - Format token numbers with `toLocaleString()`, cost with `$X.XXXX` (4 decimals)
  - Total row at bottom: bold, `bg-muted/50`, summing all numeric columns
  - Empty state: single row spanning all columns, centered text "No token usage data recorded yet."

### 3. `src/app/(admin)/layout.tsx` (MODIFY)
- Add "Token Usage" nav link after "Users" link, same style: `<Link href="/admin/token-usage" className="text-muted-foreground hover:text-foreground transition-colors">Token Usage</Link>`

## Key Decisions
- Use server component with direct DB call (not client-side fetch) -- matches the pattern of `admin/users/page.tsx` which queries DB directly in the server component
- Keep the API endpoint available for potential client-side usage but the page itself calls the DB helper directly
- No client component needed -- this is a read-only table with no interactivity
- Use plain HTML table with Tailwind (no shadcn Table component exists in this codebase)

## Success Criteria Mapping
1. Super admin navigates to `/admin/token-usage` -- served by the new page, protected by layout guard + page guard
2. Non-super-admin gets redirect -- handled by both layout.tsx (existing) and page-level guard
3. Total row sums correctly -- computed in the server component by reducing over the data array
4. Empty state -- conditional render when data array is empty
