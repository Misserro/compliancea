# Plan 061 — Conditional Obligation Filter

Execute: /uc:plan-execution 061

## Objective

Fix the LLM-based obligation extractor so that conditional/contingent payment
obligations are never extracted. Only obligations that are certain to occur —
fixed periodic payments, milestone deliveries, notice deadlines calculated from
the contract's dates — must appear in the output.

## Context

The current system prompt in `extractContractTerms()` has a NON-PAYMENT
OBLIGATION GATE (lines 87–109) that correctly filters conditional non-payment
obligations (termination, legal, others). However, line 109 exempts the entire
`payments` category from that gate unconditionally:

> "This gate does NOT apply to payment obligations — ALL payment obligations are
> always extracted per the rules below."

The `payments` category definition (line 82) includes "refunds" and
"penalties that are financial". Because reimbursements (travel expenses,
bonuses, commissions) are financial, they are classified as `payments` and
bypass the gate entirely. The result is that clauses such as:

- "travel expenses will be reimbursed if incurred"
- "a performance bonus will be paid if targets are met"
- "commissions are payable upon successful closure"

are extracted as concrete obligations even though the triggering event may
never happen.

## Architecture

Single-file, prompt-only change. No post-processing code, no new LLM calls,
no schema changes.

- **`lib/contracts.js`** — the only file that changes. Three sections of the
  system prompt inside `extractContractTerms()` are updated:
  - Line 82: `payments` category definition
  - Lines 87–109: NON-PAYMENT OBLIGATION GATE — extended with a parallel
    CONDITIONAL PAYMENT GATE block
  - Lines 111–112: PAYMENT EXTRACTION heading — one reinforcing sentence added

## Tech Stack

- Anthropic Claude API (`claude-sonnet-4-20250514`) — system prompt drives
  extraction behaviour
- Next.js App Router / Node.js runtime
- SQLite via sql.js — no changes required

---

## Tasks

- [ ] Task 1 — Add conditional payment exclusion to the system prompt

---

### Task 1 — Add conditional payment exclusion to the system prompt

**File:** `lib/contracts.js` (system prompt inside `extractContractTerms()`)

**Description:**

Three targeted edits to the system prompt. No surrounding logic changes.

---

#### Change 1 — Line 82: narrow the `payments` category definition

**Before:**
```
  - "payments" = all payment obligations (fees, invoices, deposits, refunds, penalties that are financial)
```

**After:**
```
  - "payments" = payment obligations that are CERTAIN TO OCCUR: fixed fees, invoices, scheduled deposits, confirmed bonuses/commissions with no contingency, financial penalties with a fixed schedule. EXCLUDE any payment that only materialises if an uncertain triggering event occurs (reimbursements, contingent bonuses, commissions "if targets are met", travel expense refunds "if incurred").
```

---

#### Change 2 — Lines 87–109: replace the entire gate block

**Before (full block):**
```
NON-PAYMENT OBLIGATION GATE — CRITICAL FILTER:
For ALL non-payment obligations (termination, legal, others), apply this strict gate BEFORE extracting:
An obligation MUST have BOTH:
  1. A concrete due date — a specific YYYY-MM-DD date, or a date calculable from contract terms (e.g. "90 days before expiry" = calculate the exact date)
  2. A specific, discrete action — something that must be done once or by a deadline (not ongoing maintenance or general duties)

If an obligation fails EITHER condition, DO NOT extract it.

EXPLICITLY EXCLUDE (never extract these):
- General confidentiality obligations (ongoing duty, no specific deadline)
- General insurance maintenance ("shall maintain insurance coverage" — ongoing, no specific date)
- Ongoing compliance statements without concrete dates ("shall comply with all applicable laws" — regulatory boilerplate)
- Termination procedures without a specific notice deadline date (generic exit clauses)
- Any obligation using "shall maintain", "shall ensure", "shall comply" without a concrete YYYY-MM-DD deadline
- Boilerplate legal language (indemnification clauses, limitation of liability, governing law, dispute resolution — unless they have a specific dated action)

EXPLICITLY INCLUDE (extract these non-payment obligations):
- Service delivery milestones with a specific YYYY-MM-DD date (e.g. "deliver Phase 1 by 2025-06-15")
- Report submission deadlines with a specific date (e.g. "submit quarterly report by Jan 15" — calculate YYYY-MM-DD dates)
- Notice deadlines with calculated dates (e.g. "termination notice required 90 days before expiry" — calculate the exact YYYY-MM-DD date from the contract's expiry_date)
- Any obligation where the contract specifies a concrete date for a specific, one-time or periodic deliverable

This gate does NOT apply to payment obligations — ALL payment obligations are always extracted per the rules below.
```

**After (full replacement):**
```
NON-PAYMENT OBLIGATION GATE — CRITICAL FILTER:
For ALL non-payment obligations (termination, legal, others), apply this strict gate BEFORE extracting:
An obligation MUST have BOTH:
  1. A concrete due date — a specific YYYY-MM-DD date, or a date calculable from contract terms (e.g. "90 days before expiry" = calculate the exact date)
  2. A specific, discrete action — something that must be done once or by a deadline (not ongoing maintenance or general duties)

If an obligation fails EITHER condition, DO NOT extract it.

EXPLICITLY EXCLUDE (never extract these):
- General confidentiality obligations (ongoing duty, no specific deadline)
- General insurance maintenance ("shall maintain insurance coverage" — ongoing, no specific date)
- Ongoing compliance statements without concrete dates ("shall comply with all applicable laws" — regulatory boilerplate)
- Termination procedures without a specific notice deadline date (generic exit clauses)
- Any obligation using "shall maintain", "shall ensure", "shall comply" without a concrete YYYY-MM-DD deadline
- Boilerplate legal language (indemnification clauses, limitation of liability, governing law, dispute resolution — unless they have a specific dated action)

EXPLICITLY INCLUDE (extract these non-payment obligations):
- Service delivery milestones with a specific YYYY-MM-DD date (e.g. "deliver Phase 1 by 2025-06-15")
- Report submission deadlines with a specific date (e.g. "submit quarterly report by Jan 15" — calculate YYYY-MM-DD dates)
- Notice deadlines with calculated dates (e.g. "termination notice required 90 days before expiry" — calculate the exact YYYY-MM-DD date from the contract's expiry_date)
- Any obligation where the contract specifies a concrete date for a specific, one-time or periodic deliverable

CONDITIONAL PAYMENT GATE — applies to ALL payment obligations:
A payment obligation must be extracted ONLY if the payment is CERTAIN TO OCCUR — i.e., it does not depend on a future event that may never happen.

DO NOT extract a payment if it is conditional on an uncertain triggering event, including:
- Expense reimbursements ("travel expenses will be reimbursed if incurred" — the travel may never happen)
- Contingent bonuses ("a bonus will be paid if annual targets are met" — targets may not be met)
- Commission payments ("commissions payable upon successful deal closure" — a deal may never close)
- Penalty payments contingent on a breach ("a penalty of $X will apply if delivery is late" — no breach may occur; pack this into the parent obligation's penalties field instead)
- Any payment described with "if", "upon", "provided that", "in the event of", "subject to" where the condition is a future uncertain event

DO extract a payment if it is certain and scheduled:
- Fixed recurring fees ("$5,000/month payable by the 15th" — unconditional)
- Milestone payments tied to a specific calendar date ("$20,000 due on 2025-09-01")
- Deposits due at signing ("security deposit of $10,000 due upon contract execution")
- Agreed late-payment interest rates — pack into the parent payment obligation's penalties field, not as a separate obligation
```

---

#### Change 3 — Lines 111–112: reinforce the gate at the payment extraction heading

**Before:**
```
PAYMENT EXTRACTION — THIS IS THE MOST IMPORTANT RULE:
You MUST extract exact payment amounts and dates. A payment obligation with missing amounts or dates is INVALID.
```

**After:**
```
PAYMENT EXTRACTION — THIS IS THE MOST IMPORTANT RULE:
Only extract payments that passed the CONDITIONAL PAYMENT GATE above. A payment obligation with missing amounts or dates is INVALID. If a payment is conditional on an uncertain future event, skip it entirely — do not create an obligation record for it.
```

---

**Files:** `lib/contracts.js`

**Patterns:**
- `documentation/plans/058-obligation-extraction-improvements/README.md` — prior prompt design decisions
- `documentation/technology/architecture/data-flow.md` — extraction flow

**Success criteria:**
1. A contract clause "travel expenses will be reimbursed if incurred" → zero extracted obligations
2. A contract clause "a performance bonus of $10,000 will be paid if annual revenue targets are met" → zero obligations
3. A contract clause "commissions of 5% are payable upon successful deal closure" → zero obligations
4. A contract clause "a penalty of $500/day applies if delivery is delayed" → zero standalone payment obligations; penalty detail absorbed into parent delivery obligation's `penalties` field only
5. A contract with "Monthly service fee of $5,000 due by the 15th" → exactly 12 payment obligation records, each with non-null `date` and `amount`
6. A contract with "Deposit of $10,000 due at signing" → exactly 1 payment obligation record
7. `npx tsc --noEmit` — no errors
8. `npx next build` — passes

**Regression criteria:**
- Fixed monthly payments continue to produce 12 due_date entries with non-null `date` and `amount`
- Quarterly payments continue to produce 4 entries
- Milestone deliveries with a specific date continue to be extracted as `others`
- Termination notice deadlines (calculable from expiry date) continue to be extracted
- General confidentiality clause → zero obligations (non-payment gate unchanged)

**Dependencies:** None

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Model ignores the CONDITIONAL PAYMENT GATE under extraction pressure | Medium | High | Change 3 reinforces at the extraction block; two explicit signals. If problem persists, a post-processing code filter can be added as a follow-up. |
| A clause with "if" in a non-contingent context (e.g., "pay by the 15th if not already paid") is incorrectly blocked | Low | Medium | Gate specifies "uncertain triggering event" — context-sensitive. Regression tests catch this. |
| Narrowed `payments` definition causes confirmed bonuses with no contingency to fall into `others` | Low | Low | Updated definition explicitly keeps "confirmed bonuses/commissions with no contingency" in payments. |
| Existing DB obligations are not retroactively corrected | Certain (by design) | Low | Run `POST /api/admin/reanalyze-all-contracts` after deploy to retroactively clean up existing contracts. This is a separate deliberate step. |

## Documentation Changes

None required. `data-flow.md` describes the extraction flow at the architectural level and does not reference prompt content.
