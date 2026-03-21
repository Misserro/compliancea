# Task 2 Plan: Court Fee Row in Case Metadata Form

## File to modify

- `src/components/legal-hub/case-metadata-form.tsx`

## Changes

### 1. Add import (line 7, after existing imports)

```typescript
import { calculateCourtFee } from "@/lib/court-fee";
```

### 2. Insert Court Fee row in view mode grid (after line 341, the Claim Value closing `</div>`)

Insert a conditionally rendered `<div>` that only appears when `case_type === "civil"`. Uses an IIFE to compute the fee once, then renders one of three states:

- Non-PLN currency: muted text explaining PLN-only
- Valid fee result: formatted fee with "(auto)" suffix
- Null fee (missing/invalid claim): em dash

The IIFE pattern avoids calling `calculateCourtFee` twice and matches the existing `tags` IIFE pattern at line 280-287.

### 3. No changes to edit mode

The court fee is read-only by design. Edit mode (lines 113-273) is untouched.

## Risks

- None significant. Single file change, pure function import, no state changes.

## Success criteria mapping

- Civil + PLN claim -> fee row with value and "(auto)" -- handled by the `courtFee !== null` branch
- Civil + non-PLN -> muted "PLN only" note -- handled by `claim_currency !== "PLN"` guard
- Civil + null claim -> em dash -- handled by `courtFee === null` (calculateCourtFee(null) returns null)
- Non-civil -> row not rendered -- handled by outer `case_type === "civil"` conditional
- Re-render after save -> fee updates -- the component receives fresh `legalCase` prop after `onSaved()` triggers refetch
- No TS errors -> will verify with `npx tsc --noEmit`
