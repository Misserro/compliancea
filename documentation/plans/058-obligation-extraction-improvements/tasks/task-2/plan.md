# Task 2 — Batch Re-extraction with Obligation Cleanup

## Overview

Two changes:
- (A) In `analyze-contract` route: delete all non-system obligations before re-extracting to prevent duplicates
- (B) New `POST /api/admin/reanalyze-all-contracts` endpoint: super-admin only, re-extracts all processed non-historical contracts for the org

## Files to Modify

### 1. `src/app/api/documents/[id]/analyze-contract/route.ts` (modify)

**Change:** Add obligation cleanup before extraction. After the `doc` validation checks (line ~49) and before calling `extractContractTerms()` (line ~64), insert:

```ts
// Delete all non-system obligations before re-extracting (prevents duplicates)
run(
  `DELETE FROM contract_obligations WHERE document_id = ? AND obligation_type NOT IN ('system_sign', 'system_terminate')`,
  [docId]
);
```

**Import addition:** Add `run` to the `@/lib/db-imports` import.

This follows the "simpler approach" from the plan: delete ALL obligations except system ones. No new column needed.

### 2. `src/app/api/admin/reanalyze-all-contracts/route.ts` (new file)

**Pattern:** Follow `src/app/api/admin/migrate-contract-hub/route.ts` exactly:
- Import `auth` from `@/auth`
- Import `requireSuperAdmin` from `@/lib/require-super-admin`
- Use `ensureDb` from `@/lib/server-utils`
- `export const runtime = "nodejs"`
- POST handler with `requireSuperAdmin` guard

**Logic:**
1. Get session, check super-admin
2. `await ensureDb()`
3. Get orgId from session
4. Query all eligible contracts: `SELECT id, name, status, full_text FROM documents WHERE org_id = ? AND doc_type IN ('contract', 'agreement') AND processed = 1 AND is_historical = 0`
5. For each contract:
   - Reconstruct full text (from `full_text` or chunks fallback)
   - Delete non-system obligations: `DELETE FROM contract_obligations WHERE document_id = ? AND obligation_type NOT IN ('system_sign', 'system_terminate')`
   - Call `extractContractTerms(fullText)`
   - Insert obligations using same payment-splitting logic as analyze-contract
   - Track processed/failed/skipped counts
6. Return `{ processed, failed, skipped, details }`

**Imports needed from `@/lib/db-imports`:**
- `query`, `run`, `getDocumentById`, `getChunksByDocumentId`, `insertObligation`, `getObligationById`, `createTaskForObligation`

**Imports needed from `@/lib/contracts-imports`:**
- `extractContractTerms`

### 3. `src/lib/db-imports.ts` (no change needed)

`run` and `query` are already exported from db-imports.ts (lines 7-8). All needed functions are already re-exported.

## Approach Details

### Obligation insertion logic

The batch endpoint needs to replicate the obligation creation logic from `analyze-contract/route.ts`. Rather than extracting a shared function (which would be scope creep), I will copy the same logic block:
- Map contract status to active stage
- Split multi-date payment obligations
- Create tasks for active obligations

This keeps the batch endpoint self-contained and avoids touching `analyze-contract` logic beyond adding the deletion.

### Error handling in batch

Each contract is processed in a try/catch. Failures on one contract don't stop the batch. Each result goes into the `details` array with contract id, name, status (processed/failed/skipped), obligation count, and error if applicable.

### Skipped contracts

A contract is "skipped" if it has no text content (no `full_text` and no chunks). This is logged in details but not counted as a failure.

## Success Criteria Verification

1. **No duplicate obligations on re-extract:** The DELETE before extractContractTerms ensures this.
2. **System obligations survive:** The WHERE clause explicitly excludes `system_sign` and `system_terminate`.
3. **403 for non-super-admin:** Uses `requireSuperAdmin(session)` pattern from migrate-contract-hub.
4. **Processes eligible contracts:** Query filters by `doc_type IN ('contract', 'agreement') AND processed = 1 AND is_historical = 0`.
5. **Returns correct response shape:** `{ processed, failed, skipped, details }`.
6. **TypeScript clean:** Using existing typed imports, following established patterns.

## Risks

- Batch endpoint copies obligation creation logic from analyze-contract. If that logic changes (e.g., Task 1 changes the prompt output format), the batch endpoint must be consistent. Since Task 1 only changes the prompt (not the output schema), this is safe.
- Batch processing is synchronous and sequential. For orgs with many contracts, this could time out. Acceptable per plan ("contracts list is bounded").
