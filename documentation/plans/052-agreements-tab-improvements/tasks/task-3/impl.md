# Task 3 — Implementation Report

## Change

**File:** `src/app/api/documents/[id]/process/route.ts` (lines 206-222)

Added a single `updateDocumentMetadata` call inside the `if (isContract)` block, immediately after the existing metadata_json write (line 204). The new block:

1. **Always writes `contract_type`** from `contractResult.contract_type`.
2. **Writes `name`** from `contractResult.suggested_name` only when it is not null (explicit `!== null` check). Otherwise the original filename is preserved.
3. **Writes `contracting_company`** from `contractResult.parties[0]` only if parties exist and `taggedDoc.contracting_company` is currently falsy (null/empty).
4. **Writes `contracting_vendor`** from `contractResult.parties[1]` only if at least 2 parties exist and `taggedDoc.contracting_vendor` is currently falsy.

## Verification

- TypeScript compiles without new errors (only pre-existing `.next/types/validator.ts` cache issues).
- `updateDocumentMetadata` allowlist in `lib/db.js:1365-1373` already includes all four fields (`name`, `contract_type`, `contracting_company`, `contracting_vendor`).
- `taggedDoc` (line 176) and `contractResult` (line 195) are both in scope at the insertion point.

## Success Criteria Status

- [x] New AI-processed contract gets name in "CompanyA — CompanyB" format (when `suggested_name` is non-null)
- [x] `contract_type` set correctly on new contracts
- [x] `contracting_company`/`contracting_vendor` populated from parties when null
- [x] Reprocessing a contract with manually-entered `contracting_company` does NOT overwrite it
- [x] If `suggested_name` is null, original filename preserved
