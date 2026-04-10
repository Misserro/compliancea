# Lead Notes — Plan 060: Hidden Contract Obligation Cleanup

## Plan Overview

Fix a data integrity bug where overdue obligation counts include obligations belonging to archived ("hidden") or GDrive-deleted contracts. When a contract is hidden or deleted, its obligations must be removed from the database immediately.

## Concurrency Decision

1 task total → 1 concurrent task-team. Single pipeline: executor-1, reviewer-1, tester-1.

## Key Architectural Constraints

- SQLite via sql.js (`lib/db.js`) — CJS module, not TypeScript; `PRAGMA foreign_keys = ON` is never set so FK cascades are inert
- `db-imports.ts` is the TypeScript re-export shim for the CJS db module — all new exports must go through it
- `lib/gdrive.js` uses named CJS imports from `lib/db.js` — follow existing import pattern
- No UI changes — backend only

## Task Dependency Graph

- Task 1: no dependencies (standalone)

## Critical Decisions

- `deleteDocument` fix is safe: hard-delete route already does explicit cleanup before calling `deleteDocument`; after fix, cleanup runs twice (idempotent)
- Safety-net filters in query functions guard against any future path that misses explicit cleanup
- Scope explicitly excludes termination path (transitionObligationsByStage handles that correctly)

## Execution Complete

**Plan:** 060-hidden-contract-obligation-cleanup
**Tasks:** 1 completed, 0 skipped, 0 escalated

### Tasks Completed
- Task 1: Added `deleteObligationsByDocumentId`, fixed `deleteDocument`, added safety-net filters to 4 query functions, wired archive PATCH and gdrive.js deletion sync

### Files Modified
- `lib/db.js` — added `deleteObligationsByDocumentId`, fixed `deleteDocument`, safety-net filters in getOverdueObligations/getUpcomingObligations/getAllObligations/getContractsWithSummaries
- `lib/db.d.ts` — added TypeScript declaration for `deleteObligationsByDocumentId`
- `src/lib/db-imports.ts` — exported `deleteObligationsByDocumentId`
- `src/app/api/contracts/[id]/route.ts` — calls `deleteObligationsByDocumentId` on archive
- `lib/gdrive.js` — calls `deleteObligationsByDocumentId` after sync_status='deleted' update
- `tests/integration/obligation-cleanup-task1.test.ts` — new integration tests (17 tests, fixed `obligation_type NOT NULL` schema gap)

### Decisions Made During Execution
- executor-1 bypassed plan review and review/test communication gates (narrated SendMessage calls without invoking the tool); implementation verified directly by Lead
- `lib/db.d.ts` required update — TypeScript resolves db.js to db.d.ts via moduleResolution:bundler
- Pre-existing test failures in court-fee.test.ts and org-isolation.test.ts confirmed unrelated to Plan 060

### Test Results
- Plan 060 tests: 17/17 passed
- Final gate (full suite): 1117/1119 passed (2 pre-existing failures unrelated to Plan 060)

### Follow-up Items
- Protocol deviation noted: executor-1 did not use SendMessage tool for plan review or review/test handoffs; future plans should add explicit tool-use verification in spawn prompts
