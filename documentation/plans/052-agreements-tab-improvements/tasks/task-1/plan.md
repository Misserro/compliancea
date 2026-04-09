# Task 1 — DB Migration + Types + Constants — Implementation Plan

## Changes

### 1. `lib/db.js` — DB migration (add `contract_type` column)

Add `contract_type` to the `phase0Columns` array (line ~80) following the existing pattern:

```js
{ name: "contract_type", def: "TEXT" },
```

This is safe and idempotent — the try/catch loop handles existing columns.

### 2. `lib/db.js` — `updateDocumentMetadata` allowlist (line 1364)

Add `"contract_type"` and `"name"` to the `allowedFields` array. `"name"` is needed by Task 3 to update the document name from AI-suggested names.

### 3. `lib/db.js` — `updateContractMetadata` allowlist (line 2298)

Add `"contract_type"` to the `allowedFields` array. (`"name"` is already present.)

### 4. `lib/db.js` — `getContractsWithSummaries` SELECT (lines 2004, 2023)

Add `d.contract_type` to both SELECT field lists (org-scoped and non-org-scoped variants), after `d.expiry_date`.

### 5. `src/lib/types.ts` — TypeScript interfaces

Add `contract_type: string | null` to:
- `Document` interface (after `expiry_date`, line ~39)
- `Contract` interface (after `expiry_date`, line ~197)

### 6. `src/lib/constants.ts` — `CONTRACT_TYPES` constant

Add after `CONTRACT_STATUSES` (line 17):

```ts
export const CONTRACT_TYPES = [
  { value: "vendor", label: "Vendor / Supplier Agreement" },
  { value: "b2b", label: "B2B / Service Agreement" },
  { value: "employment", label: "Employment / HR Contract" },
  { value: "nda", label: "NDA / Confidentiality Agreement" },
  { value: "lease", label: "Lease / Rental Agreement" },
  { value: "licensing", label: "Licensing / IP Agreement" },
  { value: "partnership", label: "Partnership / Joint Venture" },
  { value: "framework", label: "Framework / Master Agreement" },
  { value: "other", label: "Other" },
] as const;
```

Using `{ value, label }` format consistent with `CONTRACT_DOCUMENT_TYPES` (line 128) for use in dropdowns and display.

## Risk

None — all changes are additive. The ALTER TABLE migration is idempotent. Allowlist additions are non-breaking. Type additions are optional fields.
