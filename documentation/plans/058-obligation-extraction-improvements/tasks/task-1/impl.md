# Task 1 — Implementation Notes

## Task 1 Complete — Actionable-only obligation extraction prompt

- Modified: `lib/contracts.js` (lines 87-109 in the `systemPrompt` template literal inside `extractContractTerms()`)
- Added: "NON-PAYMENT OBLIGATION GATE" section between CATEGORY RULES and PAYMENT EXTRACTION sections
- Payment extraction rules: unchanged (byte-for-byte identical, lines 111+ in modified file)
- Post-processing code: unchanged (lines 140+ — API call, JSON parsing, validation, normalization)

## What Changed

Inserted a new prompt section "NON-PAYMENT OBLIGATION GATE -- CRITICAL FILTER" that:

1. Requires ALL non-payment obligations (termination, legal, others) to have BOTH:
   - A concrete due date (specific YYYY-MM-DD or calculable from contract terms)
   - A specific, discrete action (not ongoing maintenance)

2. Explicitly excludes:
   - General confidentiality obligations
   - General insurance maintenance
   - Ongoing compliance without dates
   - Termination procedures without specific notice dates
   - "shall maintain/ensure/comply" without YYYY-MM-DD deadlines
   - Boilerplate legal language (indemnification, limitation of liability, governing law, dispute resolution)

3. Explicitly includes:
   - Service delivery milestones with specific dates
   - Report submission deadlines with specific dates
   - Notice deadlines with calculated dates (e.g., 90 days before expiry)
   - Any obligation with a concrete date for a specific deliverable

## Verification

- `npx tsc --noEmit` — passes clean (no errors)
- `npx next build` — passes clean (production build succeeds)

## INTEGRATION

- Task 2 (batch re-extraction) will use this updated prompt when re-analyzing all contracts
- After deploying, existing contracts should be re-analyzed to benefit from the improved extraction
