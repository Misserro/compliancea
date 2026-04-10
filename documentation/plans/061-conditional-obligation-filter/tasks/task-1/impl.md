# Task 1 Implementation Notes -- Conditional Payment Exclusion in System Prompt

## Changes

- Modified: `lib/contracts.js` (3 edits within the system prompt template literal in `extractContractTerms()`)

### Change 1 -- Line 82: Narrowed payments category definition
- Before: `"payments" = all payment obligations (fees, invoices, deposits, refunds, penalties that are financial)`
- After: Payments now explicitly limited to obligations CERTAIN TO OCCUR. Excludes reimbursements, contingent bonuses, commissions "if targets are met", travel expense refunds "if incurred".

### Change 2 -- Lines 109-123 (was line 109): Replaced payment exemption with CONDITIONAL PAYMENT GATE
- Removed: `This gate does NOT apply to payment obligations — ALL payment obligations are always extracted per the rules below.`
- Added: Full CONDITIONAL PAYMENT GATE block with explicit DO NOT extract examples (expense reimbursements, contingent bonuses, commission payments, breach-contingent penalties) and DO extract examples (fixed recurring fees, milestone payments, deposits, late-payment interest packed into parent).

### Change 3 -- Line 126 (was line 112): Reinforced gate at payment extraction heading
- Before: `You MUST extract exact payment amounts and dates. A payment obligation with missing amounts or dates is INVALID.`
- After: `Only extract payments that passed the CONDITIONAL PAYMENT GATE above. A payment obligation with missing amounts or dates is INVALID. If a payment is conditional on an uncertain future event, skip it entirely — do not create an obligation record for it.`

## Integration Notes

- No exports changed. No function signatures changed. No schema changes.
- The NON-PAYMENT OBLIGATION GATE (lines 87-107) is completely unchanged.
- Existing payment extraction rules (search, amount extraction, recurring date calculation, examples) are untouched below line 127.
- After deploying, run `POST /api/admin/reanalyze-all-contracts` to retroactively clean up existing contracts (separate operational step, not part of this task).
