# Task 1 Plan: Court Fee Calculation Utility + Unit Tests

## Files to Create

1. **`src/lib/court-fee.ts`** (new file)
   - Single exported pure function: `calculateCourtFee(claimValue: number | null): number | null`
   - Zero imports, zero side effects
   - Input validation: null, NaN, Infinity, negative -> return null
   - 7 fixed brackets for values <= 20000 PLN
   - Proportional 5% for values > 20000, capped at 100000

2. **`tests/unit/court-fee.test.ts`** (new file)
   - Import style: `import { describe, it, expect } from "vitest"` (matches `case-retrieval.test.ts` pattern)
   - Import path: `../../src/lib/court-fee` (relative, matching existing test conventions)
   - Three describe blocks:
     - Fixed brackets: all 7 brackets with lower edge, mid-value, and upper edge tests (21 tests)
     - Proportional: boundary at 20000.01, mid-range 47500, pre-cap 1000000, at-cap 2000000, above-cap 3000000 and 10000000 (6 tests)
     - Invalid inputs: null, -1, -0.01, NaN, Infinity, -Infinity (6 tests)
   - Total: 33 test cases covering every success criterion

## Implementation Details

The function is a pure if-else chain with early return for invalid inputs:
- `claimValue === null || !isFinite(claimValue) || claimValue < 0` catches null, NaN, Infinity, -Infinity, and negatives
- `isFinite()` returns false for NaN and +/-Infinity in JavaScript
- Fixed brackets use `<=` comparisons in ascending order
- Proportional uses `Math.min(claimValue * 0.05, 100000)`

## Risks

- None. Pure function, no dependencies, no side effects, no integration points.

## Verification

- `npm test -- --reporter=verbose` to confirm all tests pass
- Vitest config already includes `tests/**/*.test.ts` glob, so new test file will be picked up automatically
