## Task 2 Complete — Case Detail UI: metadata, parties, status, deadlines

### DB Layer
- Modified: `lib/db.js` — added 10 new helpers after `deleteLegalCase` (line ~2282):
  - Parties: `getCaseParties`, `addCaseParty`, `updateCaseParty`, `deleteCaseParty`, `getCasePartyById`
  - Deadlines: `getCaseDeadlines`, `addCaseDeadline`, `updateCaseDeadline`, `deleteCaseDeadline`, `getCaseDeadlineById`
- Modified: `lib/db.d.ts` — added type declarations for all 10 new helpers
- Modified: `src/lib/db-imports.ts` — added 10 new exports

### API Routes (7 new files)
- Created: `src/app/api/legal-hub/cases/[id]/route.ts` — GET (case + parties + deadlines), PATCH, DELETE
- Created: `src/app/api/legal-hub/cases/[id]/parties/route.ts` — GET, POST (201)
- Created: `src/app/api/legal-hub/cases/[id]/parties/[pid]/route.ts` — PATCH, DELETE
- Created: `src/app/api/legal-hub/cases/[id]/deadlines/route.ts` — GET, POST (201)
- Created: `src/app/api/legal-hub/cases/[id]/deadlines/[did]/route.ts` — PATCH, DELETE
- Created: `src/app/api/legal-hub/cases/[id]/status/route.ts` — POST (status transition with history)
- Created: `src/app/api/legal-hub/cases/[id]/activity/route.ts` — GET (audit log)

### UI Components (8 new files)
- Created: `src/app/(app)/legal-hub/[id]/page.tsx` — server component page route
- Created: `src/components/legal-hub/case-detail-page.tsx` — client-side tab shell (Overview/Documents/Generate/Chat)
- Created: `src/components/legal-hub/case-header.tsx` — case title bar with reference, court, status badge, type badge, back link
- Created: `src/components/legal-hub/case-overview-tab.tsx` — composition of 4 section components
- Created: `src/components/legal-hub/case-metadata-form.tsx` — editable metadata form (view/edit toggle, pattern: ContractMetadataDisplay)
- Created: `src/components/legal-hub/case-parties-section.tsx` — party list + inline add/edit form + delete
- Created: `src/components/legal-hub/case-status-section.tsx` — current status badge, transition dropdown, history timeline
- Created: `src/components/legal-hub/case-deadlines-section.tsx` — deadline list with overdue detection (red highlight), mark-as-met, inline add/edit

### Key Patterns Followed
- Auth: `const session = await auth()` FIRST in every API route
- Params: `const params = await props.params` (Next.js 15 async params)
- Response shape: `{ data: ... }` for success, `{ error: "message" }` for errors
- POST returns 201, PATCH returns 200, DELETE returns 200
- `logAction('legal_case', id, action, details)` after every mutation
- `run()` in db.js calls `saveDb()` internally — no explicit `saveDb()` needed in routes
- Documents/Generate/Chat tabs are placeholders ("Coming soon")

### INTEGRATION Notes for Successor Tasks
- `GET /api/legal-hub/cases/[id]` returns `{ data: { ...case, parties: [...], deadlines: [...] } }` — Tasks 3/4/5 can fetch full case data in one call
- `getCaseParties(caseId)` and `getCaseDeadlines(caseId)` are available for Task 4 (template variable resolution) and Task 5 (chat retrieval)
- `getCasePartyById` and `getCaseDeadlineById` helpers are available for sub-resource GET-after-write
- Tab shell in `case-detail-page.tsx` renders placeholder divs for tabs "documents", "generate", "chat" — Tasks 3/4/5 will replace those with real components

### Review Fix Cycle 1
- `src/app/api/legal-hub/cases/[id]/parties/[pid]/route.ts` — added `party_type` validation on PATCH, added ownership check (`existing.case_id !== caseId`) in both PATCH and DELETE
- `src/app/api/legal-hub/cases/[id]/deadlines/[did]/route.ts` — added `deadline_type` and `status` validation on PATCH, added ownership check (`existing.case_id !== caseId`) in both PATCH and DELETE

### Build Verification
- `npx tsc --noEmit` — zero errors after all fixes
- `npx next build` — clean build, `/legal-hub/[id]` at 8.73 kB
