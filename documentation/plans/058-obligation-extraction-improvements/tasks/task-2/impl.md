## Task 2 Complete — Batch re-extraction with obligation cleanup

### Files Modified
- **`src/app/api/documents/[id]/analyze-contract/route.ts`** — Added `run` import from `@/lib/db-imports`. Added DELETE statement before `extractContractTerms()` call that removes all obligations where `obligation_type NOT IN ('system_sign', 'system_terminate')` for the document being re-analyzed. This prevents obligation duplication on re-extraction.

### Files Created
- **`src/app/api/admin/reanalyze-all-contracts/route.ts`** — New POST endpoint, super-admin only. Queries all eligible contracts (`doc_type IN ('contract', 'agreement') AND processed = 1 AND is_historical = 0`) for the session org. For each contract: reconstructs full text, deletes non-system obligations, calls `extractContractTerms()`, inserts new obligations with same payment-splitting logic as analyze-contract. Returns `{ processed, failed, skipped, total, details }`.

### Design Decisions
- Used the "simpler approach" from the plan: delete ALL non-system obligations on re-extract (not just AI-extracted ones). This means manually-added obligations are also removed. Documented in plan as acceptable since analyze-contract is a "re-extract from scratch" operation.
- Batch endpoint replicates the obligation creation logic from analyze-contract rather than extracting a shared function. This avoids modifying analyze-contract's core logic and keeps changes scoped.
- Each contract in the batch is independently try/caught — one failure does not stop the batch.
- Audit action for batch is `contract_reanalyzed` with `batch: true` metadata, distinct from the single-contract `contract_analyzed` action.

### Verification
- `npx tsc --noEmit` passes cleanly
- System obligations (`system_sign`, `system_terminate`) are explicitly excluded from deletion via the WHERE clause
- Super-admin gate uses `requireSuperAdmin(session)` pattern from `migrate-contract-hub/route.ts`

### INTEGRATION
- This endpoint is intended to be called once after deploying Task 1 (updated extraction prompt) to re-extract all existing contracts with the new prompt.
- The obligation creation logic mirrors analyze-contract exactly. If that logic changes in the future, both files must be updated.
