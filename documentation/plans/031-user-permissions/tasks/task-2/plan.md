# Task 2: JWT Integration and API Enforcement — Implementation Plan

## Overview

Create `src/lib/permissions.ts` shared helper, extend JWT type augmentation in `src/auth.ts` to include `permissions` field, and add permission enforcement checks to all ~80 data API route handlers.

## Files to Create

### 1. `src/lib/permissions.ts` (NEW)
- Export `RESOURCES` const array, `Resource` type, `PermissionLevel` type
- Export `PERMISSION_LEVELS` numeric mapping
- Export `hasPermission(userLevel, required)` helper function
- Export `RESOURCE_LABELS` display names
- Pure TypeScript file, no lib/ bridge needed (per lead.md constraint #8)

## Files to Modify

### 2. `src/auth.ts`
- Add `permissions?: Record<string, 'none' | 'view' | 'edit' | 'full'> | null` to `Session.user` interface
- Add `permissions?: Record<string, 'none' | 'view' | 'edit' | 'full'> | null` to JWT interface
- Add `getMemberPermissions` to imports from `@/lib/db-imports`
- In JWT callback subsequent-requests branch (after membership/orgRole refresh, after isSuperAdmin refresh at ~line 126):
  - If membership exists and role is 'member', load permissions via getMemberPermissions and set token.permissions
  - Else set token.permissions = null (full access bypass)
- In first-sign-in branch: same logic after orgMember lookup
- In session callback: add `session.user.permissions = token.permissions`

### 3. All Data API Routes (~80 route handlers)
Each handler gets a permission check block inserted immediately after `const orgId = Number(session.user.orgId);` and before `await ensureDb();` (or before business logic if ensureDb comes before orgId).

**Permission check pattern:**
```typescript
import { hasPermission } from "@/lib/permissions";

// After orgId extraction, before ensureDb:
if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
  const perm = (session.user.permissions as Record<string, string> | null)?.['{RESOURCE}'] ?? 'full';
  if (!hasPermission(perm as any, '{REQUIRED_LEVEL}')) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
```

**Route-by-route plan (resource: required level per method):**

#### documents resource
| Route file | Methods | Levels |
|---|---|---|
| `api/documents/route.ts` | GET | view |
| `api/documents/upload/route.ts` | POST | edit |
| `api/documents/[id]/route.ts` | GET:view, PATCH:edit (N/A currently), DELETE:full |
| `api/documents/[id]/download/route.ts` | GET | view |
| `api/documents/[id]/process/route.ts` | POST | edit |
| `api/documents/[id]/analyze-contract/route.ts` | POST | view |
| `api/documents/[id]/category/route.ts` | PATCH | edit |
| `api/documents/[id]/metadata/route.ts` | PATCH | edit |
| `api/documents/[id]/confirm-tags/route.ts` | PATCH | edit |
| `api/documents/[id]/confirm-replacement/route.ts` | PATCH | edit |
| `api/documents/[id]/set-replacement/route.ts` | PATCH | edit |
| `api/documents/[id]/dismiss-replacement/route.ts` | PATCH | edit |
| `api/documents/[id]/retag/route.ts` | PATCH | edit |
| `api/documents/[id]/contract-action/route.ts` | POST | edit |
| `api/documents/[id]/contract-summary/route.ts` | POST | view |
| `api/documents/[id]/obligations/route.ts` | GET:view, POST:edit |
| `api/documents/[id]/versions/route.ts` | GET | view |
| `api/documents/[id]/diff/[oldId]/route.ts` | GET | view |
| `api/documents/[id]/lineage/route.ts` | GET | view |
| `api/documents/[id]/status/route.ts` | PATCH | edit |
| `api/documents/pending-replacements/route.ts` | GET | view |
| `api/documents/retag-all/route.ts` | POST | edit |
| `api/documents/scan/route.ts` | POST | edit |
| `api/ask/route.ts` | POST | documents:view |
| `api/analyze/route.ts` | POST | documents:view |
| `api/desk/analyze/route.ts` | POST | documents:view |
| `api/desk/questionnaire/route.ts` | GET:view, POST:edit (documents) |
| `api/desk/questionnaire/approve/route.ts` | POST | documents:edit (creates QA card from doc analysis) |
| `api/nda/analyze/route.ts` | POST | documents:view |
| `api/gdrive/settings/route.ts` | GET:view, PATCH:edit (documents) |
| `api/gdrive/scan/route.ts` | POST | documents:edit |
| `api/gdrive/status/route.ts` | GET | documents:view |

#### contracts resource
| Route file | Methods | Levels |
|---|---|---|
| `api/contracts/route.ts` | GET | view |
| `api/contracts/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/contracts/[id]/documents/route.ts` | GET:view, POST:edit |
| `api/contracts/[id]/documents/[contractDocId]/route.ts` | DELETE | full |
| `api/contracts/[id]/documents/[contractDocId]/download/route.ts` | GET | view |
| `api/contracts/[id]/invoices/route.ts` | GET:view, POST:edit |
| `api/contracts/[id]/invoices/[invoiceId]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.ts` | GET | view |
| `api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.ts` | GET | view |
| `api/contracts/upcoming/route.ts` | GET | view |
| `api/contracts/chat/route.ts` | POST | view |
| `api/obligations/route.ts` | GET:view, POST:edit |
| `api/obligations/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/obligations/[id]/evidence/route.ts` | GET:view, POST:edit |
| `api/obligations/[id]/evidence/[index]/route.ts` | DELETE | full |
| `api/obligations/[id]/check-compliance/route.ts` | POST | view |
| `api/obligations/[id]/finalize/route.ts` | POST | edit |
| `api/tasks/route.ts` | GET:view, POST:edit |
| `api/tasks/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |

#### legal_hub resource
| Route file | Methods | Levels |
|---|---|---|
| `api/legal-hub/cases/route.ts` | GET:view, POST:edit |
| `api/legal-hub/cases/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/legal-hub/cases/[id]/chat/route.ts` | POST | view |
| `api/legal-hub/cases/[id]/documents/route.ts` | GET:view, POST:edit |
| `api/legal-hub/cases/[id]/documents/[did]/route.ts` | GET:view, DELETE:full |
| `api/legal-hub/cases/[id]/documents/[did]/download/route.ts` | GET | view |
| `api/legal-hub/cases/[id]/documents/[did]/reindex/route.ts` | POST | edit |
| `api/legal-hub/cases/[id]/documents/status/route.ts` | GET | view |
| `api/legal-hub/cases/[id]/deadlines/route.ts` | GET:view, POST:edit |
| `api/legal-hub/cases/[id]/deadlines/[did]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/legal-hub/cases/[id]/parties/route.ts` | GET:view, POST:edit |
| `api/legal-hub/cases/[id]/parties/[pid]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/legal-hub/cases/[id]/generate/route.ts` | POST | edit |
| `api/legal-hub/cases/[id]/generated-documents/route.ts` | GET | view |
| `api/legal-hub/cases/[id]/generated-documents/[gid]/route.ts` | GET:view, DELETE:full |
| `api/legal-hub/cases/[id]/generated-documents/[gid]/export/route.ts` | GET | view |
| `api/legal-hub/cases/[id]/actions/apply/route.ts` | POST | edit |
| `api/legal-hub/cases/[id]/activity/route.ts` | GET | view |
| `api/legal-hub/cases/[id]/status/route.ts` | PATCH | edit |
| `api/legal-hub/templates/route.ts` | GET:view, POST:edit |
| `api/legal-hub/templates/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/legal-holds/route.ts` | GET:view, POST:edit |
| `api/legal-holds/[id]/release/route.ts` | POST | edit |

#### policies resource
| Route file | Methods | Levels |
|---|---|---|
| `api/policies/route.ts` | GET:view, POST:edit |
| `api/policies/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |
| `api/policies/[id]/test/route.ts` | POST | view |

#### qa_cards resource
| Route file | Methods | Levels |
|---|---|---|
| `api/qa-cards/route.ts` | GET:view, POST:edit |
| `api/qa-cards/[id]/route.ts` | GET:view, PATCH:edit, DELETE:full |

## Implementation Approach

### For routes with a single exported handler (most routes):
Add one permission check block right after orgId, before ensureDb/try.

### For routes with multiple handlers (e.g., GET + POST, GET + PATCH + DELETE):
Each handler gets its own permission check with the appropriate level for that HTTP method.

### Placement decision:
The lead notes say "immediately after orgId, BEFORE ensureDb()". Looking at actual route patterns:
- Pattern A: `orgId` then `ensureDb()` then try/business-logic (e.g., `documents/route.ts`)
- Pattern B: `orgId` then `try { await ensureDb(); ... }` (e.g., `documents/[id]/route.ts`)

The permission check goes right after `const orgId = Number(session.user.orgId);` in both cases. It does NOT need ensureDb() since it reads from session (JWT), not from DB.

### gdrive/route.ts note:
The task description mentions `src/app/api/gdrive/route.ts` but this file does not exist. Only `gdrive/settings`, `gdrive/scan`, and `gdrive/status` exist. I will update those three.

### desk/questionnaire/approve/route.ts note:
Not explicitly listed in task description but exists and creates QA cards from document analysis. I will add documents:edit permission check here as it's a mutation derived from document analysis.

## Risks and Trade-offs

1. **Volume risk**: ~80 handler modifications. Mitigated by mechanical insertion of identical pattern.
2. **Regression risk**: Low -- all existing tests use owner/admin sessions which bypass permission checks (permissions = null for non-member).
3. **Placement consistency**: Some routes have ensureDb before orgId extraction. Must read each file carefully.
4. **Cast safety**: Using `as any` cast on permission level is pragmatic -- the values come from DB which are validated at write time.

## Success Criteria Mapping
- member + documents='none' -> GET /api/documents 403: Covered by check in documents/route.ts
- member + documents='view' -> GET 200, DELETE 403: GET check requires 'view' (passes), DELETE check requires 'full' (fails)
- member + documents='edit' -> POST upload 200, DELETE 403: POST check requires 'edit' (passes), DELETE requires 'full' (fails)
- member + documents='full' -> all pass: 'full' >= any required level
- Owner/admin bypass: `session.user.orgRole === 'member'` guard means non-members skip check
- isSuperAdmin bypass: `!session.user.isSuperAdmin` guard
- session.user.permissions populated for member, null for owner/admin: JWT callback logic
