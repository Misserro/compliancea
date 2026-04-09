# Lead Notes — Plan 052: Agreements Tab Improvements

## Plan Overview

Three improvements to the Agreements (Contracts) tab:
1. AI contract naming ("CompanyA — CompanyB" from document content)
2. Contract type classification (9-value enum, auto-assigned + manually editable)
3. UI fix: card header truncation + contract type badge

Plus a retroactive admin endpoint for existing contracts.

## Concurrency Decision

6 tasks, max 3 concurrent task-teams.

Initial batch: Task 1 alone (all others depend on it).
After Task 1 done: Tasks 2, 4, 5 in parallel (all unblocked).
After Tasks 1+2 done: Tasks 3 and 6 can start.

## Task Dependency Graph

- Task 1: no dependencies — FIRST
- Task 2: blocked by Task 1
- Task 3: blocked by Tasks 1, 2
- Task 4: blocked by Task 1
- Task 5: blocked by Task 1
- Task 6: blocked by Tasks 1, 2

## Key Architectural Constraints

1. **Two DB update functions with allowlists**: `updateDocumentMetadata` (lib/db.js:1363) and `updateContractMetadata` (lib/db.js:2297). Both need `contract_type` added. `updateDocumentMetadata` also needs `name` added (currently absent).

2. **DB migration pattern**: `try { db.run('ALTER TABLE documents ADD COLUMN contract_type TEXT') } catch(e) {}` in lib/db.js init function. Safe for SQLite, idempotent.

3. **`contracting_company`/`contracting_vendor` are never auto-populated today** — only manual editing. Task 3 changes this.

4. **`lib/contracts.js` is a compiled JS file** — edit directly (not TypeScript source). It uses ES module syntax with Anthropic SDK.

5. **`getContractsWithSummaries`** has two variants (org-scoped and non-org-scoped) — both SELECTs must include `d.contract_type`.

6. **Reprocessing safety**: Task 3 must only write `contracting_company`/`contracting_vendor` when currently null — never overwrite manual edits.

## Critical Decisions

- AI naming format: "CompanyA — CompanyB" (em dash, user chose "Our company — counterparty" format)
- Contract type enum: vendor, b2b, employment, nda, lease, licensing, partnership, framework, other (9 values)
- Retroactive: admin-only POST endpoint; naming from DB data where possible (no LLM); type classification via lightweight Claude call
- `suggested_name` fallback: if null, keep original filename
- `contract_type` fallback: default to "other"
- Pipeline-spawned tasks: Tasks 2, 4, 5 after Task 1 passes; Tasks 3, 6 after Task 2 passes

## Execution Log

<!-- Updated as tasks complete -->
