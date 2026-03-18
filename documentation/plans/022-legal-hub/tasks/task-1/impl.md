## Task 1 Complete -- DB schema + Case Registry API + Matter Dashboard UI

### Files Modified
- `lib/db.js` — Added WAL pragma (line 28), 6 new tables (legal_cases, case_parties, case_documents, case_deadlines, case_templates, case_generated_docs) with 8 indexes inside initDb(). Added 5 helper functions at end of file: getLegalCases, getLegalCaseById, createLegalCase, updateLegalCase, deleteLegalCase. getLegalCases includes next_deadline subquery from case_deadlines.
- `lib/db.d.ts` — Added declarations for 5 new Legal Hub helpers (lines 106-110)
- `src/lib/db-imports.ts` — Re-exported 5 new Legal Hub helpers
- `src/lib/types.ts` — Added 6 new interfaces: LegalCase, CaseParty, CaseDocument, CaseDeadline, CaseTemplate, CaseGeneratedDoc
- `src/lib/constants.ts` — Added LEGAL_CASE_STATUSES (10 statuses), LEGAL_CASE_TYPES (6 types), LEGAL_CASE_STATUS_DISPLAY, LEGAL_CASE_STATUS_COLORS, LEGAL_CASE_TYPE_LABELS
- `src/components/layout/app-sidebar.tsx` — Added Scale icon import, added "Legal Hub" SidebarGroup between Contract Hub and Documents Hub

### Files Created
- `src/app/api/legal-hub/cases/route.ts` — GET (list with search/status/caseType filters) + POST (create, returns 201). Both handlers: auth() first, then ensureDb(). POST validates title + case_type, calls logAction after create.
- `src/app/(app)/legal-hub/page.tsx` — Thin server page wrapper rendering LegalHubDashboard
- `src/components/legal-hub/legal-hub-dashboard.tsx` — Client container with search input, status checkboxes (10 statuses), case type dropdown filter, refresh trigger, New Case button
- `src/components/legal-hub/case-list.tsx` — Fetches from /api/legal-hub/cases, client-side filter by status/type/search, skeleton loading, empty states
- `src/components/legal-hub/case-card.tsx` — Link to /legal-hub/[id], shows reference_number, title, status badge (from LEGAL_CASE_STATUS_COLORS), case type label, court, created date, next_deadline with Calendar icon
- `src/components/legal-hub/new-case-dialog.tsx` — Modal form: title (required), case_type select (required), reference_number, court, summary (all optional). POST to /api/legal-hub/cases, inline error display, submitting state.

### Exports / Integration Points
- INTEGRATION: Task 2 should import LegalCase, CaseParty, CaseDeadline from `src/lib/types.ts`
- INTEGRATION: Task 2 will add more helpers to lib/db.js for parties, deadlines, status transitions. Append to the "Legal Hub operations" section.
- INTEGRATION: Task 2 will need to add helper declarations to lib/db.d.ts and re-exports to src/lib/db-imports.ts
- INTEGRATION: Tasks 3-5 will add new route files under src/app/api/legal-hub/cases/[id]/ -- no conflicts with task 1 routes
- INTEGRATION: Case card links to /legal-hub/[id] which does not exist yet (task 2 creates that page)

### Patterns Followed
- Auth: `const session = await auth()` before `await ensureDb()` in every API handler
- POST returns 201 with `{ data }` envelope; errors return `{ error }` with status code
- logAction after every mutation (via audit-imports, which auto-stringifies objects)
- saveDb() is called automatically by the `run()` helper inside createLegalCase -- no manual saveDb needed
- Dialog pattern matches AddContractDialog: fixed overlay, header with X, form body, cancel + submit
- List pattern matches ContractList: useEffect fetch, AbortController, skeleton loading, empty states
- Sidebar group pattern matches existing Contract Hub / Documents Hub groups

### GOTCHA
- `LEGAL_CASE_TYPES.includes(caseType)` in the API route: TypeScript readonly array `.includes()` call works correctly because the param is typed as `string` (from request body). No casting needed.
