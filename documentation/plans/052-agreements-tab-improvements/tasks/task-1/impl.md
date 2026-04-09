# Task 1 — Implementation Notes

## Changes Made

### `lib/db.js`
1. **Migration** (line ~365): Added `{ name: "contract_type", def: "TEXT" }` to `contractMetadataColumns` array (alongside other contract-specific columns). Idempotent via try/catch.
2. **`updateDocumentMetadata` allowlist** (line ~1373): Added `"contract_type"` and `"name"` to `allowedFields`.
3. **`updateContractMetadata` allowlist** (line ~2309): Added `"contract_type"` to `allowedFields`.
4. **`getContractsWithSummaries`**: Added `d.contract_type` to both org-scoped (line ~2008) and non-org-scoped (line ~2026) SELECT statements.

### `src/lib/types.ts`
- Added `contract_type: string | null` to `Document` interface (after `expiry_date`)
- Added `contract_type: string | null` to `Contract` interface (after `expiry_date`)

### `src/lib/constants.ts`
- Added `CONTRACT_TYPES` constant (9 entries, `{ value, label }` format) after `CONTRACT_STATUSES`

## Verification
- TypeScript compiles without errors (only pre-existing `.next/types/` cache errors, unrelated)
- All success criteria met
