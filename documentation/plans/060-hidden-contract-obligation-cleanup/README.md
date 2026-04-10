# Plan 060 — Hidden Contract Obligation Cleanup

Execute: /uc:plan-execution 060

## Objective

Fix a data integrity bug where overdue obligation counts include obligations belonging to archived ("hidden") or GDrive-deleted contracts. When a contract is hidden or deleted, its obligations must be removed from the database immediately.

## Context

- Architecture: `documentation/technology/architecture/database-schema.md` (Relationships section — updated in Stage 4)
- Obligations API: `documentation/technology/architecture/api-endpoints.md`
- Data flow: `documentation/technology/architecture/data-flow.md`

## Tech Stack

- SQLite via sql.js (`lib/db.js`) — CJS module, not TypeScript
- Next.js App Router API routes (`src/app/api/`)
- GDrive sync (`lib/gdrive.js`) — CJS module

## Scope

**In scope:**
- Delete obligations when contract status is set to `'archived'` via PATCH endpoint
- Delete obligations when GDrive sync marks a contract as `sync_status = 'deleted'`
- Add safety-net filters to overdue/upcoming obligation queries to exclude archived and GDrive-deleted contracts
- Fix `deleteDocument` in db.js to explicitly clean up obligations (not rely on inert FK cascade)

**Out of scope:**
- Termination via the contract-action route — `transitionObligationsByStage()` already deactivates obligations correctly; terminated obligations are `status = 'inactive'` and don't appear as overdue
- Any UI changes — this is a backend-only fix
- Historical obligation data recovery

## Success Criteria

- [ ] After archiving a contract (PATCH status → 'archived'), its obligations no longer appear in the overdue count on the dashboard, sidebar badge, or obligations page
- [ ] After GDrive sync marks a contract as `sync_status = 'deleted'`, its obligations are removed from the database
- [ ] `getOverdueObligations` and `getUpcomingObligations` filter out archived and GDrive-deleted contracts as a safety net
- [ ] TypeScript clean (`npx tsc --noEmit`)
- [ ] Build passes (`npx next build`)
- [ ] Existing active-contract overdue counts are unchanged (no regression)
- [ ] Existing hard-delete path (DELETE /api/documents/[id]) still cleans up obligations correctly

---

## Tasks

### Task 1 — Fix obligation cleanup for archived and GDrive-deleted contracts

**Description:**

Three gaps need closing in a single pass — they all touch the same files and form a sequential dependency chain (the helper is needed by both consuming sites):

**1. Add `deleteObligationsByDocumentId(documentId)` helper to `lib/db.js`**

New exported function that explicitly cleans up tasks then obligations for a document:
```js
export function deleteObligationsByDocumentId(documentId) {
  // Delete tasks linked to this document's obligations first
  run(
    `DELETE FROM tasks WHERE obligation_id IN (
       SELECT id FROM contract_obligations WHERE document_id = ?
     )`,
    [documentId]
  );
  // Delete the obligations
  run("DELETE FROM contract_obligations WHERE document_id = ?", [documentId]);
}
```

**2. Fix `deleteDocument` in `lib/db.js` to call `deleteObligationsByDocumentId`**

`deleteDocument` currently only deletes chunks and the document row. The FK `ON DELETE CASCADE` for `contract_obligations` is declared in schema but `PRAGMA foreign_keys = ON` is never set, so it's inert. The DELETE API route (`/api/documents/[id]/route.ts`) compensates with explicit cleanup before calling `deleteDocument`, but `deleteDocument` itself is unsafe to call directly. Add the explicit cleanup inside `deleteDocument` so any caller is safe:
```js
export function deleteDocument(id) {
  deleteObligationsByDocumentId(id);  // add this line
  run("DELETE FROM chunks WHERE document_id = ?", [id]);
  run("DELETE FROM documents WHERE id = ?", [id]);
}
```
Note: The DELETE route already does the cleanup before calling `deleteDocument`. After this fix, the cleanup will run twice for that path (idempotent — second DELETE finds 0 rows). This is safe.

**3. Call `deleteObligationsByDocumentId` when archiving a contract via PATCH**

In `src/app/api/contracts/[id]/route.ts`, the PATCH handler calls `updateContractMetadata(id, metadata)` and returns. When the body contains `status: 'archived'`, add a call to `deleteObligationsByDocumentId` after the metadata update:
```ts
import { ..., deleteObligationsByDocumentId } from "@/lib/db-imports";

// in the PATCH handler, after updateContractMetadata(id, metadata):
if (metadata.status === 'archived') {
  deleteObligationsByDocumentId(id);
}
```

Also add `deleteObligationsByDocumentId` to `src/lib/db-imports.ts` (the TypeScript re-export file for the CJS db module).

**4. Call `deleteObligationsByDocumentId` in `scanGDrive()` when marking sync_status = 'deleted'**

In `lib/gdrive.js`, in the loop that detects missing Drive files and updates `sync_status = 'deleted'`, add the cleanup call immediately after the UPDATE:
```js
// existing: UPDATE documents SET sync_status = 'deleted' WHERE id = ?
deleteObligationsByDocumentId(doc.id);
```
Import `deleteObligationsByDocumentId` from `lib/db.js` at the top of `lib/gdrive.js` (it's a CJS module — use the existing named import pattern already in that file).

**5. Add safety-net filters to obligation query functions in `lib/db.js`**

Add `AND d.status != 'archived' AND (d.sync_status IS NULL OR d.sync_status != 'deleted')` to the WHERE clause of:
- `getOverdueObligations(orgId)` — lines ~1926-1948
- `getUpcomingObligations(orgId, daysAhead)` — lines ~1898-1923
- `getAllObligations(orgId)` — lines ~1951-1975
- The overdue subquery in `getContractsWithSummaries` — `SUM(CASE WHEN co.status = 'active' AND co.due_date < date('now') THEN 1 ...)` — add the contract status join condition

**Files:**
- `lib/db.js` — add `deleteObligationsByDocumentId`, fix `deleteDocument`, update 4 query functions
- `src/lib/db-imports.ts` — export `deleteObligationsByDocumentId`
- `src/app/api/contracts/[id]/route.ts` — call cleanup on archive
- `lib/gdrive.js` — call cleanup on GDrive deletion sync

**Patterns:**
- `documentation/technology/architecture/database-schema.md` (Relationships section, documents → contract_obligations)
- `documentation/technology/standards/authentication-authorization.md`

**Success criteria:**
1. After calling PATCH `/api/contracts/{id}` with `{ "status": "archived" }`, the contract's obligations are gone from `contract_obligations` (verify with static analysis or direct DB query)
2. `getOverdueObligations` SQL WHERE clause includes `d.status != 'archived'` AND `d.sync_status != 'deleted'`
3. Same filters present in `getUpcomingObligations`, `getAllObligations`, and `getContractsWithSummaries` overdue subquery
4. `deleteDocument` explicitly deletes tasks and obligations before deleting chunks/document
5. `deleteObligationsByDocumentId` imported and called in `lib/gdrive.js` at the sync_status='deleted' update site
6. TypeScript clean (`npx tsc --noEmit`) — no errors
7. Build passes (`npx next build`)

**Regression criteria:**
- DELETE `/api/documents/{id}` still removes obligations (now done by both `deleteDocument` and the pre-existing explicit deletes in the route handler — idempotent)
- Active contract overdue counts unchanged — active contracts with `status = 'active'` and `sync_status != 'deleted'` still appear correctly
- Contract terminate/sign/activate via contract-action route still works — `transitionObligationsByStage` is unaffected
- GDrive sync still creates the review task for deleted files

**Dependencies:** None

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/database-schema.md` | Updated | Added note to documents → contract_obligations relationship: PRAGMA foreign_keys caveat, and the archive/GDrive-delete obligation cleanup rule |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `deleteObligationsByDocumentId` called twice on hard-delete path | High (certain) | None | Both DELETEs are idempotent; second finds 0 rows |
| Archiving a contract loses obligation history | Low — archive is a terminal state by design | Medium | User's explicit request; archive = cleanup |
| GDrive deletion fires while obligations are actively referenced | Low | Low | Obligations only referenced by tasks (also deleted) and sidebar counts |
| CJS import pattern issues in gdrive.js | Low | Low | Same import pattern already used throughout gdrive.js |
