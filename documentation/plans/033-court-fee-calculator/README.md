# Plan 033: Polish Court Fee Calculator

> Execute: /uc:plan-execution 033

## Objective

Automatically calculate the Polish civil court fee (opłata sądowa) from the existing `claim_value` field and display it as a read-only derived field in the case overview panel. The fee is never stored — it is computed on render from the current claim value.

## Context

- `LegalCase.claim_value: number | null` — source field, already in DB and UI
- `LegalCase.claim_currency: string` — defaults to `"PLN"`; fee only applies to PLN claims
- `LegalCase.case_type: string` — fee only shown for `"civil"` cases
- Fee logic: fixed brackets up to 20 000 PLN, then 5% proportional capped at 100 000 PLN
- Legal basis: Art. 13 ustawy z dnia 28 lipca 2005 r. o kosztach sądowych w sprawach cywilnych (property-rights cases)

## Tech Stack

- **TypeScript** — pure calculation utility in `src/lib/`
- **React** — read-only display row added to existing `CaseMetadataForm` view mode
- **Vitest** — unit tests in `tests/unit/`

## Fee Calculation Rules

### Fixed brackets (claim value ≤ 20 000 PLN)

| Claim value range (PLN) | Court fee (PLN) |
|------------------------|----------------|
| 0 – 500 | 30 |
| 500.01 – 1 500 | 100 |
| 1 500.01 – 4 000 | 200 |
| 4 000.01 – 7 500 | 400 |
| 7 500.01 – 10 000 | 500 |
| 10 000.01 – 15 000 | 750 |
| 15 000.01 – 20 000 | 1 000 |

### Proportional (claim value > 20 000 PLN)

- Fee = 5% × claim value
- Maximum: 100 000 PLN

### Validation

- `null`, `NaN`, `Infinity`, negative → return `null` (invalid input)
- `0` → 30 PLN (falls in first bracket)
- Decimal values: apply thresholds as-is (no rounding of input)
- Fee result: return as-computed integer where brackets apply; proportional may be decimal

## Expected Examples

| Claim value | Court fee |
|-------------|-----------|
| 400 | 30 |
| 1 200 | 100 |
| 3 500 | 200 |
| 7 000 | 400 |
| 9 000 | 500 |
| 12 000 | 750 |
| 18 000 | 1 000 |
| 47 500 | 2 375 |
| 3 000 000 | 100 000 |

## UI Behaviour

- **Shown when:** `case_type === "civil"`
- **Hidden when:** any other case type
- **PLN claims:** show formatted fee, e.g. `2 375 PLN (auto)`
- **Non-PLN claims:** show muted note `"Court fee calculation applies to PLN claims only"`
- **Invalid / missing claim value:** show `—`
- **Updates automatically:** derived on render from `legalCase.claim_value` — no extra fetch needed

## Scope

### In Scope

- `src/lib/court-fee.ts` — `calculateCourtFee(claimValue: number | null): number | null`
- `src/components/legal-hub/case-metadata-form.tsx` — read-only Court Fee row in view mode
- `tests/unit/court-fee.test.ts` — full boundary and edge-case coverage

### Out of Scope

- Storing the calculated fee in the database
- Court fee calculation for non-civil case types
- Fee calculation for non-PLN currencies (no conversion)
- Manual override of the calculated fee
- Fee calculation for criminal, administrative, or family cases (different rules)

## Success Criteria

- [ ] `calculateCourtFee(400)` returns `30`
- [ ] `calculateCourtFee(1200)` returns `100`
- [ ] `calculateCourtFee(3500)` returns `200`
- [ ] `calculateCourtFee(7000)` returns `400`
- [ ] `calculateCourtFee(9000)` returns `500`
- [ ] `calculateCourtFee(12000)` returns `750`
- [ ] `calculateCourtFee(18000)` returns `1000`
- [ ] `calculateCourtFee(47500)` returns `2375`
- [ ] `calculateCourtFee(3000000)` returns `100000`
- [ ] `calculateCourtFee(null)` returns `null`
- [ ] `calculateCourtFee(-1)` returns `null`
- [ ] `calculateCourtFee(NaN)` returns `null`
- [ ] `calculateCourtFee(0)` returns `30`
- [ ] `calculateCourtFee(500)` returns `30` (boundary: upper edge of first bracket)
- [ ] `calculateCourtFee(500.01)` returns `100` (boundary: lower edge of second bracket)
- [ ] `calculateCourtFee(20000)` returns `1000` (last fixed bracket)
- [ ] `calculateCourtFee(20000.01)` returns proportional result ≈ 1000.0005
- [ ] Court fee row visible in case overview for `case_type === "civil"` with PLN claim
- [ ] Court fee row hidden for `case_type === "criminal"`
- [ ] Non-PLN civil case shows "PLN only" note instead of a fee
- [ ] Changing claim value in form and saving → refreshed fee on next render
- [ ] All existing tests pass (0 regressions)

---

## Tasks

### Task 1: Court Fee Calculation Utility + Unit Tests

**Description:**

Create `src/lib/court-fee.ts` with a single exported function:

```typescript
/**
 * Calculates the Polish civil court fee (opłata sądowa) for property-rights cases.
 * Based on Art. 13 ustawy z dnia 28 lipca 2005 r. o kosztach sądowych w sprawach cywilnych.
 *
 * @param claimValue - Claim value in PLN. Null, negative, NaN → returns null.
 * @returns Court fee in PLN, or null if the input is invalid.
 */
export function calculateCourtFee(claimValue: number | null): number | null {
  if (claimValue === null || !isFinite(claimValue) || claimValue < 0) return null;

  if (claimValue <= 500) return 30;
  if (claimValue <= 1500) return 100;
  if (claimValue <= 4000) return 200;
  if (claimValue <= 7500) return 400;
  if (claimValue <= 10000) return 500;
  if (claimValue <= 15000) return 750;
  if (claimValue <= 20000) return 1000;

  return Math.min(claimValue * 0.05, 100000);
}
```

Then create `tests/unit/court-fee.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calculateCourtFee } from "../../src/lib/court-fee";

describe("calculateCourtFee — fixed brackets", () => {
  it("0 PLN → 30", () => expect(calculateCourtFee(0)).toBe(30));
  it("400 PLN → 30", () => expect(calculateCourtFee(400)).toBe(30));
  it("500 PLN → 30 (upper edge of bracket 1)", () => expect(calculateCourtFee(500)).toBe(30));
  it("500.01 PLN → 100 (lower edge of bracket 2)", () => expect(calculateCourtFee(500.01)).toBe(100));
  it("1200 PLN → 100", () => expect(calculateCourtFee(1200)).toBe(100));
  it("1500 PLN → 100 (upper edge of bracket 2)", () => expect(calculateCourtFee(1500)).toBe(100));
  it("1500.01 PLN → 200", () => expect(calculateCourtFee(1500.01)).toBe(200));
  it("3500 PLN → 200", () => expect(calculateCourtFee(3500)).toBe(200));
  it("4000 PLN → 200 (upper edge of bracket 3)", () => expect(calculateCourtFee(4000)).toBe(200));
  it("4000.01 PLN → 400", () => expect(calculateCourtFee(4000.01)).toBe(400));
  it("7000 PLN → 400", () => expect(calculateCourtFee(7000)).toBe(400));
  it("7500 PLN → 400 (upper edge of bracket 4)", () => expect(calculateCourtFee(7500)).toBe(400));
  it("7500.01 PLN → 500", () => expect(calculateCourtFee(7500.01)).toBe(500));
  it("9000 PLN → 500", () => expect(calculateCourtFee(9000)).toBe(500));
  it("10000 PLN → 500 (upper edge of bracket 5)", () => expect(calculateCourtFee(10000)).toBe(500));
  it("10000.01 PLN → 750", () => expect(calculateCourtFee(10000.01)).toBe(750));
  it("12000 PLN → 750", () => expect(calculateCourtFee(12000)).toBe(750));
  it("15000 PLN → 750 (upper edge of bracket 6)", () => expect(calculateCourtFee(15000)).toBe(750));
  it("15000.01 PLN → 1000", () => expect(calculateCourtFee(15000.01)).toBe(1000));
  it("18000 PLN → 1000", () => expect(calculateCourtFee(18000)).toBe(1000));
  it("20000 PLN → 1000 (last fixed bracket)", () => expect(calculateCourtFee(20000)).toBe(1000));
});

describe("calculateCourtFee — proportional (> 20 000 PLN)", () => {
  it("20000.01 PLN → ~1000.0005 (proportional starts)", () => {
    const fee = calculateCourtFee(20000.01);
    expect(fee).toBeCloseTo(1000.0005, 3);
  });
  it("47500 PLN → 2375", () => expect(calculateCourtFee(47500)).toBe(2375));
  it("1000000 PLN → 50000", () => expect(calculateCourtFee(1000000)).toBe(50000));
  it("2000000 PLN → 100000 (cap)", () => expect(calculateCourtFee(2000000)).toBe(100000));
  it("3000000 PLN → 100000 (cap)", () => expect(calculateCourtFee(3000000)).toBe(100000));
  it("10000000 PLN → 100000 (cap holds)", () => expect(calculateCourtFee(10000000)).toBe(100000));
});

describe("calculateCourtFee — invalid inputs", () => {
  it("null → null", () => expect(calculateCourtFee(null)).toBeNull());
  it("-1 PLN → null", () => expect(calculateCourtFee(-1)).toBeNull());
  it("-0.01 PLN → null", () => expect(calculateCourtFee(-0.01)).toBeNull());
  it("NaN → null", () => expect(calculateCourtFee(NaN)).toBeNull());
  it("Infinity → null", () => expect(calculateCourtFee(Infinity)).toBeNull());
  it("-Infinity → null", () => expect(calculateCourtFee(-Infinity)).toBeNull());
});
```

**Files:**
- `src/lib/court-fee.ts` — new file, pure calculation function
- `tests/unit/court-fee.test.ts` — new file, full boundary tests

**Success criteria:**
- [ ] All test cases in the test file pass (`npm test` green)
- [ ] `calculateCourtFee` is a pure function with no imports, no side effects
- [ ] All 9 expected examples from the spec return correct values

**Dependencies:** none

---

### Task 2: Court Fee Row in Case Metadata Form

**Description:**

Add a read-only "Court Fee" row to the **view mode** of `CaseMetadataForm` (`src/components/legal-hub/case-metadata-form.tsx`), immediately after the existing Claim Value cell.

**Changes to make:**

1. Import `calculateCourtFee` at the top of the file:
   ```typescript
   import { calculateCourtFee } from "@/lib/court-fee";
   ```

2. In the view-mode grid (after the Claim Value `<div>` at line ~335), insert a new grid cell:

   ```tsx
   {legalCase.case_type === "civil" && (
     <div>
       <div className="text-muted-foreground text-xs font-medium mb-1">Court Fee</div>
       <div>
         {legalCase.claim_currency !== "PLN" ? (
           <span className="text-muted-foreground text-xs">
             Court fee calculation applies to PLN claims only
           </span>
         ) : calculateCourtFee(legalCase.claim_value) !== null ? (
           `${calculateCourtFee(legalCase.claim_value)!.toLocaleString()} PLN (auto)`
         ) : (
           "—"
         )}
       </div>
     </div>
   )}
   ```

   Notes:
   - `calculateCourtFee` is called at most twice per render (once for the guard, once for display) — acceptable for a pure function this cheap. If preferred, use a local variable `const courtFee = calculateCourtFee(legalCase.claim_value)` before the JSX.
   - The "(auto)" suffix makes it clear to the user that this is a system-calculated value.
   - The row only appears in the grid when `case_type === "civil"` — no layout shifts for other case types.
   - No change to edit mode — court fee is read-only by design.

**Files:**
- `src/components/legal-hub/case-metadata-form.tsx` — add import + view-mode grid cell

**Success criteria:**
- [ ] Civil case with PLN claim value → Court Fee row visible with correct value and "(auto)" label
- [ ] Civil case with non-PLN claim (e.g. EUR) → Court Fee row shows "Court fee calculation applies to PLN claims only"
- [ ] Civil case with no claim value → Court Fee row shows "—"
- [ ] Criminal / administrative / labor / family / commercial case → Court Fee row not rendered
- [ ] After saving a new claim value via the edit form, the refreshed view shows the updated court fee
- [ ] No TypeScript errors (`tsc --noEmit` clean)

**Dependencies:** Task 1 (requires `src/lib/court-fee.ts` to exist)
