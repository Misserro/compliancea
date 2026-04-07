## Task 2 Complete -- Contracts Hub route migration + /contracts dashboard

### Files Created
- `src/app/(app)/contracts/page.tsx` -- REPLACED: new Contracts hub dashboard (KPI cards: total contracts, active contracts, overdue obligations; detail panels: contracts expiring soon, upcoming obligations)
- `src/app/(app)/contracts/list/page.tsx` -- NEW: existing contracts list moved from `/contracts`
- `src/app/(app)/contracts/list/new/page.tsx` -- NEW: contract form moved from `/contracts/new`
- `src/app/(app)/contracts/list/new/ContractsNewForm.tsx` -- NEW: moved from `/contracts/new/ContractsNewForm.tsx`, updated `router.push("/contracts")` -> `router.push("/contracts/list")` and `Link href="/contracts"` -> `Link href="/contracts/list"`
- `src/app/(app)/contracts/obligations/page.tsx` -- NEW: obligations page moved from `/obligations`

### Files Deleted
- `src/app/(app)/contracts/new/page.tsx` -- moved to `contracts/list/new/page.tsx`
- `src/app/(app)/contracts/new/ContractsNewForm.tsx` -- moved to `contracts/list/new/ContractsNewForm.tsx`
- `src/app/(app)/obligations/page.tsx` -- moved to `contracts/obligations/page.tsx`
- `src/app/(app)/obligations/` -- directory removed (empty)

### Redirects (written to tasks/task-2/redirects.json, NOT applied to next.config.mjs)
- `/obligations` -> `/contracts/obligations` (permanent)
- `/contracts/new` -> `/contracts/list/new` (permanent)

Lead will consolidate all redirect entries into next.config.mjs after tasks 1, 2, 3 complete.

### Dashboard Implementation Details
- Client component, fetches from `/api/dashboard` -- uses `contracts` section (total, active, expiringSoon) and `obligations` section (total, active, overdue, upcoming)
- Follows exact KpiCard pattern from `src/app/(app)/dashboard/page.tsx` (inline component, same props, same styling)
- Layout: `p-6 max-w-6xl mx-auto space-y-8` (matches global dashboard)
- Permission gated: checks `canView('contracts')` using session permissions (same pattern as global dashboard)
- Links point to `/contracts/list` (for contract items) and `/contracts/obligations` (for obligation items)

### INTEGRATION NOTES
- Task 4 (sidebar): will need to update sidebar links to point to `/contracts/list` and `/contracts/obligations`
- Task 5 (link sweep): `dashboard/page.tsx` still has `href="/obligations"` (line 111), `href="/contracts"` (line 119), `router.push("/obligations")` (line 176), `router.push("/contracts")` (line 216) -- these need updating in Task 5
- Task 5: `documents/page.tsx` has `router.push("/obligations")` (line 446) -- needs updating in Task 5
- Task 5: `app-sidebar.tsx` has `href="/obligations"` -- Task 4 will handle this

### TypeScript Status
- All source files compile cleanly
- `.next/types/validator.ts` has stale cache entries referencing deleted paths -- will auto-resolve on next build/dev
