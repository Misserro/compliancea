# Lead Notes — Plan 054: GDrive Document Classification

## Plan Overview

Replace the hard-coded `doc_type = 'contract'` path in GDrive processing with AI-powered classification. Each GDrive document is classified as contract / annex / invoice / other in a single Claude call. Annexes are linked via `contract_documents`, invoices via `contract_invoices` (with new `document_id` FK). Unmatched items surface in Documents tab.

## Concurrency Decision

- **Max concurrent task-teams:** 2
- Task 1 runs alone first (lib functions + DB infra)
- Tasks 2 and 3 run in parallel after Task 1 completes

## Task Dependency Graph

- Task 1: no dependencies — runs first
- Task 2: depends on Task 1 — maintenance cycle
- Task 3: depends on Task 1 AND Task 2 — UI
- Tasks 2 and 3 run in parallel (Task 3 pipeline-spawned when Task 2 enters review)

## Key Architectural Constraints

1. **One Claude call per doc:** `classifyGDriveDocument(text)` returns classification + annexParentReference + invoiceData in one response. No second extraction call.
2. **Annex linking via `contract_documents`** — add `'annex'` to document_type enum. Use `document_id` FK (existing column) to link library documents.
3. **Invoice linking via `contract_invoices`** — add nullable `document_id` column (migration). `invoice_file_path` = document path from documents table.
4. **Ambiguity rule for invoices:** if vendor matches multiple active contracts → unmatched. Never silently pick wrong contract.
5. **Re-match loop uses stored `full_text`** — no re-Claude-calls on retry. Executor must evaluate `classification_metadata TEXT` column vs. re-running matching from `full_text`.
6. **`doc_type = 'other'` already filtered out** of contracts view — `getContractsWithSummaries` uses `WHERE doc_type IN ('contract', 'agreement')`. No query change needed.
7. **CJS boundary:** `lib/` is pure CJS. All new functions in `lib/contracts.js` and `lib/db.js` must be CJS exports.

## Critical Decisions

- Classification defaults to `'contract'` when uncertain (fail-safe — better to over-classify as contract than lose data)
- Unmatched annexes and invoices are visible in Documents tab (not silently dropped)
- GDrive-only scope for this plan — manual uploads unchanged

## Execution Log

(populated during execution)
