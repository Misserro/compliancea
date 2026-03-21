## Task 1 Complete — Court Fee Calculation Utility + Unit Tests

- Created: `src/lib/court-fee.ts` (new file, 21 lines)
  - Exports: `calculateCourtFee(claimValue: number | null): number | null`
  - Pure function, zero imports, zero side effects
  - Input validation via `isFinite()` catches null, NaN, Infinity, -Infinity, negatives
  - 7 fixed brackets (<=500 through <=20000) with ascending `<=` comparisons
  - Proportional 5% with `Math.min(value * 0.05, 100000)` cap for values > 20000

- Created: `tests/unit/court-fee.test.ts` (new file, 33 test cases)
  - 21 fixed bracket tests (lower edge, mid-value, upper edge for each bracket)
  - 6 proportional tests (boundary, mid, pre-cap, at-cap, above-cap)
  - 6 invalid input tests (null, negative, NaN, Infinity, -Infinity)
  - Import style matches existing `case-retrieval.test.ts` pattern

- INTEGRATION: Task 2 should import `calculateCourtFee` from `@/lib/court-fee`
- Test results: 709/709 pass (33 new court-fee tests + 676 existing tests, 0 regressions)
