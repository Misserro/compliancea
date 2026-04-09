# Task 6 — Implementation Report

## Files Created

### `src/app/api/admin/backfill-contract-types/route.ts` (new)
POST endpoint that retroactively names and classifies existing contracts.

- **Auth**: checks `session.user.isSuperAdmin` OR `orgRole in ['owner', 'admin']` — returns 401/403 otherwise
- **Org-scoped**: fetches contracts via `getContractsWithSummaries(orgId)`, fetches full docs via `getDocumentById(id, orgId)`
- **Skip logic**: contracts with name containing " — " (em dash, U+2014) AND `contract_type` already set are skipped
- **Naming** (no LLM):
  - `contracting_company` + `contracting_vendor` → "Company — Vendor"
  - Only one set → use that
  - Neither → parse `metadata_json.parties` (with try/catch for JSON.parse)
  - Claude's `suggested_name` used as final fallback
- **Classification**: lightweight Claude call (first 3000 words of `full_text`, max_tokens 200)
  - Model: `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"`
  - Validates `contract_type` against `CONTRACT_TYPES` values
  - Skips if no `full_text` or type already set
- **Returns**: `{ success, processed, named, classified, skipped }`
- **Error handling**: per-contract try/catch for Claude calls; top-level try/catch returns 500

## Files Modified

### `src/app/(app)/settings/org/page.tsx`
Added "Contract Data" card section visible to org owners/admins (`canEdit`):

- **Imports added**: `Database`, `Loader2` from lucide-react
- **State**: `backfilling` (boolean), `backfillResult` (summary object)
- **Handler**: `handleBackfill()` — POST to `/api/admin/backfill-contract-types`, shows toast + inline result
- **UI**: Card with "Backfill contract names & types" button, loading spinner during processing, result summary text after completion

## Verification

- TypeScript compiles without errors in both files (pre-existing `.next/types/validator.ts` errors are unrelated)
- Auth pattern matches existing admin endpoints
- DB access functions confirmed available in `@/lib/db-imports`
- `updateContractMetadata` allowlist confirmed to include both `name` and `contract_type`
