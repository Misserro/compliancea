# Task 2 Plan: Full Data Isolation -- Query Layer and API Route Org Scoping

## Overview

Add `orgId` parameter to every data-returning query function across three modules (`lib/db.js`, `lib/audit.js`, `lib/policies.js`, `lib/search.js`), and update all API routes to extract `orgId` from the session and pass it through. Additionally, update `logAction` to accept and store `user_id` and `org_id`.

## Approach

### Phase 1: lib/db.js -- Query Functions (orgId parameter)

Strategy: Add `orgId` as the **last parameter** to every exported query/insert function that touches org-scoped tables. For SELECT functions, add `AND org_id = ?` (or `WHERE org_id = ?`). For INSERT functions, include `org_id` in the VALUES.

**Functions to update (grouped by domain):**

#### Document functions
- `getAllDocuments(orgId)` -- add `WHERE org_id = ?`
- `getDocumentById(id, orgId)` -- add `AND org_id = ?`
- `getDocumentByPath(filePath, orgId)` -- add `AND org_id = ?`
- `addDocument(name, filePath, folder, category, orgId)` -- add `org_id` to INSERT
- `updateDocumentCategory(id, category)` -- no orgId needed (UPDATE by id)
- `updateDocumentProcessed(id, wordCount)` -- no orgId needed (UPDATE by id)
- `deleteDocument(id)` -- no orgId needed (DELETE by id)
- `getDocumentByGDriveId(gdriveFileId, orgId)` -- add `AND org_id = ?`
- `getUnprocessedDocuments(orgId)` -- add `WHERE org_id = ?`
- `getProcessedDocumentCount(orgId)` -- add `WHERE org_id = ?`
- `getTotalDocumentCount(orgId)` -- add `WHERE org_id = ?`

#### Chunk functions
- `getAllChunksWithEmbeddings(orgId)` -- add `AND d.org_id = ?` (joins documents)
- `getChunksByDocumentIds(documentIds)` -- no change needed (already scoped by doc IDs which are org-scoped at the caller)
- `getChunkCountsByDocumentIds(documentIds)` -- no change (same reason)
- `addChunk(documentId, content, chunkIndex, embedding)` -- no orgId needed (inherits from document)
- `addChunksBatch(chunks)` -- no orgId needed (inherits from document)
- `deleteChunksByDocumentId(documentId)` -- no orgId needed

#### Task functions
- `getAllTasks(statusFilter, orgId)` -- add `WHERE/AND org_id = ?`
- `getTaskById(id)` -- no orgId change (queried by id, used after scope validation)
- `updateTaskStatus(id, status)` -- no orgId needed (UPDATE by id)
- `getOpenTaskCount(orgId)` -- add `WHERE org_id = ?`
- `createTaskForObligation(obligationId, data)` -- no orgId in params (tasks inherit from obligation context)

#### Legal hold functions
- `getAllLegalHolds(activeOnly, orgId)` -- add `WHERE/AND org_id = ?`
- `getLegalHoldById(id)` -- no orgId needed (by id)
- `createLegalHold(matterName, scopeJson, orgId)` -- add `org_id` to INSERT
- `releaseLegalHold(id)` -- no orgId needed (UPDATE by id)

#### QA Card functions
- `getAllQaCards(statusFilter, orgId)` -- add `WHERE/AND org_id = ?`
- `getQaCardById(id)` -- no orgId needed (by id)
- `insertQaCard(data)` -- add `orgId` to data object, add `org_id` to INSERT
- `updateQaCard(id, updates)` -- no orgId needed (UPDATE by id)
- `deleteQaCard(id)` -- no orgId needed
- `getAllQaCardsWithEmbeddings(orgId)` -- add `WHERE/AND org_id = ?`

#### Obligation / Contract functions
- `getAllObligations(orgId)` -- add `AND d.org_id = ?`
- `getUpcomingObligations(days, orgId)` -- add `AND d.org_id = ?`
- `getOverdueObligations(orgId)` -- add `AND d.org_id = ?`
- `getContractsWithSummaries(orgId)` -- add `AND d.org_id = ?`
- `getUpcomingObligationsAllContracts(days, orgId)` -- add `AND d.org_id = ?`
- `getContractById(id)` -- no orgId needed (by id)
- `searchContractsByFilters(filters)` -- add orgId to filters, add `AND d.org_id = ?`
- `searchContractsByText(searchTerm, limit, orgId)` -- add `AND d.org_id = ?`
- `getObligationsForChat(filters)` -- add orgId to filters, add `AND d.org_id = ?`
- `insertObligation(data)` -- add `orgId` to data, add `org_id` to INSERT
- `getObligationsByDocumentId(documentId)` -- no orgId (scoped by documentId)
- `getObligationById(id)` -- no orgId (by id)
- `getContractInvoiceSummary(contractId)` -- no orgId (scoped by contractId)

#### Legal Cases functions
- `getLegalCases(options)` -- add orgId to options, add `AND lc.org_id = ?`
- `getLegalCaseById(id)` -- no orgId (by id)
- `createLegalCase(data)` -- add `orgId` to data, add `org_id` to INSERT
- `getCaseTemplates(options)` -- add orgId to options, add `AND org_id = ?`
- `getCaseTemplateById(id)` -- no orgId (by id)
- `createCaseTemplate(data)` -- add `orgId` to data, add `org_id` to INSERT
- `getCaseGeneratedDocs(caseId)` -- no orgId (scoped by caseId)

#### Audit log function (in db.js)
- `logAction(entityType, entityId, action, details)` -- This is the db.js version; the audit.js version wraps it. Both need updating.
- `getAuditLog(entityType, entityId)` -- This is the db.js version; the audit.js version is used by routes.

#### Version control functions
- `getPendingReplacements(orgId)` -- add org scoping via JOIN to documents

### Phase 2: lib/audit.js -- Org + User Scoping

- `logAction(entityType, entityId, action, details, { userId, orgId })` -- add 5th parameter as options object with userId and orgId; INSERT includes `user_id` and `org_id`
- `getAuditLog(filters)` -- add `orgId` to filters object, add `AND org_id = ?`
- `getAuditLogCount(filters)` -- same as getAuditLog
- `getDocumentAuditHistory(documentId, limit)` -- no change (scoped by documentId)

### Phase 3: lib/policies.js -- Org Scoping

- `getAllPolicies(enabledOnly, orgId)` -- add `AND org_id = ?`
- `getPolicyById(id)` -- no change (by id)
- `createPolicy(name, condition, actionType, actionParams, orgId)` -- add `org_id` to INSERT
- `testPolicy(policyId, orgId)` -- add `WHERE org_id = ?` to document query
- `evaluateDocument(document)` -- receives document object (already scoped); `getAllPolicies` call needs orgId passed through

### Phase 4: lib/search.js -- Org Scoping

- `searchDocuments(queryText, options)` -- add `orgId` to options; pass to `getChunksFiltered`, `getChunksByDocumentIds`, `getAllChunksWithEmbeddings`
- `getChunksFiltered(filters)` -- add `AND d.org_id = ?` when orgId present
- `scoreDocumentsByTags(queryTags, topN, activeOnly, orgId)` -- add `AND org_id = ?` to document query

### Phase 5: Type declarations (.d.ts files)

Update all `.d.ts` files to match new signatures (they all use `...args: any[]` so minimal changes needed, but we should keep them consistent).

### Phase 6: Import bridges (src/lib/*-imports.ts)

- `src/lib/db-imports.ts` -- no changes needed (re-exports are pass-through)
- `src/lib/audit-imports.ts` -- no changes needed
- `src/lib/policies-imports.ts` -- no changes needed
- `src/lib/search-imports.ts` -- no changes needed

### Phase 7: API Routes -- Extract orgId from session and pass through

For every API route under `src/app/api/`:

1. **Add auth guard if missing** (many routes lack `auth()` -- see task description noting violations)
2. After auth guard, extract org context: `const { orgId } = session.user;`
3. Pass `orgId` to every DB/audit/policy/search function call
4. For `logAction` calls: add `{ userId: session.user.id, orgId }` as the 5th argument

**Route groups (in implementation order):**

1. **documents/** (14 route files) -- getAllDocuments, getDocumentById, addDocument, etc.
2. **contracts/** (10 route files) -- getContractsWithSummaries, getContractById, etc.
3. **legal-hub/** (22 route files) -- getLegalCases, createLegalCase, etc.
4. **obligations/** (6 route files)
5. **tasks/** (2 route files)
6. **legal-holds/** (2 route files)
7. **qa-cards/** (2 route files)
8. **audit/** (1 route file)
9. **dashboard/** (1 route file)
10. **policies/** (3 route files)
11. **ask/** (1 route file)
12. **analyze/** (1 route file)
13. **desk/** (3 route files)
14. **nda/** (1 route file)
15. **maintenance/** (2 route files)
16. **gdrive/** (3 route files)

## Files to Create/Modify

### Modify
- `lib/db.js` -- ~50 function signature and query updates
- `lib/audit.js` -- 3 function updates (logAction, getAuditLog, getAuditLogCount)
- `lib/policies.js` -- 5 function updates
- `lib/search.js` -- 3 function updates (searchDocuments, getChunksFiltered, scoreDocumentsByTags)
- `lib/db.d.ts` -- match new signatures
- `lib/audit.d.ts` -- match new signatures
- `lib/policies.d.ts` -- match new signatures
- `lib/search.d.ts` -- match new signatures
- `src/lib/db-imports.ts` -- no actual changes needed (pass-through)
- ~73 API route files under `src/app/api/`

### No Changes
- `src/lib/db-imports.ts` -- re-exports are pass-through, no signature info
- `src/lib/audit-imports.ts` -- same
- `src/lib/policies-imports.ts` -- same
- `src/lib/search-imports.ts` -- same

## Risks and Trade-offs

1. **Backward compatibility**: Functions that currently take no orgId will now expect it. All callers must be updated in the same pass. No caller should break because the new parameter is always last and functions still work without it (defaulting to undefined which would return no results -- this is intentional as a safety net).

2. **UPDATE/DELETE by ID**: Functions like `updateObligation(id, updates)`, `deleteDocument(id)` do NOT need orgId because they operate on a specific row by primary key. The org scoping happens at the READ level when the entity is first looked up. This matches the pattern: route reads entity with orgId filter -> if found, operates on it by ID.

3. **Large scope**: ~73 route files + ~50 db function updates + 4 module files. Will batch by domain group and send progress updates to reviewer.

4. **Search module**: `searchDocuments` and `scoreDocumentsByTags` use raw SQL queries internally (via `dbQuery`). These need org scoping added to their internal queries.

## Success Criteria Verification

- After implementation, run: `grep -r "getAllDocuments\|getDocumentById\|getLegalCases" src/app/api/` to verify all call sites pass orgId
- All app pages should load without errors
- New audit log entries include user_id and org_id
