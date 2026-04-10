# Task 3 — Cascading Payment Activation — Implementation Plan

## Files Modified

- `lib/db.js` — the only file touched

## Changes

### 1. New function: `activateNextPaymentObligation(documentId)`

Added after the existing `spawnDueObligations` function (after line ~1828).

- Queries for the next inactive payment obligation for the given document, ordered by `due_date ASC`, `LIMIT 1`
- Uses `WHERE category = 'payments'` (plural — confirmed in `analyze-contract/route.ts` line 84)
- Uses `WHERE status = 'inactive'` and `due_date IS NOT NULL`
- If found, calls `updateObligation(next.id, { status: 'active', activation: 'active' })` to update both columns

### 2. Extend `finalizeObligation(id, { note, documentId })`

After the existing `updateObligation(id, updates)` call at line 2374:

- Fetch the obligation via `getObligationById(id)` (already done at line 2375 for the return value)
- Check if `obligation.category === 'payments'`
- If yes, call `activateNextPaymentObligation(obligation.document_id)`
- Non-payment obligations skip the cascade entirely

### 3. Extend `spawnDueObligations(documentId)`

After the existing repeating-obligation for-loop (after line ~1827), add:

- Calculate 30-day threshold: `new Date()` + 30 days, formatted as `YYYY-MM-DD`
- Query for any active payment obligation with `due_date <= soonStr`
- If found, call `activateNextPaymentObligation(documentId)`
- Idempotency: `activateNextPaymentObligation` only activates the NEXT inactive one. If it was already activated, the query returns no rows (no inactive payment left to activate, or the next one is already active). Calling twice is safe.

## Idempotency Analysis

- `activateNextPaymentObligation` finds `status = 'inactive'` payments only. Once activated, a second call either finds the next one (correct) or finds nothing (no-op).
- In `spawnDueObligations`, the 30-day check + activate pattern: if the next payment was already activated by a previous call, `activateNextPaymentObligation` either activates the one after that (if the newly activated one is also within 30 days — unlikely but handled) or is a no-op.

## Risks

- None significant. All changes are additive. The `updateObligation` function already supports both `status` and `activation` fields.
