# Task 3 Complete -- Super-Admin Token Usage Dashboard

## Files Changed

- **Created:** `src/app/api/admin/token-usage/route.ts` -- GET endpoint, `requireSuperAdmin` guard, calls `getTokenUsageSummary()`, returns JSON `{ usage: [...] }` sorted by estimatedCostUsd DESC
- **Created:** `src/app/(admin)/admin/token-usage/page.tsx` -- Server component, super-admin guard (redirect if not), direct DB call, HTML table with totals row and empty state
- **Modified:** `src/app/(admin)/layout.tsx` (line 19) -- Added "Token Usage" nav link after "Users"

## Design Decisions

- **Server component with direct DB call** (not client-side API fetch) -- matches the pattern of `admin/users/page.tsx` which queries the DB directly in the server component. The API endpoint exists for potential client-side or external usage.
- **Plain HTML table with Tailwind** -- no shadcn/ui Table component exists in this codebase; all admin pages use `<table>` with consistent class names (`rounded-lg border overflow-hidden`, `bg-muted/50` thead, `divide-y` tbody, `hover:bg-muted/30` rows).
- **Total row uses reduce** -- sums all numeric columns across all rows with null-coalescing for safety.
- **tabular-nums** class on numeric cells for aligned digits.
- **Key is `userId-orgId`** composite -- the DB helper groups by `(user_id, org_id)` so a user in multiple orgs gets separate rows.

## Exports / Integration Points

- API route: `GET /api/admin/token-usage` -- returns `{ usage: TokenUsageRow[] }`
- Page: `/admin/token-usage` -- accessible via admin nav
- DEPENDENCY: Relies on `getTokenUsageSummary()` from Task 1 (already exported in `src/lib/db-imports.ts`)

## Success Criteria Verification

1. Super admin navigates to `/admin/token-usage` -- page renders with table
2. Non-super-admin -- redirected by layout guard (to `/`) and page guard; API returns 401/403
3. Total row -- computed via reduce, sums all user rows
4. Empty state -- "No token usage data recorded yet." shown when array is empty, total row hidden
