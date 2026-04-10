# Task 1 — Implementation Plan

## Goal
Rewrite the obligation extraction system prompt in `extractContractTerms()` (lib/contracts.js) so non-payment obligations are only extracted when they have a concrete due date AND require a specific action.

## File to Modify
- `lib/contracts.js` — lines 21-116 (the `systemPrompt` template literal)

## What Changes

### 1. Add NON-PAYMENT EXTRACTION GATE (new section after CATEGORY RULES, before PAYMENT EXTRACTION)

Add a new clearly-delimited section titled "NON-PAYMENT OBLIGATION GATE" with:

**Exclusion rules:**
- EXCLUDE: general confidentiality obligations (no specific date, ongoing duty)
- EXCLUDE: general insurance maintenance (ongoing, no specific deadline)
- EXCLUDE: ongoing compliance statements without concrete dates (regulatory boilerplate)
- EXCLUDE: termination procedures without a specific notice deadline date
- EXCLUDE: any obligation using "shall maintain", "shall ensure", "shall comply" without a concrete YYYY-MM-DD deadline

**Inclusion rules (non-payment obligations MUST meet ALL of these):**
- Has a concrete due date (specific YYYY-MM-DD or calculable from contract dates)
- Requires a specific, discrete action (not ongoing maintenance)
- Examples that qualify:
  - Service delivery milestones with specific dates
  - Report submission deadlines with specific dates (e.g., "submit quarterly report by Jan 15")
  - Notice deadlines with calculated dates (e.g., "termination notice required 90 days before expiry" -> calculate the date)

### 2. Keep PAYMENT EXTRACTION unchanged
The entire "PAYMENT EXTRACTION — THIS IS THE MOST IMPORTANT RULE" section (lines 87-116) stays byte-for-byte identical.

### 3. Keep category definitions unchanged
The 4 categories (payments, termination, legal, others) stay the same. The gate only affects WHICH non-payment obligations get extracted, not how they are categorized.

### 4. No changes to post-processing code
Lines 118-220 (API call, JSON parsing, validation, normalization) remain untouched.

## Risks / Trade-offs
- The prompt is already long. Adding more rules increases token usage slightly but the extraction quality improvement justifies it.
- The AI might still occasionally extract borderline obligations. The rules are written to be as explicit as possible to minimize this.
- No code logic changes, only prompt text -- so TypeScript/build verification is straightforward.

## Success Criteria Verification
- Payment extraction: unchanged (all payment rules identical)
- Non-payment with date + action: extracted (report deadlines, milestones)
- Non-payment without date or without action: excluded (confidentiality, insurance maintenance, boilerplate)
- TypeScript clean: `npx tsc --noEmit` passes
- Build passes: `npx next build` passes
