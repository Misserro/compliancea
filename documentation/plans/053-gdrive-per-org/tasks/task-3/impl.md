# Task 3: Implementation Notes

## Files Changed

1. **`lib/maintenance.js`** — 3 major changes:
   - **New imports**: Added `fs`, `pdfParse`, `mammoth`, `extractContractTerms` from `./contracts.js`, and `getOrgSetting`, `updateDocumentMetadata`, `updateDocumentProcessed`, `insertObligation`, `createTaskForObligation` from `./db.js`
   - **Per-org GDrive loop**: Replaced single `getGDriveStatus()`/`shouldSync()`/`scanGDrive()` calls with a loop over all orgs with `gdrive_enabled = '1'` in `app_settings`. Each org gets its own sync result keyed by `org_id`. After sync, unprocessed GDrive docs are auto-processed via `processGDriveDocument()`.
   - **`processGDriveDocument(docId, localPath, orgId)` function**: Extracts text from local file (PDF/DOCX), calls `extractContractTerms()`, sets contract metadata (`doc_type: 'contract'`, `status: 'unsigned'`, `full_text`, contract fields), determines `is_historical` flag by comparing `expiry_date` with org's `gdrive_historical_cutoff`, and inserts obligations + tasks for non-historical contracts using the same pattern as the process route.
   - **`extractTextFromLocalPath(filePath)` helper**: Uses `pdf-parse` and `mammoth` directly (ESM imports) since there's no CJS text extraction utility in `lib/`.

2. **`src/components/contracts/contract-card.tsx`** — 1 change:
   - Added amber "Historical" badge after the `contract_type` badge, conditional on `contract.is_historical`

3. **`src/components/contracts/contract-metadata-display.tsx`** — 1 change:
   - Added amber historical note below the metadata grid in view mode, conditional on `contract.is_historical`

4. **`messages/en.json`** — 2 keys added in `Contracts` section:
   - `"historical": "Historical"`
   - `"historicalNote": "Historical — no obligations tracked"`

5. **`messages/pl.json`** — 2 keys added in `Contracts` section:
   - `"historical": "Historyczna"`
   - `"historicalNote": "Historyczna — brak śledzonych zobowiązań"`

## Key Design Decisions

- **Historical logic**: `is_historical = 1` only when BOTH `expiry_date` AND `historicalCutoff` are non-null AND `expiry_date < historicalCutoff`. Null expiry or null cutoff = not historical (safe default).
- **Text extraction**: Direct `pdf-parse`/`mammoth` usage in ESM maintenance.js (no CJS helper needed since lib/ files use ESM `import` syntax).
- **Obligation insertion**: Mirrors the process route pattern exactly — payment obligations with multiple due_dates are split into separate records, tasks created for active-stage obligations.
- **Status**: All GDrive docs start as `unsigned`, so only `not_signed` stage obligations are initially active.
- **`results.gdrive`**: Changed from `null` to `{}` (object keyed by org_id) to support multi-org results.

## Build Status

`npm run build` passes with no TypeScript errors.
