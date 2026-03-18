# Task 1 Implementation Plan — DB schema + Case Registry API + Matter Dashboard UI

## Overview

This plan covers the foundational layer for Legal Hub: 6 new DB tables, TypeScript interfaces, two API endpoints (GET/POST /api/legal-hub/cases), and the matter dashboard UI at /legal-hub.

---

## Files to Create or Modify

### 1. `lib/db.js` — DB schema additions + helper functions

**Changes:**
- Add `db.run("PRAGMA journal_mode=WAL;")` at the top of `initDb()`, immediately after `db` is assigned
- Add 6 `CREATE TABLE IF NOT EXISTS` blocks inside `initDb()`:
  - `legal_cases`
  - `case_parties`
  - `case_documents`
  - `case_deadlines`
  - `case_templates`
  - `case_generated_docs`
- Add 8 `CREATE INDEX IF NOT EXISTS` statements for those tables (per plan README)
- Append a new section at the bottom of the file: `// ============================================\n// Legal Hub operations\n// ============================================`
- Add helpers:
  - `getLegalCases({ search, status, caseType })` — list with optional filter; returns cases ordered by created_at DESC
  - `getLegalCaseById(id)` — single case row
  - `createLegalCase({ title, caseType, referenceNumber, internalNumber, procedureType, court, courtDivision, judge, summary, claimDescription, claimValue, claimCurrency, tags, extensionData })` — INSERT, returns new id
  - `updateLegalCase(id, fields)` — UPDATE with allowlist
  - `deleteLegalCase(id)` — DELETE

**Placement:** WAL pragma goes right after `db = new SQL.Database(fileBuffer)` / `db = new SQL.Database()` branch (before the first `db.run()` call). New tables go after the `contract_documents` table block and before `saveDb()` call at the end of `initDb()`. Helper functions go at the very end of the file, after the session helpers section.

### 2. `lib/db.d.ts` — TypeScript declaration additions

**Changes:** Append declarations for all 5 new helpers:
```ts
export function getLegalCases(...args: any[]): any;
export function getLegalCaseById(...args: any[]): any;
export function createLegalCase(...args: any[]): any;
export function updateLegalCase(...args: any[]): any;
export function deleteLegalCase(...args: any[]): any;
```

### 3. `src/lib/types.ts` — New TypeScript interfaces

**Changes:** Append 6 interfaces at the end:
- `LegalCase` — mirrors `legal_cases` columns
- `CaseParty` — mirrors `case_parties` columns
- `CaseDocument` — mirrors `case_documents` columns
- `CaseDeadline` — mirrors `case_deadlines` columns
- `CaseTemplate` — mirrors `case_templates` columns
- `CaseGeneratedDoc` — mirrors `case_generated_docs` columns

### 4. `src/lib/db-imports.ts` — Re-export new helpers

**Changes:** Add 5 new exports to the existing export block:
```ts
getLegalCases,
getLegalCaseById,
createLegalCase,
updateLegalCase,
deleteLegalCase,
```

### 5. `src/lib/constants.ts` — New Legal Hub constants

**Changes:** Append:
- `LEGAL_CASE_STATUSES` — array: `['new', 'intake', 'analysis', 'draft_prepared', 'filed', 'awaiting_response', 'hearing_scheduled', 'judgment_received', 'appeal', 'closed']`
- `LEGAL_CASE_TYPES` — array: `['civil', 'criminal', 'administrative', 'labor', 'family', 'commercial']`
- `LEGAL_CASE_STATUS_COLORS` — Record mapping each status to a Tailwind color string (from existing STATUS_COLORS palette, no hardcoding)
- `LEGAL_CASE_TYPE_LABELS` — Record mapping each case_type to a display label

### 6. `src/app/api/legal-hub/cases/route.ts` — GET + POST

**Auth pattern:** `const session = await auth()` FIRST, then `await ensureDb()`.

**GET handler:**
- Auth check → 401 if no session
- `await ensureDb()`
- Read query params: `search`, `status`, `caseType` from `request.nextUrl.searchParams`
- Call `getLegalCases({ search, status, caseType })`
- Return `NextResponse.json({ data: cases })`
- Errors: `{ error }` + 500

**POST handler:**
- Auth check → 401 if no session
- `await ensureDb()`
- Parse JSON body
- Validate required fields: `title` (non-empty string), `case_type` (must be in LEGAL_CASE_TYPES)
- Call `createLegalCase({ ... })`
- Call `logAction('legal_case', newId, 'created', { title, case_type })`
- Return `NextResponse.json({ data: newCase }, { status: 201 })`
- Validation errors: `{ error }` + 400; server errors: `{ error }` + 500

**File header:** `export const runtime = "nodejs";` (pattern from other route files)

### 7. `src/app/(app)/legal-hub/page.tsx` — Matter dashboard page

**Pattern:** Follows `src/app/(app)/contracts/page.tsx` — thin wrapper that renders a client component.

```tsx
import { LegalHubDashboard } from "@/components/legal-hub/legal-hub-dashboard";

export default function LegalHubPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <LegalHubDashboard />
    </div>
  );
}
```

### 8. `src/components/legal-hub/legal-hub-dashboard.tsx` — Top-level client container

**Pattern:** Follows `ContractsTab` pattern.

Contains:
- `refreshTrigger` state
- `showNewCaseDialog` state
- `searchQuery` state
- `selectedStatuses` state (default: all LEGAL_CASE_STATUSES)
- `selectedCaseType` state (default: all types or empty = no filter)
- Header row: "All Cases" title + "New Case" button (Plus icon, primary style)
- Search input (Input component, `placeholder="Search by title…"`)
- Status filter checkboxes (inline, from LEGAL_CASE_STATUSES)
- Case type filter select or checkboxes (LEGAL_CASE_TYPES)
- `<CaseList>` component
- `<NewCaseDialog>` component

### 9. `src/components/legal-hub/case-list.tsx` — Searchable filterable list

**Pattern:** Follows `ContractList`.

- Props: `refreshTrigger`, `searchQuery`, `selectedStatuses`, `selectedCaseType`
- Fetches from `/api/legal-hub/cases` on mount + refreshTrigger change
- Client-side filter by search/status/type (search passed to API as query param)
- Loading: skeleton cards
- Empty state (no cases): "No cases found. Use 'New Case' to get started."
- Empty state (filtered): "No cases match your filters."
- Renders `<CaseCard>` for each case

### 10. `src/components/legal-hub/case-card.tsx` — Case row card

**Pattern:** Follows `ContractCard` (compact header-only version — no expandable detail in task 1; clicking navigates to `/legal-hub/[id]`).

Displays:
- Reference number (if any) — `text-xs text-muted-foreground`
- Title — `font-semibold`
- Court (if any) — `text-sm text-muted-foreground`
- Status badge — uses `LEGAL_CASE_STATUS_COLORS[case.status]`, same pill pattern as ContractCard
- Created date — formatted with `toLocaleDateString`
- Case type label — small badge or text
- Next deadline display: query `case_deadlines` via API or included in list response (see note below)

**Note on next deadline:** The `getLegalCases` helper will include a `next_deadline` computed via a subquery (MIN due_date from case_deadlines WHERE status='pending' AND case_id = legal_cases.id). This avoids a separate fetch per card.

### 11. `src/components/legal-hub/new-case-dialog.tsx` — Create case modal

**Pattern:** Follows `AddContractDialog` structure (fixed overlay, header with X, form body, cancel + submit buttons).

Fields:
- `title` (required) — text input
- `case_type` (required) — select from LEGAL_CASE_TYPES
- `reference_number` (optional) — text input
- `court` (optional) — text input
- `summary` (optional) — textarea

On submit:
- POST to `/api/legal-hub/cases` with JSON body
- Show inline error on 4xx
- On 201: call `onSuccess()`, close dialog

Props: `open`, `onOpenChange`, `onSuccess`

### 12. `src/components/layout/app-sidebar.tsx` — Add Legal Hub nav entry

**Change:** Add a new `SidebarGroup` between "Contract Hub" and "Documents Hub" groups, labeled "Legal Hub":

```tsx
<SidebarGroup>
  <SidebarGroupLabel>Legal Hub</SidebarGroupLabel>
  <SidebarGroupContent>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname === "/legal-hub" || pathname.startsWith("/legal-hub/")}
          tooltip="Legal Hub"
        >
          <Link href="/legal-hub">
            <Scale />  {/* lucide-react icon */}
            <span>Cases</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroupContent>
</SidebarGroup>
```

Import `Scale` from `lucide-react` (added to the existing import line).

---

## Success Criteria Verification

| Criterion | Implementation |
|---|---|
| /legal-hub shows case list (empty state when none exist) | `LegalHubDashboard` → `CaseList` → empty state message |
| "New Case" dialog opens, fills required fields, submits, case appears | `NewCaseDialog` POST → 201 → `onSuccess()` → `refreshTrigger++` → `CaseList` refetches |
| Search by title works | `getLegalCases({ search })` uses `LIKE '%?%'` on title; client also filters |
| Filter by status + case_type works | Checkboxes drive `selectedStatuses`/`selectedCaseType` → passed to CaseList → server-side or client-side filter |
| Case card shows: reference number, title, court, status badge, created date | `CaseCard` component fields |
| Sidebar shows "Legal Hub" entry that navigates correctly | `app-sidebar.tsx` new group |

---

## Risks and Trade-offs

1. **WAL pragma placement:** Must go immediately after DB is opened/created, before any `db.run()`. WAL mode is persistent in the DB file, so subsequent runs are safe even if the pragma is a no-op.
2. **Next deadline in list:** Included via subquery in `getLegalCases` — avoids N+1 requests but adds a tiny query overhead. Acceptable.
3. **Filter on server vs. client:** Search is passed as API query param for efficiency; status and case_type filters can also be passed to API or done client-side. Plan: pass all three to API to keep the pattern consistent with how the contracts chat route uses params.
4. **`Scale` icon availability:** lucide-react is already in the project. `Scale` (a balance/justice scale) is appropriate for Legal Hub.
5. **No `next_deadline` in POST response:** POST returns the newly created case row; `next_deadline` will be null initially (no deadlines yet) — correct behavior.

---

## Dependency Notes

- Tasks 2–5 depend on this task's DB schema and type definitions — all 6 tables must be created here even though tasks 2–5 add more helpers for them.
- `lib/db.d.ts` updates here cover only task-1 helpers; tasks 2–5 will append their own declarations.
- `src/lib/db-imports.ts` will be appended by subsequent tasks; no conflicts since function names are unique.
