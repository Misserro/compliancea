# Plan 058 — Obligation Extraction Improvements

## Overview

Two coupled improvements to the contract obligations system:

1. **Actionable-only extraction** — Update the AI extraction prompt to only pull out obligations that require a specific action at a specific time: all payment obligations (mandatory, with amounts and dates) and operational/service delivery obligations that have concrete due dates. General maintenance obligations, confidentiality, boilerplate legal language, and ongoing compliance obligations without specific dates are excluded.

2. **Cascading payment reveal** — For contracts with multiple split payment obligations, reveal the next payment only when: the current upcoming payment is finalized (completed), OR the current upcoming payment is within 30 days of its due date. The first upcoming payment is always visible.

## Background

The current extraction extracts everything — payments, termination procedures, legal/compliance maintenance, and operational boilerplate. This produces noise that makes the obligations view harder to use. The payment splitting is already in place (analyze-contract splits multi-date payments into N records), but after the first upcoming payment is finalized, the next one never becomes active.

## Architecture

- **`lib/contracts.js`** — `extractContractTerms()` prompt (JS, CJS module)
- **`src/app/api/documents/[id]/analyze-contract/route.ts`** — explicit re-extraction trigger; add obligation cleanup before re-extracting
- **`src/app/api/admin/reanalyze-all-contracts/route.ts`** — new batch endpoint (super-admin only)
- **`lib/db.js`** — `finalizeObligation()`, `spawnDueObligations()`, new `activateNextPaymentObligation()`
- No UI changes required — existing status tab filtering (active/inactive/finalized) already provides correct display once DB cascading is in place

## Tech Stack

- Anthropic Claude API — `claude-sonnet-4-20250514` via `extractContractTerms()`
- SQLite via sql.js — all DB mutations in `lib/db.js`
- Next.js API routes — Node.js runtime

## Concurrency

3 tasks. Task 1 and Task 3 are independent (can run concurrently). Task 2 depends on Task 1 (must have updated prompt before batch re-extraction makes sense).

## Task Dependency Graph

- Task 1 (extraction prompt update): no dependencies
- Task 2 (batch re-extraction): depends on Task 1
- Task 3 (cascading payment activation): no dependencies

---

## Tasks

### Task 1 — Actionable-only extraction prompt

**Description:**
Rewrite the obligation extraction rules in `extractContractTerms()` to enforce actionable-only extraction. Currently the prompt extracts all obligation types indiscriminately.

**Changes to `lib/contracts.js`:**

1. Update category definitions in the prompt — payment stays identical. For all other obligation categories, add a strict gate: only extract if the obligation has a specific, concrete due date AND requires a definitive action (not ongoing maintenance, not general compliance, not boilerplate language).

2. Add explicit exclusion rules:
   - EXCLUDE: general confidentiality obligations (no date, no action)
   - EXCLUDE: general insurance maintenance (ongoing, no specific date)
   - EXCLUDE: general compliance statements (regulatory boilerplate)
   - EXCLUDE: termination procedures without a specific notice deadline date
   - EXCLUDE: any obligation described as "shall maintain", "shall ensure", "shall comply" without a concrete deadline

3. Add explicit inclusion rules for non-payment:
   - INCLUDE: service delivery milestones with a specific YYYY-MM-DD date
   - INCLUDE: report submission deadlines (e.g., "submit quarterly report by Jan 15")
   - INCLUDE: notice deadlines (e.g., "termination notice required 90 days before expiry" — extract with a calculated date)
   - INCLUDE: any obligation where the contract specifies a concrete date for a specific deliverable

4. Keep payment extraction rules completely unchanged — they are already comprehensive and correct.

**Files:** `lib/contracts.js`

**Success criteria:**
- A test contract with monthly payments, a confidentiality clause, and a quarterly reporting obligation extracts: all payment records (same as before) + the quarterly report deadline (with date) but NOT the confidentiality clause
- A contract with only a termination notice clause (no date specified) extracts 0 obligations from it
- TypeScript/build passes (`npx tsc --noEmit && npx next build`)

---

### Task 2 — Batch re-extraction with obligation cleanup

**Description:**
Two changes: (a) prevent duplicate obligations when re-running analyze-contract on an existing contract; (b) a batch endpoint to re-extract all org contracts in one call.

**Change A — obligation cleanup in `analyze-contract` route:**
At the top of the POST handler, before calling `extractContractTerms()`, delete all AI-extracted obligations for this contract. Keep: manually-created obligations (no clear identifier), system obligations (`obligation_type IN ('system_sign', 'system_terminate')`).

Safest approach: delete obligations where `obligation_type NOT IN ('system_sign', 'system_terminate')` AND the obligation was created by AI extraction (not manually). Since manual obligations created via POST `/api/documents/{id}/obligations` use `stage = 'active'` (hardcoded) and AI-extracted use the contract's current stage, and AI-extracted ones use `obligation_type = ob.category` (which equals the category name), there is no reliable flag to distinguish them. Add a new column `is_ai_extracted BOOLEAN DEFAULT 0` (via migration) set to `1` in `insertObligation` when called from `analyze-contract`. Then the cleanup deletes only `is_ai_extracted = 1`.

Alternative (simpler, acceptable for this use case): delete ALL obligations except `system_sign` and `system_terminate` — document this as the behavior and note that manually-added obligations will be removed on re-analysis.

Use the simpler approach — it's consistent with the expectation that analyze-contract is a "re-extract from scratch" operation.

**Change B — batch endpoint `POST /api/admin/reanalyze-all-contracts`:**
- Requires super-admin session (`session.user.isSuperAdmin === true`)
- Gets all processed, non-historical contracts for the org (`doc_type IN ('contract', 'agreement') AND processed = 1 AND is_historical = 0`)
- For each: reconstruct full text, call `extractContractTerms()`, delete existing AI-extracted obligations, insert new obligations (same payment-splitting logic as analyze-contract)
- Returns: `{ processed: N, failed: N, skipped: N, details: [...] }`
- Streams progress or returns full result at end (batch, not streaming — contracts list is bounded)

**Files:**
- `src/app/api/documents/[id]/analyze-contract/route.ts`
- `src/app/api/admin/reanalyze-all-contracts/route.ts` (new)

**Success criteria:**
- Running `POST /api/documents/{id}/analyze-contract` twice on the same contract produces the same number of obligations (not doubled)
- `POST /api/admin/reanalyze-all-contracts` (super-admin only) returns 403 for non-super-admin, processes all eligible contracts for 200
- System obligations (`system_sign`, `system_terminate`) survive re-extraction
- TypeScript clean, build passes

---

### Task 3 — Cascading payment activation

**Description:**
After a payment obligation is finalized, or when an active payment obligation is within 30 days of due date, automatically activate the next inactive payment obligation for the same contract.

**Changes to `lib/db.js`:**

**New function `activateNextPaymentObligation(documentId)`:**
```js
export function activateNextPaymentObligation(documentId) {
  // Find the next inactive payment obligation for this contract, ordered by due_date
  const next = get(
    `SELECT id FROM contract_obligations
     WHERE document_id = ?
       AND category = 'payments'
       AND status = 'inactive'
       AND due_date IS NOT NULL
     ORDER BY due_date ASC
     LIMIT 1`,
    [documentId]
  );
  if (next) {
    updateObligation(next.id, { status: 'active', activation: 'active' });
  }
}
```

**Extend `finalizeObligation(id, ...)`:**
After the existing `updateObligation(id, updates)` call, fetch the obligation to get its `category` and `document_id`. If `category === 'payments'`, call `activateNextPaymentObligation(documentId)`.

**Extend `spawnDueObligations(documentId)` (or add alongside it):**
After the existing repeating-obligation spawn loop, add a 30-day payment activation check:
```js
// Activate next payment if current upcoming is within 30 days
const soon = new Date();
soon.setDate(soon.getDate() + 30);
const soonStr = soon.toISOString().slice(0, 10);

const upcomingPayment = get(
  `SELECT id FROM contract_obligations
   WHERE document_id = ?
     AND category = 'payments'
     AND status = 'active'
     AND due_date IS NOT NULL
     AND due_date <= ?
   LIMIT 1`,
  [documentId, soonStr]
);
if (upcomingPayment) {
  activateNextPaymentObligation(documentId);
}
```

This runs on every GET `/api/documents/{id}/obligations` call (same as existing `spawnDueObligations`), so the reveal happens automatically when the user opens a contract's obligations.

**Files:** `lib/db.js`

**Success criteria:**
- Contract with 3 payment obligations (Jan, Feb, Mar): initially only Jan is active, Feb and Mar are inactive
- After finalizing Jan → Feb becomes active, Mar remains inactive
- After Feb's due date comes within 30 days (simulated) → Mar becomes active
- Finalized non-payment obligation (e.g., reporting) does NOT trigger payment activation
- `spawnDueObligations` is idempotent — calling it twice does not double-activate

---

## Risk Notes

- **Batch re-extraction is destructive** — deletes all non-system obligations. The batch endpoint is super-admin only and should be called once after deploying Task 1. Document this clearly in the endpoint response.
- **`activateNextPaymentObligation` uses due_date ordering** — if a contract has two unrelated payment streams (e.g., monthly fee + quarterly bonus), activation will interleave them by date. This is correct behavior — the user sees the next chronological payment regardless of stream.
- **Existing contracts with no inactive payments** — `activateNextPaymentObligation` is a no-op if there are no inactive payments. Safe.
