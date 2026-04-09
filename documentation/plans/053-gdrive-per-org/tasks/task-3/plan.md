# Task 3 Plan: Maintenance cycle, auto-processing, and historical badge

## Part A — Maintenance cycle (`lib/maintenance.js`)

### 1. Replace single GDrive scan with per-org loop

The current code calls `getGDriveStatus()`, `shouldSync()`, `scanGDrive()` without orgId. Replace with:
- Query all orgs with `gdrive_enabled = '1'` from `org_settings`
- Loop each org, call `getGDriveStatus(org_id)`, `shouldSync(org_id)`, `scanGDrive(org_id)`
- Change `results.gdrive` from `null` to `{}` (object keyed by org_id)
- After sync, query unprocessed GDrive docs for the org and auto-process each

### 2. Add `processGDriveDocument(docId, orgId)` function

Internal function in `lib/maintenance.js`:
- Read document path from DB via `get()`
- Extract text using `pdf-parse` and `mammoth` directly (no CJS text extraction utility exists in `lib/`; will implement inline using dynamic imports since maintenance.js is ESM)
- Call `extractContractTerms(text)` from `./contracts.js`
- Call `updateDocumentMetadata(docId, ...)` with contract fields + `processed: 1` + `doc_type: 'contract'` + `status: 'unsigned'`
- Compare `contractResult.expiry_date` with org's `gdrive_historical_cutoff` setting
- If historical: set `is_historical = 1`, skip obligation insertion
- If not historical: insert obligations using same `insertObligation()` pattern as process route, create tasks for active-stage obligations

### 3. Imports needed

Add to maintenance.js imports:
- `getOrgSetting` from `./db.js` (already exported by Task 1)
- `updateDocumentMetadata`, `insertObligation`, `getObligationById`, `createTaskForObligation` from `./db.js`
- `extractContractTerms` from `./contracts.js`
- Dynamic imports for `pdf-parse` and `mammoth` (or `fs` for reading file + inline extraction)

## Part B — Historical badge UI

### 4. `contract-card.tsx` — Historical badge

After the `contract_type` badge span, add conditional amber badge when `contract.is_historical`:
```tsx
{!!contract.is_historical && (
  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
    {t('historical')}
  </span>
)}
```

### 5. `contract-metadata-display.tsx` — Historical note

In view mode, after the grid, add a note when `contract.is_historical`:
```tsx
{!!contract.is_historical && (
  <div className="mt-3 px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
    {t('historicalNote')}
  </div>
)}
```

### 6. i18n keys

**EN** (`messages/en.json` — Contracts section):
- `"historical": "Historical"`
- `"historicalNote": "Historical — no obligations tracked"`

**PL** (`messages/pl.json` — Contracts section):
- `"historical": "Historyczna"`
- `"historicalNote": "Historyczna — brak śledzonych zobowiązań"`

## Files to modify

1. `lib/maintenance.js` — per-org GDrive loop + `processGDriveDocument` function
2. `src/components/contracts/contract-card.tsx` — Historical badge
3. `src/components/contracts/contract-metadata-display.tsx` — Historical note
4. `messages/en.json` — add 2 keys
5. `messages/pl.json` — add 2 keys

## Risk mitigation

- Text extraction: use dynamic `await import()` for pdf-parse/mammoth since maintenance.js is ESM
- Historical comparison: null expiry_date = not historical (safe default)
- Per-doc error handling: catch per-document, log error, continue to next
