# Lead Notes — Plan 022: Legal Hub

## Plan Overview

Legal Hub is a professional case management module for law firms. 6 new DB tables, ~22 API endpoints, new `/legal-hub` route tree, sidebar entry. Reuses existing Claude API, Voyage embeddings, audit_log, formidable uploads, TipTap, docx library.

## Concurrency Decision

2 concurrent task-teams max. Sequential start (T1 blocks all), then T2 runs alone, then T3+T4 run in parallel (both depend on T2), then T5 runs after T3 passes.

## Task Dependency Graph

- Task 1: no dependencies
- Task 2: depends on Task 1
- Task 3: depends on Task 2
- Task 4: depends on Task 2
- Task 5: depends on Task 2 AND Task 3

## Key Architectural Constraints

1. **Module separation is mandatory**: lib/db.js (CJS) → src/lib/db-imports.ts (re-exports) → src/app/api/ (routes) → src/components/ (UI). No direct DB imports in API routes or components.
2. **saveDb() after every write**: sql.js is in-memory; always call saveDb() after INSERT/UPDATE/DELETE.
3. **WAL mode**: Add `PRAGMA journal_mode=WAL;` to the initDb() function in lib/db.js.
4. **Migration pattern**: New columns always use try/catch ALTER TABLE — never drop/recreate tables.
5. **New tables use CREATE TABLE IF NOT EXISTS**: Safe to call on every startup.
6. **API response shape**: `NextResponse.json({ data })` for success, `{ error: "message" }` with 4xx/5xx for errors.
7. **Auth is automatic**: middleware.ts protects all (app) routes. API routes just need to call `getServerSession()` from NextAuth for the session user.
8. **Formidable for uploads**: existing pattern in `/api/documents` — reuse for case document uploads.
9. **No testing infrastructure**: no test files needed (assumption 10 from plan).
10. **Two-step LLM pipeline for chat**: Haiku classifier (intent) → SQL/vector retrieval → Sonnet generation. System prompts loaded from `prompts/` at runtime.

## Critical Decisions

- Cases are a **new dedicated table** (`legal_cases`) — NOT extensions of the `documents` table.
- Chat uses **SQL-first retrieval** for structured queries; vector search (chunks JOIN case_documents) only for document_search intent.
- Templates use **`{{variable}}` string substitution**, not AI generation.
- DOCX export via existing `docx` npm library (already in package.json).
- File storage: `DOCUMENTS_DIR/case-attachments/[case_id]/` for uploaded case docs, `DOCUMENTS_DIR/case-generated/` for DOCX exports.
- `audit_log` with `entity_type = 'legal_case'` provides the activity trail — no new audit table needed.

## Recurring Pattern Gap (caught in T1 and T3 reviews)

**Path constants must be defined in lib/paths.js** — whenever a new storage directory is used (e.g. case-generated/, case-attachments/), it must be added as a named export to `lib/paths.js`, `lib/paths.d.ts`, and `src/lib/paths-imports.ts`. Do NOT construct paths inline in route files. Examples: `CONTRACT_ATTACHMENTS_DIR`, `CASE_ATTACHMENTS_DIR`. Task 5 does not create new storage directories, but this applies to any future tasks.

## Additional Pattern (found by reviewer-1)

- **`lib/db.d.ts` must be updated** alongside lib/db.js whenever new helper functions are added — TypeScript type declarations live there
- **Auth check order**: `const session = await auth()` FIRST in every API route, before `ensureDb()`
- **POST returns 201**, not 200
- Status colors from `@/lib/constants.ts` (do not hardcode)

## Files To Watch For Cross-Task Conflicts

- `lib/db.js` — modified by Tasks 1, 2, 3, 4, 5 (each adds new helpers)
- `src/lib/db-imports.ts` — modified by Tasks 1, 2, 3, 4, 5
- `src/lib/types.ts` — modified by Task 1 (all interfaces added upfront)

Tasks 3+4 run concurrently — executors must coordinate if both need lib/db.js changes simultaneously. Since T3 adds getCaseDocuments/addCaseDocument/removeCaseDocument and T4 adds getTemplates/createTemplate/getGeneratedDocs/createGeneratedDoc, there is no function name collision. Both should be safe to merge.

## Execution Complete

**Plan:** 022-legal-hub
**Wall-clock time:** ~108 minutes | **Effective work time:** ~92 minutes
**Tasks:** 5/5 completed | **Escalations:** 0

### Tasks Completed
- Task 1: DB schema (6 tables, WAL), Case Registry API, Matter Dashboard UI — 69 min, 5 retries (4× Opus 529 outage)
- Task 2: Case Detail UI, parties, status, deadlines — 53 min, 0 retries
- Task 3: Case Document Repository (upload, link, embeddings trigger) — 23 min, 1 retry (CASE_ATTACHMENTS_DIR)
- Task 4: Template generation, TipTap, DOCX export — 1 retry (sanitization, logAction, 400→404)
- Task 5: Grounded case chat (Haiku classifier, case-scoped vector search, Polish prompt) — 12 min, 1 retry (JSON parse 400)

### Files Modified/Created (total ~80 files)
- lib/db.js — 29 Legal Hub helpers, 6 tables, WAL pragma
- lib/templateEngine.js, lib/docxExport.js — new pure CJS/ESM modules
- lib/paths.js — CASE_ATTACHMENTS_DIR added
- src/lib/types.ts — 6 new interfaces
- src/lib/constants.ts — Legal Hub status/type/category constants
- src/app/api/legal-hub/ — 22+ API route files
- src/app/(app)/legal-hub/ — 3 pages
- src/components/legal-hub/ — 14 components
- src/components/layout/app-sidebar.tsx — Legal Hub nav entries
- prompts/case-chat.md — Polish grounded-only system prompt
- tests/unit/templateEngine.test.ts — 30 unit tests (first test infrastructure in project)
- vitest.config.ts — test runner config

### Final Gate Results
- TypeScript: 0 errors
- Unit tests: 30/30 passed
- All routes, components, DB tables verified present
- No cross-task DB conflicts

### Decisions Made During Execution
- Executor model: Opus → Sonnet (switched after 3× 529 overload on Task 1)
- Response envelopes: corrected from {data:...} to resource-named keys (reviewer-1 catch)
- logAction pattern: plain object, not JSON.stringify (reviewer-4 catch)
- CASE_ATTACHMENTS_DIR: extracted to lib/paths.js per codebase convention (reviewer-3 catch)
- claude-3-haiku-20240307: replaced with claude-haiku-4-5-20251001 (knowledge agent finding — deprecated April 2026)
