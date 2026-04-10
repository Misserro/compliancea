# Task 3 Complete -- Cascading Payment Activation

## Changes

- Modified: `lib/db.js`
  - **New function `activateNextPaymentObligation(documentId)`** (line ~1849): Queries for the next inactive payment obligation (`category = 'payments'`, `status = 'inactive'`) ordered by `due_date ASC`, activates it by setting both `status` and `activation` to `'active'` via `updateObligation`.
  - **Extended `spawnDueObligations(documentId)`** (lines ~1829-1846): After the repeating-obligation spawn loop, calculates a 30-day threshold and checks if any active payment has `due_date <= threshold`. If so, calls `activateNextPaymentObligation(documentId)`.
  - **Extended `finalizeObligation(id, { note, documentId })`** (lines ~2410-2415): After setting status=finalized, fetches the obligation and checks `category === 'payments'`. If true, calls `activateNextPaymentObligation(document_id)`. Non-payment finalization does not trigger cascade.

## Exports

- `activateNextPaymentObligation(documentId)` -- new exported function

## Verification

- `npx tsc --noEmit` -- passes (no output)
- `npx next build` -- passes (all routes compile)

## Idempotency

- `activateNextPaymentObligation` only finds `status = 'inactive'` rows. Once activated, a repeat call either finds the next inactive one or is a no-op.
- `spawnDueObligations` 30-day check: if called twice, the second call either activates the next payment (if the previously activated one is also within 30 days) or is a no-op (the next inactive was already activated).

## INTEGRATION Notes

- Task 2 (batch re-extraction) may delete and recreate obligations. After re-extraction, the first upcoming payment is set to active by `analyze-contract` and the rest are inactive. The cascade will activate them as needed via subsequent `spawnDueObligations` calls.
