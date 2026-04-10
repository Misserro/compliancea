## Task 1 Complete — Fix obligation cleanup for archived and GDrive-deleted contracts

### Files Modified

- **`lib/db.js`** (line 1251) — Added `deleteObligationsByDocumentId(documentId)` exported function: deletes tasks linked to obligations first, then deletes obligations for the given document_id
- **`lib/db.js`** (line 1261) — Modified `deleteDocument(id)` to call `deleteObligationsByDocumentId(id)` before deleting chunks/document row
- **`lib/db.js`** (lines 1908-1911, 1921-1922) — Added safety-net filters `d.status != 'archived' AND (d.sync_status IS NULL OR d.sync_status != 'deleted')` to both branches of `getUpcomingObligations`
- **`lib/db.js`** (lines 1940-1941, 1952-1953) — Same safety-net filters added to both branches of `getOverdueObligations`
- **`lib/db.js`** (lines 1965-1966, 1977-1978) — Same safety-net filters added to both branches of `getAllObligations` (non-orgId branch needed a new WHERE clause)
- **`lib/db.js`** (lines 2084-2085, 2102-2103) — Same safety-net filters added to both branches of `getContractsWithSummaries`
- **`lib/db.d.ts`** (line 14) — Added `export function deleteObligationsByDocumentId(...args: any[]): any;` declaration (TypeScript uses this .d.ts instead of parsing the JS file directly due to moduleResolution: "bundler")
- **`src/lib/db-imports.ts`** (line 54) — Added `deleteObligationsByDocumentId` to the named re-export list
- **`src/app/api/contracts/[id]/route.ts`** (line 7) — Added `deleteObligationsByDocumentId` to import; (line 122-125) — Added archive cleanup: `if (metadata.status === 'archived') { deleteObligationsByDocumentId(id); }` after `updateContractMetadata`
- **`lib/gdrive.js`** (line 4) — Added `deleteObligationsByDocumentId` to import from `./db.js`; (line 375) — Added `deleteObligationsByDocumentId(doc.id);` call after sync_status='deleted' UPDATE

### Verification

- `npx tsc --noEmit` — clean, no errors
- `npx next build` — passes successfully

### GOTCHA

TypeScript resolves `../../lib/db.js` to `lib/db.d.ts` (not the actual JS file) because of `moduleResolution: "bundler"` stripping the `.js` extension and preferring `.d.ts`. Any new export added to `lib/db.js` MUST also be declared in `lib/db.d.ts`.

### Integration Notes

- `deleteObligationsByDocumentId` is idempotent — safe to call multiple times (DELETE on 0 rows is a no-op)
- The hard-delete path (DELETE /api/documents/[id]) now runs obligation cleanup twice: once in the route handler's explicit cleanup, and once inside `deleteDocument`. This is safe.
- Safety-net filters guard against any future code path that archives or marks a contract deleted without calling the cleanup function
