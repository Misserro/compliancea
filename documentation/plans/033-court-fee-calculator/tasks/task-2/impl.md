# Task 2 Complete -- Court Fee Row in Case Metadata Form

## Changes

- Modified: `src/components/legal-hub/case-metadata-form.tsx`
  - Line 8: Added `import { calculateCourtFee } from "@/lib/court-fee";`
  - Lines 343-361: Inserted Court Fee row in view-mode grid, immediately after the Claim Value block

## Implementation details

- Used IIFE pattern `(() => { ... })()` to compute `courtFee` once, matching the existing `tags` IIFE pattern at line 280-287 in the same file
- Three-way conditional: non-PLN currency -> muted note, valid fee -> formatted with "(auto)", null fee -> em dash
- Outer guard `legalCase.case_type === "civil"` ensures the row is not rendered for non-civil case types
- No changes to edit mode (lines 113-273)
- No other files modified

## Verification

- `npx tsc --noEmit` passes with zero errors
- No new imports beyond `calculateCourtFee` from the task-1 utility
