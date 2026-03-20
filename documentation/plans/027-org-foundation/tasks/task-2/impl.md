# Task 2 Implementation Notes -- Full Data Isolation: Query Layer and API Route Org Scoping

## Changes Made

### lib/db.js -- Query and Insert Functions Updated (~30 functions)

**Document functions:**
- `getAllDocuments(orgId)` -- added `WHERE org_id = ?`
- `getDocumentById(id, orgId)` -- added optional `AND org_id = ?` (backward-compatible)
- `getDocumentByPath(filePath, orgId)` -- added optional `AND org_id = ?`
- `addDocument(name, filePath, folder, category, orgId)` -- added `org_id` to INSERT
- `getDocumentByGDriveId(gdriveFileId, orgId)` -- added optional `AND org_id = ?`
- `getUnprocessedDocuments(orgId)` -- added optional `AND org_id = ?`
- `getProcessedDocumentCount(orgId)` -- added optional `AND org_id = ?`
- `getTotalDocumentCount(orgId)` -- added optional `WHERE org_id = ?`
- `getAllChunksWithEmbeddings(orgId)` -- added optional `AND d.org_id = ?` via documents join

**Task functions:**
- `getAllTasks(statusFilter, orgId)` -- added optional `AND org_id = ?`
- `getOpenTaskCount(orgId)` -- added optional `AND org_id = ?`
- `createTaskForObligation(obligationId, { ..., orgId })` -- added `org_id` to INSERT

**Legal hold functions:**
- `getAllLegalHolds(activeOnly, orgId)` -- added optional `AND org_id = ?`
- `createLegalHold(matterName, scopeJson, orgId)` -- added `org_id` to INSERT

**QA Card functions:**
- `getAllQaCards(statusFilter, orgId)` -- added optional `AND org_id = ?`
- `insertQaCard({ ..., orgId })` -- added `org_id` to INSERT
- `getAllQaCardsWithEmbeddings(orgId)` -- added optional `AND org_id = ?`

**Obligation/Contract functions:**
- `insertObligation({ ..., orgId })` -- added `org_id` to INSERT
- `getAllObligations(orgId)` -- added optional `WHERE d.org_id = ?`
- `getUpcomingObligations(days, orgId)` -- added optional `AND d.org_id = ?`
- `getOverdueObligations(orgId)` -- added optional `AND d.org_id = ?`
- `getContractsWithSummaries(orgId)` -- added optional `AND d.org_id = ?`
- `getUpcomingObligationsAllContracts(days, orgId)` -- added optional `AND d.org_id = ?`
- `searchContractsByFilters({ ..., orgId })` -- added `AND d.org_id = ?` when orgId present
- `searchContractsByText(searchTerm, limit, orgId)` -- added optional `AND d.org_id = ?`
- `getObligationsForChat({ ..., orgId })` -- added `AND d.org_id = ?` when orgId present

**Legal Cases functions:**
- `getLegalCases({ ..., orgId })` -- added `AND lc.org_id = ?` when orgId present
- `createLegalCase({ ..., orgId })` -- added `org_id` to INSERT
- `getCaseTemplates({ ..., orgId })` -- added `AND (org_id = ? OR is_system_template = 1)` when orgId present (system templates visible to all orgs)
- `createCaseTemplate({ ..., orgId })` -- added `org_id` to INSERT

**Audit log:**
- `logAction(entityType, entityId, action, details, options)` -- added 5th parameter as options object `{ userId, orgId }`, INSERT now includes `user_id` and `org_id`

**Version control:**
- `getPendingReplacements(orgId)` -- added optional `AND nd.org_id = ?` via documents join

**Product features:**
- `getProductFeatures(orgId)` -- added optional `WHERE org_id = ?`

### lib/audit.js -- Updated 3 Functions

- `logAction(entityType, entityId, action, details, options)` -- 5th param `{ userId, orgId }`, INSERT includes `user_id` and `org_id`
- `getAuditLog(filters)` -- added `orgId` to filters, adds `AND org_id = ?` when present; SELECT now includes `user_id, org_id`
- `getAuditLogCount(filters)` -- same orgId filter support

### lib/policies.js -- Updated 7 Functions

- `getAllPolicies(enabledOnly, orgId)` -- added `AND org_id = ?` when orgId present
- `createPolicy(name, condition, actionType, actionParams, orgId, auditOptions)` -- added `org_id` to INSERT, passes auditOptions to logAction
- `updatePolicy(id, updates, auditOptions)` -- passes auditOptions to logAction
- `deletePolicy(id, auditOptions)` -- passes auditOptions to logAction
- `evaluateDocument(document, orgId)` -- passes orgId to getAllPolicies
- `applyActions(documentId, triggeredActions, auditOptions)` -- passes auditOptions to logAction, adds `org_id` to tasks INSERT
- `testPolicy(policyId, orgId)` -- adds `WHERE org_id = ?` to document query

### lib/search.js -- Updated 3 Functions

- `searchDocuments(queryText, options)` -- added `orgId` to options; passes to `getChunksFiltered` and triggers filtered path when orgId is set
- `getChunksFiltered(filters)` (internal) -- adds `AND d.org_id = ?` when `filters.orgId` present
- `scoreDocumentsByTags(queryTags, topN, activeOnly, orgId)` -- adds `AND org_id = ?` when orgId present

### API Routes -- 78 Route Files Updated

Every API route file (except exempt routes: auth, health, embeddings, settings) now:

1. **Auth guard**: `const session = await auth(); if (!session?.user) return 401`
2. **Org extraction**: `const orgId = Number(session.user.orgId);`
3. **Passes orgId** to all DB query/insert function calls
4. **Audit options**: all `logAction()` calls include `{ userId: Number(session.user.id), orgId }` as 5th argument

**Exempt routes (NOT modified):**
- `api/auth/[...nextauth]` -- NextAuth handlers
- `api/auth/register` -- no session yet
- `api/health` -- infrastructure health check
- `api/embeddings/status` -- infrastructure check
- `api/settings/*` -- already org-scoped in Task 1
- `api/admin/*` -- admin routes have their own auth pattern

**Route files modified (by domain group):**
- `api/documents/` -- 18 route files (route.ts, [id]/route.ts, upload, scan, pending-replacements, retag-all, and all [id]/* sub-routes)
- `api/contracts/` -- 10 route files (route.ts, [id]/route.ts, chat, upcoming, invoices, documents sub-routes)
- `api/legal-hub/` -- 22 route files (cases, templates, and all nested sub-routes)
- `api/obligations/` -- 6 route files
- `api/tasks/` -- 2 route files
- `api/legal-holds/` -- 2 route files
- `api/qa-cards/` -- 2 route files
- `api/audit/` -- 1 route file (orgId added to audit log query filters)
- `api/dashboard/` -- 1 route file
- `api/policies/` -- 3 route files
- `api/ask/` -- 1 route file (orgId passed through to searchDocuments and scoreDocumentsByTags)
- `api/analyze/` -- 1 route file
- `api/desk/` -- 3 route files (analyze, questionnaire, approve)
- `api/nda/` -- 1 route file
- `api/maintenance/` -- 2 route files
- `api/gdrive/` -- 3 route files

## INTEGRATION Notes

- **Task 3:** The org management routes (`api/org/*`) were created by Task 3 and already have their own orgId handling. Task 2 did not modify them.
- **GOTCHA:** `session.user.orgId` is typed as `string | undefined` in the TypeScript types. All routes use `Number(session.user.orgId)` to convert to number before passing to DB functions.
- **GOTCHA:** `getDocumentById(id, orgId)` is backward-compatible -- when called without orgId (from internal db.js functions like `getContractSummary`, `updateDocumentStatus`, `applyVersionLink`), it falls back to querying by ID only. The org scoping happens at the API route level where the entity is first looked up.
- **GOTCHA:** `getCaseTemplates` uses `AND (org_id = ? OR is_system_template = 1)` to ensure system templates (seeded in initDb) are visible to all orgs.
- **GOTCHA:** `getAppSetting`/`setAppSetting` in the gdrive routes still use the legacy org_id=1 default. These should be migrated to `getOrgSettings`/`setOrgSetting` in a future pass, but they work for now since all existing data is in org 1.

## Review/Test Fix Cycle 1

**Reviewer fixes (7 items):**
1. `ask/route.ts` -- Added `orgId` to both branches of `searchOptions` object passed to `searchDocuments`
2. `desk/analyze/route.ts` -- Replaced legacy `searchDocuments(text, docIds, topK)` signature with `searchDocuments(text, { documentIds, topK, orgId })`
3. `contracts/upcoming/route.ts` -- Added `orgId` to `getUpcomingObligationsAllContracts(days, orgId)` + added missing `ensureDb()` and import
4. `lib/db.js getContractById(id, orgId)` -- Added orgId parameter with backward-compatible `AND org_id = ?` clause. Updated 6 call sites across contracts/[id]/route.ts, contracts/[id]/documents/route.ts, contracts/[id]/invoices/route.ts
5. `contracts/route.ts` -- Added missing `await ensureDb()` and `import { ensureDb }`
6. `contracts/upcoming/route.ts` -- Added missing `await ensureDb()` and `import { ensureDb }` (combined with fix 3)
7. Deadlines route TS error was already fixed in original pass

**Tester fixes (2 items):**
A. `lib/db.js getAllDocuments(orgId)` -- Made backward-compatible: only adds `WHERE org_id = ?` when orgId is defined. Fixes admin/migrate-contract-hub calling without orgId.
B. `maintenance/run/route.ts` -- Documented as intentionally global (orphan cleanup, GDrive sync, expired retention processing are cross-org infrastructure operations). Added code comment explaining the design decision.

## Build Verification

- TypeScript: `npx tsc --noEmit` passes with zero errors
- Next.js build: `npx next build` completes successfully, all 58+ pages compile
- Post-update grep: `grep -r "getAllDocuments(\|getDocumentById(\|getLegalCases(\|getContractById(" src/app/api/` -- all call sites pass orgId (except import lines and admin route)
