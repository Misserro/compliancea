# Task 1 Plan -- Add conditional payment exclusion to the LLM system prompt

## Overview

Three targeted edits to the system prompt string in `lib/contracts.js`, inside `extractContractTerms()`. No logic changes, no schema changes, no new files.

## Files Modified

- `lib/contracts.js` -- 3 edits within the system prompt template literal (lines 82, 87-109, 111-112)

## Changes

### Change 1 -- Line 82: Narrow payments category definition

Replace the broad `"payments" = all payment obligations (fees, invoices, deposits, refunds, penalties that are financial)` with a definition that explicitly limits payments to those CERTAIN TO OCCUR, and explicitly excludes contingent payments (reimbursements, contingent bonuses, commissions "if targets are met", travel expense refunds "if incurred").

### Change 2 -- Lines 87-109: Replace the gate block

Keep the NON-PAYMENT OBLIGATION GATE section as-is (lines 87-108). Remove the final line (109) that exempts all payments from gating. Append a new CONDITIONAL PAYMENT GATE block that:
- Requires payment obligations to be CERTAIN TO OCCUR
- Lists explicit DO NOT extract examples: expense reimbursements, contingent bonuses, commission payments, breach-contingent penalties
- Lists explicit DO extract examples: fixed recurring fees, milestone payments with calendar dates, deposits due at signing
- Directs penalty/late-interest into parent obligation's penalties field

### Change 3 -- Lines 111-112: Reinforce the gate at payment extraction heading

Replace the second line of the PAYMENT EXTRACTION heading. Instead of "You MUST extract exact payment amounts and dates.", insert a sentence that references the CONDITIONAL PAYMENT GATE and instructs to skip conditional payments entirely.

## Success Criteria Mapping

1-3. Conditional clauses (travel reimbursement, contingent bonus, commissions) -- excluded by CONDITIONAL PAYMENT GATE + narrowed category definition
4. Penalty clause -- excluded as standalone; absorbed into parent obligation's penalties field per existing "NEVER create separate obligations for penalties" rule + new gate guidance
5-6. Fixed monthly fees and deposits -- pass the gate (certain, scheduled) and continue to be extracted normally
7-8. TypeScript/build -- only string content changed, no structural code changes

## Risks

- None significant. The change is confined to prompt text within a template literal. No code logic is touched.
