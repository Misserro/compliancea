# Plan: Per-Org Google Drive Integration

> **Execute:** `/uc:plan-execution 053`
> Created: 2026-04-09
> Status: Draft
> Source: Feature Mode

## Objective

Make the existing Google Drive integration multi-tenant: each organisation independently connects its own Google Workspace Shared Drive, documents sync per-org, and contracts imported from Drive with past expiry dates are marked "historical" — skipping obligation extraction so they don't pollute the overdue dashboard.

## Context

- **Architecture:** `documentation/technology/architecture/database-schema.md` (documents table, org_settings keys), `documentation/technology/architecture/data-flow.md` (GDrive sync flow), `documentation/technology/architecture/api-endpoints.md` (GDrive API endpoints)
- **Requirements:** `documentation/product/requirements/features.md` (Google Drive Sync section)
- **Context:** `.claude/app-context-for-research.md`

### Background

The existing GDrive integration (`lib/gdrive.js`) is fully functional but **not org-scoped**: credentials are stored in `app_settings` (global), `scanGDrive()` has no `orgId` parameter, and inserted documents carry no `org_id`. This plan refactors it to be per-org. All the infrastructure is already in place: `getOrgSetting(orgId, key)` / `setOrgSetting(orgId, key, value)` are used for per-org S3, and the maintenance cycle already calls `scanGDrive()` on interval.

### User-specified scope

- **Auth:** Service account (per-org service account JSON uploaded in settings; org admin shares the Shared Drive with the SA email)
- **Drive scope:** Whole Google Workspace Shared Drive (not a specific folder — Shared Drive ID as root; recursive listing already supported by existing code via `includeItemsFromAllDrives: true`)
- **Sync:** Ongoing (maintenance cycle, interval-based)
- **Historical cutoff:** Date set by org admin at connection time (default: today); contracts with `expiry_date < cutoff` are historical
- **File types:** PDF, DOCX, Google Docs (all already handled by existing `lib/gdrive.js`)
- **Processing:** Contracts-only — all GDrive documents auto-processed as contracts (`doc_type` forced to `'contract'`)

## Tech Stack

- Google Drive API v3 (`googleapis` npm package — already installed)
- Anthropic Claude SDK (contract term extraction — already in use)
- SQLite via better-sqlite3 (already in use)
- Next.js 14 App Router (already in use)
- next-intl (i18n — bilingual EN/PL required)

## Scope

### In Scope

- Move GDrive credentials from `app_settings` (global) to `org_settings` (per-org)
- Add `is_historical INTEGER DEFAULT 0` column to `documents` table
- Refactor `lib/gdrive.js` — all functions accept `orgId`, insert documents with correct `org_id`, persist `lastSyncTime` per-org to DB instead of process-local variable
- Update `GET/PATCH /api/gdrive/settings` to use org_settings; add `historicalCutoff` date field
- Update GDrive settings UI card — add historical cutoff date input, relabel "Folder ID" → "Shared Drive ID or Folder ID"
- Maintenance cycle: loop all orgs with `gdrive_enabled = '1'`, call `scanGDrive(orgId)` for each
- Auto-process new GDrive documents as contracts in maintenance cycle (skip auto-tagger, force `doc_type = 'contract'`)
- In `process/route.ts`: after extracting `expiry_date`, compare with org's `gdrive_historical_cutoff`; set `is_historical = 1` and skip obligation extraction if historical
- "Historical" badge on contract card and contract metadata display
- i18n (EN/PL) for all new UI labels

### Out of Scope

- Multiple Drive connections per org
- Per-org sync interval configuration (global `GDRIVE_SYNC_INTERVAL_MINUTES` env var used)
- Manual "mark as historical" toggle on individual contracts
- GDrive for document types other than contracts
- Encryption of service account JSON (follows existing pattern for S3 secrets — not encrypted today)
- One-time migration script for existing `app_settings` GDrive credentials (low priority — single-org deployments can reconfigure after upgrade)

## Success Criteria

- [ ] Org admin can configure a service account JSON + Shared Drive ID + historical cutoff date in Settings; settings are stored per-org (not shared between orgs)
- [ ] Maintenance cycle scans all GDrive-enabled orgs; new files in each org's Shared Drive appear in that org's documents list
- [ ] New GDrive documents are automatically processed as contracts without manual intervention
- [ ] Contracts with `expiry_date` before the historical cutoff are marked `is_historical = 1` and have zero obligations
- [ ] Historical contracts display a "Historical" badge in the contracts list and detail view
- [ ] Non-historical contracts (future expiry or no expiry) process normally with obligation extraction
- [ ] `npm run build` passes with no TypeScript errors

## Task List

> Every task gets the full pipeline: planning → impl → review → test.

---

### Task 1: GDrive engine refactor — per-org foundation

**Description:**
Make `lib/gdrive.js` org-aware and add the required DB infrastructure.

1. **`lib/db.js` — DB migration**: Add `is_historical INTEGER NOT NULL DEFAULT 0` to the `contractMetadataColumns` migration array (same pattern used for `contract_type`). Add `is_historical` to the `allowedFields` array in `updateDocumentMetadata`. Add `d.is_historical` to both SELECT variants in `getContractsWithSummaries`. No other DB changes — `org_settings` table already exists.

2. **`lib/gdrive.js` — full org-scoping refactor**:
   - `getDriveClient(orgId)` — reads `getOrgSetting(orgId, 'gdrive_service_account')` instead of `getAppSetting('gdriveServiceAccount')`. Cache key becomes `${orgId}:${credHash}`.
   - `getDriveId(orgId)` (renamed from `getFolderId`) — reads `getOrgSetting(orgId, 'gdrive_drive_id')`. URL-stripping logic unchanged.
   - `getGDriveStatus(orgId)` — reads from `getOrgSetting(orgId, ...)` for all three keys.
   - `scanGDrive(orgId)` — passes `orgId` to `getDriveClient`/`getDriveId`; adds `org_id = ?` to INSERT and to the existing-docs query; updates `setOrgSetting(orgId, 'gdrive_last_sync_time', new Date().toISOString())` instead of setting `lastSyncTime` process-local.
   - `shouldSync(orgId)` — reads `getOrgSetting(orgId, 'gdrive_last_sync_time')` instead of process-local `lastSyncTime`.
   - Remove the module-level `let lastSyncTime = null` and client cache variables; make caches a `Map` keyed by orgId.
   - Update `src/lib/gdrive-imports.ts` to re-export any new signatures.

3. **`src/lib/types.ts`** — Add `is_historical: number` to the `Document` interface (after `contract_type`). Add `is_historical?: number` to `Contract` interface.

4. **`src/lib/constants.ts`** — Add org_settings key constants for GDrive (optional, but useful for consistency):
   ```ts
   export const GDRIVE_SETTINGS_KEYS = {
     serviceAccount: 'gdrive_service_account',
     driveId: 'gdrive_drive_id',
     historicalCutoff: 'gdrive_historical_cutoff',
     lastSyncTime: 'gdrive_last_sync_time',
     enabled: 'gdrive_enabled',
   } as const;
   ```

**Files:**
- `lib/db.js` (modify — migration, allowlist, SELECT)
- `lib/gdrive.js` (modify — full org-scoping)
- `src/lib/gdrive-imports.ts` (modify — re-export signatures)
- `src/lib/types.ts` (modify — is_historical on Document + Contract)
- `src/lib/constants.ts` (modify — GDRIVE_SETTINGS_KEYS)

**Patterns:**
- `documentation/technology/architecture/database-schema.md` (documents table migration pattern, org_settings keys)
- `documentation/technology/architecture/data-flow.md` (GDrive sync flow)

**Success criteria:**
- `GET /api/gdrive/scan` (POST) with a valid session processes only the current org's Drive (manual test: two orgs with different SA credentials produce different documents)
- `documents` table rows inserted by `scanGDrive(orgId)` have the correct `org_id`
- `is_historical` column exists in `documents` table (no migration error on startup)
- `GDRIVE_SETTINGS_KEYS` exported from constants; `is_historical` typed on `Document` and `Contract`
- `npm run build` passes

**Dependencies:** None

---

### Task 2: GDrive settings API + UI — per-org configuration

**Description:**
Migrate the settings endpoints and UI from global (`app_settings`) to per-org (`org_settings`). Add the historical cutoff date field. *(Runs in parallel with Task 3 after Task 1.)*

1. **`src/app/api/gdrive/settings/route.ts`**:
   - Replace all `getAppSetting('gdriveServiceAccount')` / `setAppSetting(...)` calls with `getOrgSetting(orgId, 'gdrive_service_account')` / `setOrgSetting(orgId, ...)`.
   - Replace `getAppSetting('gdriveFolderId')` with `getOrgSetting(orgId, 'gdrive_drive_id')`.
   - Add `historicalCutoff` to GET response: read `getOrgSetting(orgId, 'gdrive_historical_cutoff')`.
   - Add `historicalCutoff` to PATCH handler: validate it's a valid ISO date string or empty; write to `gdrive_historical_cutoff`.
   - Add `enabled` boolean to GET response / PATCH: reads/writes `gdrive_enabled` (`"1"` or `""`).
   - Set `gdrive_enabled = "1"` when valid credentials + driveId are saved.

2. **`src/app/api/gdrive/status/route.ts`**:
   - Pass `orgId` to `getGDriveStatus(orgId)` call.

3. **`src/app/api/gdrive/scan/route.ts`**:
   - Pass `orgId` to `scanGDrive(orgId)` and `getGDriveStatus(orgId)` calls.

4. **`src/components/settings/gdrive-section.tsx`**:
   - Add `historicalCutoff` state (date string, default today formatted as `YYYY-MM-DD`).
   - Add `<Input type="date" />` for historical cutoff, label: `t('historicalCutoff')`.
   - Relabel "Google Drive Folder ID" → `t('driveIdLabel')` (display text: "Shared Drive ID or Folder ID").
   - Include `historicalCutoff` in save PATCH payload.
   - Load `historicalCutoff` in the `useEffect` from GET response.

5. **i18n** (`messages/en.json`, `messages/pl.json`):
   - Add: `"historicalCutoff": "Historical cutoff date"`, `"historicalCutoffHelp": "Contracts expiring before this date are marked historical (no obligations generated)"`, `"driveIdLabel": "Shared Drive ID or Folder ID"`.
   - Polish translations for the same keys.

**Files:**
- `src/app/api/gdrive/settings/route.ts` (modify)
- `src/app/api/gdrive/status/route.ts` (modify)
- `src/app/api/gdrive/scan/route.ts` (modify)
- `src/components/settings/gdrive-section.tsx` (modify)
- `messages/en.json` (modify)
- `messages/pl.json` (modify)

**Patterns:**
- `documentation/technology/architecture/api-endpoints.md` (GDrive endpoints section)
- `documentation/technology/architecture/i18n.md`

**Success criteria:**
- Org A and Org B can each save different service account JSON + Shared Drive ID + historical cutoff; GET returns their respective values independently
- Historical cutoff defaults to today when not yet set
- `enabled` flag is set when credentials + driveId are provided
- All three new i18n keys present in both EN and PL locale files
- `npm run build` passes

**Dependencies:** Task 1

---

### Task 3: Maintenance cycle, auto-processing, and historical badge

**Description:**
Wire up the maintenance cycle to scan all orgs, auto-process new GDrive files as contracts, apply the historical flag during processing, and show a "Historical" badge in the UI. *(Runs in parallel with Task 2 after Task 1.)*

#### Part A — Maintenance cycle: multi-org GDrive scan + auto-process

**`lib/maintenance.js`**:

Replace the single `scanGDrive()` call with a per-org loop:

```js
// Query all orgs with GDrive enabled
const orgsWithGDrive = query(
  `SELECT DISTINCT org_id FROM org_settings WHERE key = 'gdrive_enabled' AND value = '1'`
);

for (const { org_id } of orgsWithGDrive) {
  try {
    const status = getGDriveStatus(org_id);
    if (status.available && shouldSync(org_id)) {
      const syncResult = await scanGDrive(org_id);
      results.gdrive[org_id] = syncResult;

      // Auto-process newly added GDrive documents for this org
      if (syncResult.added > 0) {
        const newDocs = query(
          `SELECT id FROM documents WHERE source = 'gdrive' AND processed = 0 AND org_id = ?`,
          [org_id]
        );
        for (const doc of newDocs) {
          try {
            await processGDriveDocument(doc.id, org_id);
          } catch (err) {
            results.gdrive[org_id].errors = results.gdrive[org_id].errors || [];
            results.gdrive[org_id].errors.push(`Auto-process ${doc.id}: ${err.message}`);
          }
        }
      }
    }
  } catch (err) {
    results.gdrive[org_id] = { error: err.message };
  }
}
```

Add a `processGDriveDocument(docId, orgId)` internal function in `lib/maintenance.js`:
- Reads the document path from DB
- Calls `extractTextFromPath(localPath)` for text extraction
- Calls `extractContractTerms(text)` directly (skip auto-tagger — all GDrive docs are contracts)
- Calls `updateDocumentMetadata(docId, { doc_type: 'contract', ...contractFields, processed: 1 })` — same fields as the process route (contract_type, suggested_name, contracting_company, contracting_vendor)
- Sets `is_historical` via comparison: if `contractResult.expiry_date` and org's `gdrive_historical_cutoff` setting, compare; set `is_historical = 1` if historical; if historical, skip obligation insertion
- If not historical: inserts obligations via the same DB calls as the process route
- Imports needed: `extractContractTerms` from `./contracts.js`, `extractTextFromPath` from `src/lib/server-utils` or existing text extraction in maintenance scope

**Note on import pattern**: `lib/maintenance.js` is a pure CJS module in `lib/`. It already imports from `./db.js`, `./audit.js`, `./gdrive.js`. It should also import `extractContractTerms` from `./contracts.js` and use `extractTextFromPath` via `lib/paths.js` or similar. The executor should verify the available text extraction utility in the `lib/` CJS scope.

#### Part B — Historical badge UI

**`src/components/contracts/contract-card.tsx`**:
- After the existing `contract_type` badge, add a conditional "Historical" badge when `contract.is_historical`:
  ```tsx
  {!!contract.is_historical && (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
      {t('historical')}
    </span>
  )}
  ```

**`src/components/contracts/contract-metadata-display.tsx`**:
- In view mode, show a "Historical — no obligations tracked" note when `contract.is_historical` is truthy.
- No edit control needed (is_historical is AI-managed, not manually editable in this plan).

**i18n** (`messages/en.json`, `messages/pl.json`):
- Add: `"historical": "Historical"`, `"historicalNote": "Historical — no obligations tracked"`.
- Polish translations for the same keys.

**Files:**
- `lib/maintenance.js` (modify — multi-org scan + auto-process)
- `src/components/contracts/contract-card.tsx` (modify — Historical badge)
- `src/components/contracts/contract-metadata-display.tsx` (modify — Historical note)
- `messages/en.json` (modify)
- `messages/pl.json` (modify)

**Patterns:**
- `documentation/technology/architecture/data-flow.md` (GDrive sync flow, contract processing pipeline)
- `documentation/technology/architecture/database-schema.md` (is_historical column, org_settings keys)

**Success criteria:**
- Triggering `POST /api/maintenance/run` with a GDrive-enabled org causes new Drive files to be downloaded, processed as contracts, and visible in the Contracts tab — without any manual "Process" click
- A contract with `expiry_date` before the org's `gdrive_historical_cutoff` shows `is_historical = 1` in the DB and has zero obligations
- A contract with `expiry_date` after the cutoff (or null expiry) has obligations extracted normally
- Historical contracts display an amber "Historical" badge on the contract card
- Historical contracts show "Historical — no obligations tracked" in the metadata detail view
- `npm run build` passes

**Dependencies:** Task 1

---

## Documentation Changes

Documentation updated during Stage 4 (already on disk):

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/database-schema.md` | Updated | Added `is_historical` and `contract_type` columns to documents table; documented `org_settings` table with all known KV keys including new GDrive per-org keys |
| `documentation/technology/architecture/data-flow.md` | Updated | Updated GDrive sync key features to reflect per-org credentials, persisted sync time, auto-processing, and historical flag logic |

Additional documentation gaps identified (not yet addressed):

| File | Needed Change |
|------|---------------|
| `documentation/technology/architecture/api-endpoints.md` | Update GDrive endpoints section to document new `historicalCutoff` + `enabled` fields in GET/PATCH responses |
| `documentation/product/requirements/features.md` | Update Google Drive Sync section: per-org credentials, Shared Drive support, historical cutoff, auto-processing |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large initial Drive import triggers many sequential Claude calls, slowing the maintenance cycle | Medium | Medium | Process one doc at a time with per-doc error handling; errors skip the document without stopping the cycle |
| Service account JSON stored unencrypted in `org_settings` | Low | Medium | Consistent with existing S3 credentials pattern (also unencrypted today); accepted tech debt |
| Maintenance cycle running for multiple orgs increases wall-clock time per cycle | Low | Low | Sequential per-org processing; maintenance cycle is already rate-limited to once/minute |
| Existing single-org deployments lose GDrive config after upgrade (was in `app_settings`) | Medium | Low | Out of scope for this plan (noted); admins need to re-enter credentials once after upgrade |
| `extractContractTerms` called from `lib/maintenance.js` — cross-module dependency from pure CJS scope | Low | Medium | `lib/contracts.js` is already CJS and already imported by similar patterns; executor should verify import availability |
