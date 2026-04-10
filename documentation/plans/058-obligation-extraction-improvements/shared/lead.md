# Lead Notes — Plan 058

## Plan Overview

Two coupled improvements to contract obligations:
1. **Actionable-only extraction** — Rewrite `extractContractTerms()` prompt to extract only obligations requiring a specific action at a specific time: all payments (mandatory) + operational/service deliveries with concrete dates. Exclude: general maintenance, confidentiality, boilerplate compliance, termination procedures without specific notice dates.
2. **Cascading payment reveal** — After a payment obligation is finalized OR when the active payment is within 30 days of due, automatically activate the next inactive payment. First upcoming payment is always visible.

## Concurrency Decision

3 tasks → 2 concurrent task-teams.
- Tasks 1 and 3 are independent → spawn both immediately.
- Task 2 depends on Task 1 → pipeline-spawn Task 2 when Task 1 enters review/test.

## Task Dependency Graph

- Task 1 (extraction prompt): no dependencies
- Task 2 (batch re-extraction): depends on Task 1
- Task 3 (cascading payment activation): no dependencies

## Key Architectural Constraints

1. **`lib/contracts.js` is CJS** — not TypeScript. Edit directly, no type annotations.

2. **`activation` = `status` in DB** — `insertObligation` maps `activation` param → `statusValue` and writes it to BOTH `activation` AND `status` columns:
   ```js
   const statusValue = activation || "active";
   // stored in both activation AND status columns
   ```
   When activating next payment: must update BOTH `status` and `activation` columns via `updateObligation`.

3. **Payment splitting exists** — `analyze-contract` already splits multi-date payment obligations into N records (first upcoming = active, rest = inactive). Task 3 builds the cascade on top of this.

4. **`spawnDueObligations(documentId)`** — called on every GET `/api/documents/{id}/obligations`. Task 3 should hook into this (add payment cascade check at the end) so it runs automatically on every obligations fetch.

5. **`finalizeObligation`** — currently just sets `status=finalized`. Task 3 extends it to call `activateNextPaymentObligation(documentId)` when category is 'payments'.

6. **Batch re-extraction (Task 2)** — `analyze-contract` currently does NOT delete old obligations before re-extracting. Task 2 must add deletion of all non-system obligations (`obligation_type NOT IN ('system_sign', 'system_terminate')`) before re-extracting. Batch endpoint is super-admin only.

7. **Category field in DB** — split payment obligations use `category = 'payments'` (plural, matches old prompt naming). The `CATEGORY_MIGRATION_MAP` remaps this to `payment` at render time. When querying for "next inactive payment" in Task 3: query `WHERE category = 'payments'` (DB value) OR check both — verify against actual DB data.

8. **`org_id` in `insertObligation`** — the function signature requires `orgId`. When calling from batch endpoint, pass the doc's org_id.

## Files Involved

- `lib/contracts.js` — Task 1 (extraction prompt)
- `src/app/api/documents/[id]/analyze-contract/route.ts` — Task 2 (cleanup before re-extract)
- `src/app/api/admin/reanalyze-all-contracts/route.ts` — Task 2 (new batch endpoint)
- `lib/db.js` — Task 3 (new `activateNextPaymentObligation`, extend `finalizeObligation` and `spawnDueObligations`)

## Execution Log

- Task 1 DONE: NON-PAYMENT OBLIGATION GATE added to extractContractTerms() prompt (lines 87-109). Payment extraction untouched. All exclusion/inclusion rules present. Review PASS + Test PASS. TypeScript clean, build passes.
- Task 3 DONE: activateNextPaymentObligation(), finalizeObligation cascade, spawnDueObligations 30-day check. All use category='payments'. Both status+activation columns updated. Review PASS + Test PASS.
- Task 2 DONE: analyze-contract route deletes non-system obligations before re-extracting (line 65). New batch endpoint POST /api/admin/reanalyze-all-contracts with requireSuperAdmin guard, runtime=nodejs, full payment-splitting logic. Review PASS + Test PASS.
- FINAL GATE PASS (2026-04-10): All 9 checks passed — TypeScript clean, build passes, all deliverables verified. Plan 058 complete.

