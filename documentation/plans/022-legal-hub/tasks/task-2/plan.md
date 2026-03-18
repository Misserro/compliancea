# Task 2 Implementation Plan — Case Detail UI: metadata, parties, status, deadlines

## Overview

This plan implements the case detail page at `/legal-hub/[id]` with a four-tab shell (Overview, Documents, Generate, Chat). Documents/Generate/Chat tabs are empty placeholders. The Overview tab contains four sections: editable metadata form, parties CRUD, status history + transition, and deadlines CRUD.

Backend additions: GET/PATCH/DELETE on `/api/legal-hub/cases/[id]`, parties sub-resource CRUD, deadlines sub-resource CRUD, status transition endpoint, activity (audit log) endpoint.

All mutations call `saveDb()` and `logAction()`. All API routes call `const session = await auth()` first.

---

## Files to Create or Modify

### 1. `lib/db.js` — new helper functions (append after `deleteLegalCase`)

New helpers to add in a section `// ---- Parties ----`:

- `getCaseParties(caseId)` — `SELECT * FROM case_parties WHERE case_id = ? ORDER BY party_type, id`
- `addCaseParty({ caseId, partyType, name, address, representativeName, representativeAddress, representativeType, notes })` — INSERT, returns `lastInsertRowId`
- `updateCaseParty(id, fields)` — UPDATE with allowlist: `[party_type, name, address, representative_name, representative_address, representative_type, notes]`
- `deleteCaseParty(id)` — DELETE

New helpers in section `// ---- Deadlines ----`:

- `getCaseDeadlines(caseId)` — `SELECT * FROM case_deadlines WHERE case_id = ? ORDER BY due_date ASC`
- `addCaseDeadline({ caseId, title, deadlineType, dueDate, description })` — INSERT with `status = 'pending'`, returns `lastInsertRowId`
- `updateCaseDeadline(id, fields)` — UPDATE with allowlist: `[title, deadline_type, due_date, description, status, completed_at]`
- `deleteCaseDeadline(id)` — DELETE

Write helpers use the `run()` helper from db.js. `run()` calls `saveDb()` internally after every write — no explicit `saveDb()` call is needed in the helper functions or in the API routes. This matches the established pattern for all existing helpers.

### 2. `lib/db.d.ts` — append type declarations for the 8 new helpers

```ts
export function getCaseParties(...args: any[]): any;
export function addCaseParty(...args: any[]): any;
export function updateCaseParty(...args: any[]): any;
export function deleteCaseParty(...args: any[]): any;
export function getCaseDeadlines(...args: any[]): any;
export function addCaseDeadline(...args: any[]): any;
export function updateCaseDeadline(...args: any[]): any;
export function deleteCaseDeadline(...args: any[]): any;
```

### 3. `src/lib/db-imports.ts` — append 8 new exports

Add to the existing export block (before the closing `} from "../../lib/db.js"`):
```ts
getCaseParties,
addCaseParty,
updateCaseParty,
deleteCaseParty,
getCaseDeadlines,
addCaseDeadline,
updateCaseDeadline,
deleteCaseDeadline,
```

### 4. `src/app/api/legal-hub/cases/[id]/route.ts` — GET, PATCH, DELETE

**Auth pattern:** `const session = await auth()` FIRST, then `await ensureDb()`, then try/catch.

**GET handler:**
- Auth → 401
- `ensureDb()`
- Parse `params.id` → 400 if NaN
- `getLegalCaseById(id)` → 404 if null
- `getCaseParties(id)` — include in response
- `getCaseDeadlines(id)` — include in response
- Return `NextResponse.json({ data: { ...legalCase, parties, deadlines } })`

**PATCH handler:**
- Auth → 401
- `ensureDb()`
- Parse `params.id` → 400 if NaN
- Parse JSON body
- Build allowlisted `fields` object from body (all `legal_cases` columns except `id`, `created_at`, `status_history_json`)
- `updateLegalCase(id, fields)`
- `logAction('legal_case', id, 'updated', { fields: Object.keys(fields) })`
- Refetch and return `NextResponse.json({ data: updatedCase })`

**DELETE handler:**
- Auth → 401
- `ensureDb()`
- Parse `params.id` → 400 if NaN
- `getLegalCaseById(id)` → 404 if null
- `deleteLegalCase(id)`
- `logAction('legal_case', id, 'deleted', { title: legalCase.title })`
- Return `NextResponse.json({ data: { id } })`

### 5. `src/app/api/legal-hub/cases/[id]/parties/route.ts` — GET, POST

**GET:** Auth → ensureDb → `getCaseParties(id)` → `{ data: parties }`

**POST:**
- Auth → ensureDb
- Parse body: `party_type` (required, validate against allowed list), `name` (required, non-empty)
- `addCaseParty({ caseId: id, partyType, name, address, representativeName, representativeAddress, representativeType, notes })`
- `logAction('legal_case', id, 'party_added', { name, party_type: partyType })`
- Return `{ data: newParty }` with status 201

### 6. `src/app/api/legal-hub/cases/[id]/parties/[pid]/route.ts` — PATCH, DELETE

**PATCH:**
- Auth → ensureDb
- Parse `params.pid` → 400 if NaN
- Build `fields` from body with allowlist
- `updateCaseParty(pid, fields)`
- `logAction('legal_case', caseId, 'party_updated', { partyId: pid })`
- Return `{ data: updatedParty }` with status 200

**DELETE:**
- Auth → ensureDb
- `deleteCaseParty(pid)`
- `logAction('legal_case', caseId, 'party_removed', { partyId: pid })`
- Return `{ data: { id: pid } }` with status 200

### 7. `src/app/api/legal-hub/cases/[id]/deadlines/route.ts` — GET, POST

**GET:** Auth → ensureDb → `getCaseDeadlines(id)` → `{ data: deadlines }`

**POST:**
- Auth → ensureDb
- Validate: `title` (required), `deadline_type` (required, from allowed list: `['hearing', 'response_deadline', 'appeal_deadline', 'filing_deadline', 'payment', 'other']`), `due_date` (required, valid date string)
- `addCaseDeadline({ caseId: id, title, deadlineType, dueDate, description })`
- `logAction('legal_case', id, 'deadline_added', { title, deadline_type: deadlineType, due_date: dueDate })`
- Return `{ data: newDeadline }` with status 201

### 8. `src/app/api/legal-hub/cases/[id]/deadlines/[did]/route.ts` — PATCH, DELETE

**PATCH:**
- Auth → ensureDb
- Allowlisted update for: `title`, `deadline_type`, `due_date`, `description`, `status`, `completed_at`
- If `status === 'met'` and no `completed_at` provided → auto-set `completed_at = new Date().toISOString()`
- `updateCaseDeadline(did, fields)`
- `logAction('legal_case', caseId, 'deadline_updated', { deadlineId: did, status: fields.status })`
- Return `{ data: updatedDeadline }` with status 200

**DELETE:**
- Auth → ensureDb
- `deleteCaseDeadline(did)`
- `logAction('legal_case', caseId, 'deadline_removed', { deadlineId: did })`
- Return `{ data: { id: did } }` with status 200

### 9. `src/app/api/legal-hub/cases/[id]/status/route.ts` — POST

**POST:**
- Auth → ensureDb
- Parse body: `status` (required, must be in `LEGAL_CASE_STATUSES`), `note` (optional)
- `getLegalCaseById(id)` → 404 if not found
- Parse existing `status_history_json` (default `[]`)
- Append entry: `{ status: currentStatus, changed_at: new Date().toISOString(), note: null }` ← records the *previous* status being exited
- `updateLegalCase(id, { status: newStatus, status_history_json: JSON.stringify(updatedHistory) })`
- `logAction('legal_case', id, 'status_changed', { from: oldStatus, to: newStatus, note })`
- Return `{ data: { status: newStatus, status_history: updatedHistory } }` with status 200

**Note on history structure:** The history array records transitions as `{ status, changed_at, note }` where `status` is the *old* status being left. This gives a clear timeline of what statuses the case passed through and when.

### 10. `src/app/api/legal-hub/cases/[id]/activity/route.ts` — GET

**GET:**
- Auth → ensureDb
- `getAuditLog({ entityType: 'legal_case', entityId: id, limit: 100 })`
- Return `{ data: entries }`

### 11. `src/app/(app)/legal-hub/[id]/page.tsx` — Case detail page (tab shell)

Server component thin wrapper (pattern matches `src/app/(app)/legal-hub/page.tsx`):

```tsx
import { CaseDetailPage } from "@/components/legal-hub/case-detail-page";

export default function CaseDetailPageRoute({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <CaseDetailPage caseId={parseInt(params.id, 10)} />
    </div>
  );
}
```

### 12. `src/components/legal-hub/case-detail-page.tsx` — Client-side tab shell container

**"use client"** component. Props: `{ caseId: number }`.

State:
- `legalCase: LegalCase | null` — fetched from `GET /api/legal-hub/cases/[id]`
- `parties: CaseParty[]` — from same response
- `deadlines: CaseDeadline[]` — from same response
- `loading: boolean`
- `error: string | null`
- `activeTab: 'overview' | 'documents' | 'generate' | 'chat'` (default: 'overview')
- `refreshTrigger: number` — increment to re-fetch

Fetch on mount and on `refreshTrigger` change.

Renders:
- `<CaseHeader legalCase={legalCase} />` above the tabs
- Tab bar: four buttons (Overview, Documents, Generate, Chat)
  - Documents/Generate/Chat show a "Coming soon" placeholder `<div>`
  - Overview shows `<CaseOverviewTab>`

Props passed to `CaseOverviewTab`: `legalCase`, `parties`, `deadlines`, `onRefresh: () => setRefreshTrigger(t => t + 1)`, `caseId`

### 13. `src/components/legal-hub/case-header.tsx`

**"use client"** component. Props: `{ legalCase: LegalCase | null }`.

Displays:
- Reference number (if any) — `text-sm text-muted-foreground`
- Title — `text-2xl font-bold`
- Court and division (if any) — `text-sm text-muted-foreground`
- Status badge — `LEGAL_CASE_STATUS_COLORS[legalCase.status]` pill (same pattern as `CaseCard`)
- Case type label — smaller secondary badge
- Back link: `<Link href="/legal-hub">← Back to cases</Link>`

### 14. `src/components/legal-hub/case-overview-tab.tsx`

**"use client"** component. Props: `{ legalCase: LegalCase; parties: CaseParty[]; deadlines: CaseDeadline[]; caseId: number; onRefresh: () => void }`.

Renders in a vertical stack:
1. `<CaseMetadataForm legalCase={legalCase} caseId={caseId} onSaved={onRefresh} />`
2. `<CasePartiesSection parties={parties} caseId={caseId} onRefresh={onRefresh} />`
3. `<CaseStatusSection legalCase={legalCase} caseId={caseId} onRefresh={onRefresh} />`
4. `<CaseDeadlinesSection deadlines={deadlines} caseId={caseId} onRefresh={onRefresh} />`

### 15. `src/components/legal-hub/case-metadata-form.tsx`

**"use client"** component. Pattern: `ContractMetadataDisplay` (view mode → edit mode toggle).

Props: `{ legalCase: LegalCase; caseId: number; onSaved: () => void }`.

State:
- `editing: boolean`
- `saving: boolean`
- `form: { ... }` — all mutable `legal_cases` fields

**View mode:** Shows all fields in a labeled grid (3 columns on lg). Pencil button in header → switches to editing mode.

**Edit mode:** Same grid with `<input>` / `<select>` / `<textarea>` for each field. Check/X buttons to save or cancel.

Fields covered:
- `title` (required, text)
- `case_type` (select from `LEGAL_CASE_TYPES`)
- `reference_number` (text)
- `internal_number` (text)
- `procedure_type` (text)
- `court` (text)
- `court_division` (text)
- `judge` (text)
- `summary` (textarea)
- `claim_description` (textarea)
- `claim_value` (number)
- `claim_currency` (text, default PLN)
- `tags` (comma-separated text → stored as JSON array)

On save: `PATCH /api/legal-hub/cases/[caseId]` with form data. On 200: call `onSaved()`, exit edit mode. Show inline error on failure.

### 16. `src/components/legal-hub/case-parties-section.tsx`

**"use client"** component. Props: `{ parties: CaseParty[]; caseId: number; onRefresh: () => void }`.

State:
- `showAddDialog: boolean`
- `editingParty: CaseParty | null`

Renders:
- Section header "Parties" + "Add Party" button (Plus icon)
- Table or card list of parties showing: party_type badge, name, representative_name if present
- Per-row: Edit (Pencil) + Delete (Trash) buttons

**Add/Edit dialog:** inline or small modal with fields:
- `party_type` (select: plaintiff, defendant, third_party, witness, other)
- `name` (required, text)
- `address` (textarea)
- `representative_name` (text)
- `representative_address` (textarea)
- `representative_type` (select: attorney, legal_counsel, other)
- `notes` (textarea)

On add: POST `/api/legal-hub/cases/[caseId]/parties` → 201 → `onRefresh()`.
On edit: PATCH `/api/legal-hub/cases/[caseId]/parties/[pid]` → 200 → `onRefresh()`.
On delete: DELETE `/api/legal-hub/cases/[caseId]/parties/[pid]` → 200 → `onRefresh()`.

### 17. `src/components/legal-hub/case-status-section.tsx`

**"use client"** component. Props: `{ legalCase: LegalCase; caseId: number; onRefresh: () => void }`.

State:
- `transitioning: boolean`
- `selectedStatus: string` — defaults to current status
- `note: string`

Renders:
- Section header "Status"
- Current status badge (large, color from `LEGAL_CASE_STATUS_COLORS`)
- Transition row: `<select>` of all `LEGAL_CASE_STATUSES` + optional note input + "Change Status" button
- History timeline: parse `legalCase.status_history_json` (JSON.parse), render each entry as:
  `[status badge] → [formatted date] — [note if any]`
  ordered from most recent to oldest (reverse the array before rendering)

On submit: `POST /api/legal-hub/cases/[caseId]/status` with `{ status: selectedStatus, note }` → 200 → `onRefresh()`.

### 18. `src/components/legal-hub/case-deadlines-section.tsx`

**"use client"** component. Props: `{ deadlines: CaseDeadline[]; caseId: number; onRefresh: () => void }`.

State:
- `showAddDialog: boolean`
- `editingDeadline: CaseDeadline | null`

Overdue detection: a deadline is overdue when `status === 'pending'` AND `new Date(due_date) < new Date()`.

Renders:
- Section header "Deadlines" + "Add Deadline" button
- List of deadlines, sorted by `due_date ASC`. Per item:
  - Title + deadline_type badge
  - Due date, formatted
  - Status badge (`pending` / `met` / `missed` / `cancelled`)
  - Overdue: wrap row in `bg-red-50 dark:bg-red-950` or add red text to due date when overdue
  - Actions: "Mark as Met" button (if status === 'pending'), Edit (Pencil), Delete (Trash)

**Add/Edit dialog (inline):**
- `title` (required, text)
- `deadline_type` (select: hearing, response_deadline, appeal_deadline, filing_deadline, payment, other)
- `due_date` (required, date input)
- `description` (textarea)

On add: POST `/api/legal-hub/cases/[caseId]/deadlines` → 201 → `onRefresh()`.
On edit: PATCH `/api/legal-hub/cases/[caseId]/deadlines/[did]` → 200 → `onRefresh()`.
On mark met: PATCH with `{ status: 'met' }` → 200 → `onRefresh()`.
On delete: DELETE → 200 → `onRefresh()`.

---

## Success Criteria Verification

| Criterion | How satisfied |
|---|---|
| Case header shows reference, title, court, status badge | `CaseHeader` component renders all fields |
| Overview tab: all metadata fields editable and save correctly | `CaseMetadataForm` edit/save flow → PATCH route → `updateLegalCase` |
| Parties: add plaintiff + defendant, edit, remove | `CasePartiesSection` + party sub-resource API routes |
| Status: current shown, transition changes status, timeline with timestamps | `CaseStatusSection` → POST /status → `status_history_json` |
| Deadlines: add hearing, mark met, overdue in red | `CaseDeadlinesSection` + deadline sub-resource API routes |
| Changes in activity log via `/api/legal-hub/cases/[id]/activity` | `logAction('legal_case', id, ...)` in every mutation + activity route |

---

## Risks and Trade-offs

1. **`saveDb()` in helpers vs route layer:** Verified: the `run()` helper in `lib/db.js` (line 651) calls `saveDb()` internally after every write. All db helpers use `run()`, so `saveDb()` is called automatically on every INSERT/UPDATE/DELETE. No explicit `saveDb()` call is needed in the API routes or helper functions. The architectural constraint "saveDb() after every write" is satisfied by the `run()` implementation.

2. **Status history format:** History records the previous status when a transition occurs. The first transition creates `[{ status: 'new', changed_at: '...', note: null }]`. The current status is always on `legal_cases.status`, not in the history array. This is unambiguous and consistent.

3. **Four-tab shell in this task:** Documents/Generate/Chat tabs render a `<div className="py-12 text-center text-muted-foreground text-sm">Coming soon — implemented in a future task.</div>` placeholder.

4. **`params` in Next.js 15:** Route params are `Promise<{ id: string }>` — must be `await`ed. Task 1's existing route already uses this pattern: `const params = await props.params`. All new `[id]` routes must follow this pattern.

5. **Party type / deadline type badges:** Use the same pill pattern as status badges — small `px-2 py-0.5 rounded text-xs font-medium` spans. Colors can be neutral/muted for party types; deadline types use muted.

6. **Overdue deadline detection:** Computed client-side from `due_date`. No DB-level computed column needed.

---

## Dependency Notes for Tasks 3, 4, 5

- `getCaseParties` and `getCaseDeadlines` are needed by Tasks 4 and 5 — they are defined here.
- The `GET /api/legal-hub/cases/[id]` response already includes parties and deadlines, giving Tasks 3/4/5 a single endpoint to load full case context.
- `logAction` calls use entity_type `'legal_case'` and entity_id = case id — the activity endpoint in this task will surface all of them.
- `lib/db.js` additions in this task (8 new helpers) do NOT conflict with Task 3 additions (`getCaseDocuments`, `addCaseDocument`, `removeCaseDocument`) or Task 4 additions (template/generated-doc helpers).
