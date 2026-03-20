## Task 2 Complete — JWT Integration and API Enforcement

### Files Created
- `src/lib/permissions.ts` — shared permission constants and `hasPermission()` helper. Exports: `RESOURCES`, `Resource`, `PermissionLevel`, `PERMISSION_LEVELS`, `hasPermission`, `RESOURCE_LABELS`.

### Files Modified
- `src/auth.ts` — type augmentation: added `permissions?: Record<string, 'none' | 'view' | 'edit' | 'full'> | null` to both Session.user and JWT interfaces. JWT callback: loads permissions via `getMemberPermissions(orgId, userId)` for member role, sets null for owner/admin. Session callback: propagates `token.permissions` to `session.user.permissions`. Added `getMemberPermissions` to imports from `@/lib/db-imports`.

### Route Files Updated (70 files)
All data API routes received permission enforcement. Pattern added after `const orgId = Number(session.user.orgId);`, before `ensureDb()` or try block:
```typescript
if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
  const perm = (session.user.permissions as Record<string, string> | null)?.['RESOURCE'] ?? 'full';
  if (!hasPermission(perm as any, 'REQUIRED_LEVEL')) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
```

**documents resource (31 route files):**
- `api/documents/route.ts` GET:view
- `api/documents/upload/route.ts` POST:edit
- `api/documents/[id]/route.ts` GET:view, DELETE:full
- `api/documents/[id]/download/route.ts` GET:view
- `api/documents/[id]/process/route.ts` POST:edit
- `api/documents/[id]/analyze-contract/route.ts` POST:view
- `api/documents/[id]/category/route.ts` PATCH:edit
- `api/documents/[id]/metadata/route.ts` PATCH:edit
- `api/documents/[id]/confirm-tags/route.ts` PATCH:edit
- `api/documents/[id]/confirm-replacement/route.ts` PATCH:edit
- `api/documents/[id]/set-replacement/route.ts` PATCH:edit
- `api/documents/[id]/dismiss-replacement/route.ts` PATCH:edit
- `api/documents/[id]/retag/route.ts` PATCH:edit
- `api/documents/[id]/contract-action/route.ts` POST:edit
- `api/documents/[id]/contract-summary/route.ts` POST:view
- `api/documents/[id]/obligations/route.ts` GET:view, POST:edit
- `api/documents/[id]/versions/route.ts` GET:view
- `api/documents/[id]/diff/[oldId]/route.ts` GET:view
- `api/documents/[id]/lineage/route.ts` GET:view
- `api/documents/[id]/status/route.ts` PATCH:edit
- `api/documents/pending-replacements/route.ts` GET:view
- `api/documents/retag-all/route.ts` POST:edit
- `api/documents/scan/route.ts` POST:edit
- `api/ask/route.ts` POST:documents:view
- `api/analyze/route.ts` POST:documents:view
- `api/desk/analyze/route.ts` POST:documents:view
- `api/desk/questionnaire/route.ts` POST:documents:edit
- `api/desk/questionnaire/approve/route.ts` POST:documents:edit
- `api/nda/analyze/route.ts` POST:documents:view
- `api/gdrive/settings/route.ts` GET:documents:view, PATCH:documents:edit
- `api/gdrive/scan/route.ts` POST:documents:edit
- `api/gdrive/status/route.ts` GET:documents:view

**contracts resource (19 route files):**
- `api/contracts/route.ts` GET:view
- `api/contracts/[id]/route.ts` GET:view, PATCH:edit
- `api/contracts/[id]/documents/route.ts` GET:view, POST:edit
- `api/contracts/[id]/documents/[contractDocId]/route.ts` DELETE:full
- `api/contracts/[id]/documents/[contractDocId]/download/route.ts` GET:view
- `api/contracts/[id]/invoices/route.ts` GET:view, POST:edit
- `api/contracts/[id]/invoices/[invoiceId]/route.ts` PATCH:edit, DELETE:full
- `api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` GET:view
- `api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` GET:view
- `api/contracts/upcoming/route.ts` GET:view
- `api/contracts/chat/route.ts` POST:view
- `api/obligations/route.ts` GET:contracts:view
- `api/obligations/[id]/route.ts` PATCH:contracts:edit
- `api/obligations/[id]/evidence/route.ts` POST:contracts:edit
- `api/obligations/[id]/evidence/[index]/route.ts` DELETE:contracts:full
- `api/obligations/[id]/check-compliance/route.ts` POST:contracts:view
- `api/obligations/[id]/finalize/route.ts` POST:contracts:edit
- `api/tasks/route.ts` GET:contracts:view
- `api/tasks/[id]/route.ts` PATCH:contracts:edit

**legal_hub resource (23 route files):**
- `api/legal-hub/cases/route.ts` GET:view, POST:edit
- `api/legal-hub/cases/[id]/route.ts` GET:view, PATCH:edit, DELETE:full
- `api/legal-hub/cases/[id]/chat/route.ts` POST:view
- `api/legal-hub/cases/[id]/documents/route.ts` GET:view, POST:edit
- `api/legal-hub/cases/[id]/documents/[did]/route.ts` DELETE:full
- `api/legal-hub/cases/[id]/documents/[did]/download/route.ts` GET:view
- `api/legal-hub/cases/[id]/documents/[did]/reindex/route.ts` POST:edit
- `api/legal-hub/cases/[id]/documents/status/route.ts` GET:view
- `api/legal-hub/cases/[id]/deadlines/route.ts` GET:view, POST:edit
- `api/legal-hub/cases/[id]/deadlines/[did]/route.ts` PATCH:edit, DELETE:full
- `api/legal-hub/cases/[id]/parties/route.ts` GET:view, POST:edit
- `api/legal-hub/cases/[id]/parties/[pid]/route.ts` PATCH:edit, DELETE:full
- `api/legal-hub/cases/[id]/generate/route.ts` POST:edit
- `api/legal-hub/cases/[id]/generated-documents/route.ts` GET:view
- `api/legal-hub/cases/[id]/generated-documents/[gid]/route.ts` GET:view, DELETE:full
- `api/legal-hub/cases/[id]/generated-documents/[gid]/export/route.ts` GET:view
- `api/legal-hub/cases/[id]/actions/apply/route.ts` POST:edit
- `api/legal-hub/cases/[id]/activity/route.ts` GET:view
- `api/legal-hub/cases/[id]/status/route.ts` PATCH:edit
- `api/legal-hub/templates/route.ts` GET:view, POST:edit
- `api/legal-hub/templates/[id]/route.ts` GET:view, PATCH:edit, DELETE:full
- `api/legal-holds/route.ts` GET:legal_hub:view, POST:legal_hub:edit
- `api/legal-holds/[id]/release/route.ts` POST:legal_hub:edit

**policies resource (3 route files):**
- `api/policies/route.ts` GET:view, POST:edit
- `api/policies/[id]/route.ts` PATCH:edit, DELETE:full
- `api/policies/[id]/test/route.ts` POST:view

**qa_cards resource (2 route files):**
- `api/qa-cards/route.ts` GET:view
- `api/qa-cards/[id]/route.ts` PATCH:edit, DELETE:full

### Verification
- `npx tsc --noEmit`: 0 errors
- `npm test`: 615 passed, 61 failed (ALL failures in `permission-management-api.test.ts` which tests Task 3 routes not yet implemented -- 0 regressions from Task 2)

### INTEGRATION notes for other tasks
- **Task 3** (Permission Management API): imports `hasPermission` from `@/lib/permissions` if needed; the `session.user.permissions` field is already available
- **Task 5** (UI Feature Hiding): `session.user.permissions` is available via `useSession()` — null means full access (owner/admin), Record means member permissions

### GOTCHA
- `api/gdrive/route.ts` listed in task description does NOT exist. Only `gdrive/settings`, `gdrive/scan`, `gdrive/status` exist. All three are covered.
- Some task-listed handlers (e.g., GET on `qa-cards/[id]`, DELETE on `contracts/[id]`, POST on `obligations/`) do not exist in the codebase. Permission checks were applied to all handlers that DO exist.
- The fallback `?? 'full'` in the permission check ensures backward compatibility for members with no permission rows (pre-031 data).
