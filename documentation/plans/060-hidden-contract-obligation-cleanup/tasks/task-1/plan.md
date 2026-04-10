# Task 1 Implementation Plan — Fix obligation cleanup for archived and GDrive-deleted contracts

## Files to Modify

1. **`lib/db.js`** — 3 changes:
   - Add new exported function `deleteObligationsByDocumentId(documentId)` (near line 1255, after `deleteDocument`)
   - Modify `deleteDocument(id)` (line 1251) to call `deleteObligationsByDocumentId(id)` before deleting chunks
   - Add safety-net filters to 4 query functions: `getUpcomingObligations` (line 1898), `getOverdueObligations` (line 1926), `getAllObligations` (line 1951), `getContractsWithSummaries` (line 2062)

2. **`src/lib/db-imports.ts`** — Add `deleteObligationsByDocumentId` to the named re-export list

3. **`src/app/api/contracts/[id]/route.ts`** — Import `deleteObligationsByDocumentId` and call it when `metadata.status === 'archived'` after `updateContractMetadata`

4. **`lib/gdrive.js`** — Import `deleteObligationsByDocumentId` from `./db.js` and call it at line 373 (after the sync_status='deleted' UPDATE)

## Detailed Changes

### 1. `lib/db.js` — New helper function

Add after `deleteDocument` (after line 1255):

```js
export function deleteObligationsByDocumentId(documentId) {
  run(`DELETE FROM tasks WHERE obligation_id IN (SELECT id FROM contract_obligations WHERE document_id = ?)`, [documentId]);
  run("DELETE FROM contract_obligations WHERE document_id = ?", [documentId]);
}
```

### 2. `lib/db.js` — Fix `deleteDocument`

Add `deleteObligationsByDocumentId(id);` as the first line inside `deleteDocument`, before the chunks delete. This makes `deleteDocument` self-contained for any caller.

### 3. `src/app/api/contracts/[id]/route.ts` — Archive cleanup

After line 119 (`await updateContractMetadata(id, metadata);`), add:
```ts
if (metadata.status === 'archived') {
  deleteObligationsByDocumentId(id);
}
```

Import `deleteObligationsByDocumentId` from `@/lib/db-imports`.

### 4. `lib/gdrive.js` — GDrive deletion cleanup

Add `deleteObligationsByDocumentId` to the import from `./db.js` (line 4).
Call `deleteObligationsByDocumentId(doc.id);` after the sync_status='deleted' UPDATE (line 373), before the review task insert.

### 5. `lib/db.js` — Safety-net filters

Add `AND d.status != 'archived' AND (d.sync_status IS NULL OR d.sync_status != 'deleted')` to the WHERE clause of all query branches in:

- `getUpcomingObligations` — both orgId and non-orgId branches (lines 1904 and 1917)
- `getOverdueObligations` — both branches (lines 1932 and 1944)
- `getAllObligations` — both branches (lines 1957 and 1969). Note: this already has `WHERE d.org_id = ?` so we add AND conditions.
- `getContractsWithSummaries` — both branches (lines 2076 and 2094). Add to the existing WHERE clause after `d.source = 'gdrive'`.

### 6. `src/lib/db-imports.ts` — Re-export

Add `deleteObligationsByDocumentId,` to the named export list (after `deleteObligation,` on line 53).

## Success Criteria Mapping

1. PATCH archive -> obligations deleted: covered by change #3
2. getOverdueObligations safety-net: covered by change #5
3. getUpcomingObligations, getAllObligations, getContractsWithSummaries safety-net: covered by change #5
4. deleteDocument explicit cleanup: covered by change #2
5. gdrive.js import and call: covered by change #4
6. TypeScript clean: will verify with `npx tsc --noEmit`
7. Build passes: will verify with `npx next build`

## Risks

- Double-delete on hard-delete path: idempotent, safe (DELETE finds 0 rows second time)
- `getContractsWithSummaries` already filters by `d.doc_type IN ('contract', 'agreement') AND d.source = 'gdrive'` — adding status filters is additive, no conflict
- `getAllObligations` non-orgId branch has no WHERE clause currently — need to add `WHERE d.status != 'archived' AND (d.sync_status IS NULL OR d.sync_status != 'deleted')`
