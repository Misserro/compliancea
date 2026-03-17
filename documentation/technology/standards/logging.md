# Audit Logging Standard

> Established: 2026-03-17
> Applies to: Vaulta / sql.js SQLite audit trail system
> Related: database.md, rest-api.md, security.md, error-handling.md

## Principle

Every mutation to compliance-relevant data must produce an immutable, attributable audit record sufficient for regulatory inquiry. A compliance platform that cannot prove *who* did *what* and *when* is indistinguishable from one that did nothing at all. All logging rules exist to ensure the audit trail is complete, tamper-evident, and queryable under time pressure.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| Logging PII (full names, emails, document content) in the `details` field without sanitization | Log entity IDs and action summaries only; reference sensitive data by ID, never by value |
| Calling `console.log()` / `console.warn()` as a substitute for `logAction()` on mutation paths | Always call `logAction()` for any state change; use `console.warn()` only for transient operational diagnostics that do not need persistence |
| Logging *before* the mutation succeeds (optimistic audit) | Call `logAction()` only after the `run()` call returns without throwing; audit entries must confirm accomplished facts |
| Passing unstructured free-text strings as the `details` parameter | Pass a plain object with named keys; `logAction()` will JSON-serialize it |

## Audit Entry Structure

Every audit log entry uses this schema (defined in `lib/db.js` `initDb()`):

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | System-assigned, never reused |
| `entity_type` | TEXT NOT NULL | Lowercase singular noun from the allowed set (see below) |
| `entity_id` | INTEGER | Required for single-entity operations; NULL only for true batch operations where no single entity applies |
| `action` | TEXT NOT NULL | Past-tense verb from the allowed set (see below) |
| `details` | TEXT (JSON) | Structured object serialized by `logAction()`; NULL when the action is self-explanatory |
| `created_at` | DATETIME | Auto-set via `DEFAULT CURRENT_TIMESTAMP`; never overridden |

## Allowed Entity Types

Use exactly these values for `entity_type`. Do not invent new types without updating this list.

```
document, chunk, setting, query, policy, task, legal_hold,
invoice, contract_document, obligation, qa_card, contract, session, user
```

## Allowed Action Names

Action names are past-tense, lowercase, underscore-separated. The canonical set:

```
created, updated, deleted, searched, state_changed,
hold_applied, hold_released, processed, synced, tagged,
policy_triggered, batch_approved, retag_document,
contract_sign, contract_activate
```

When adding a new action, follow the pattern: `{verb_past_tense}` or `{noun}_{verb_past_tense}`.

## Calling logAction()

All audit logging goes through the centralized `logAction()` function in `lib/audit.js`. Never write raw INSERT statements against `audit_log` from route handlers.

### Signature

```javascript
logAction(entityType, entityId, action, details = null)
```

### Correct usage

```javascript
// Single entity mutation -- log after success
const result = run(
  `UPDATE documents SET status = ? WHERE id = ?`,
  [newStatus, id]
);
logAction("document", id, "state_changed", {
  from: oldStatus,
  to: newStatus,
});
```

```javascript
// Batch operation -- log with null entityId, list affected IDs in details
run(`UPDATE obligations SET status = 'approved' WHERE id IN (${placeholders})`, ids);
logAction("obligation", null, "batch_approved", {
  obligationIds: ids,
  count: ids.length,
});
```

### Import path

Route handlers in `src/app/api/` import through the TypeScript bridge, never directly from `lib/`:

```typescript
// src/app/api/documents/route.ts
import { logAction } from "@/lib/audit-imports";
```

CJS modules in `lib/` import directly:

```javascript
// lib/someModule.js
import { logAction } from "./audit.js";
```

## Details Field Rules

1. **Always pass an object, not a string.** `logAction()` will `JSON.stringify()` objects automatically.
2. **Use descriptive key names.** Keys should be self-documenting: `{ from: "draft", to: "approved" }` not `{ a: "draft", b: "approved" }`.
3. **Never include PII or document content.** Log IDs and field names, not field values that may contain personal data.
4. **Keep details shallow.** One level of nesting maximum. No nested objects or arrays of objects.
5. **Omit details when the action is self-explanatory.** `logAction("document", id, "deleted")` needs no details unless there is context worth preserving (e.g., reason).

```javascript
// Good: structured, shallow, no PII
logAction("legal_hold", holdId, "hold_applied", {
  documentCount: docIds.length,
  matterId: hold.id,
});

// Bad: PII leaking, unstructured
logAction("legal_hold", holdId, "hold_applied",
  `Applied hold "${matterName}" covering ${scope} to ${docIds.length} docs`
);
```

## Timing: Log After Success

Audit entries represent accomplished facts. The pattern is always:

```javascript
// 1. Perform the mutation
run(`DELETE FROM documents WHERE id = ?`, [id]);

// 2. Log only if we reach this line (run() throws on failure)
logAction("document", id, "deleted");
```

Never wrap `logAction()` in a try/catch that swallows the error. If audit logging itself fails, the error must propagate -- a silent audit gap is worse than a visible failure.

## Immutability

The `audit_log` table is INSERT-ONLY. No code path in the application may UPDATE or DELETE audit records. This is enforced by convention today:

- No `UPDATE audit_log` or `DELETE FROM audit_log` statement may exist in the codebase
- The `run()` helper persists to disk via `saveDb()` immediately after every write -- audit entries survive process crashes

## Querying the Audit Log

Use `getAuditLog(filters)` and `getAuditLogCount(filters)` from `lib/audit.js` for all audit retrieval. Never write ad-hoc SELECT queries against `audit_log` in route handlers.

Supported filters:

| Filter | Type | Purpose |
|---|---|---|
| `entityType` | string | Filter by entity type |
| `entityId` | number | Filter by specific entity |
| `action` | string | Filter by action name |
| `since` | ISO string | Entries after this timestamp |
| `until` | ISO string | Entries before this timestamp |
| `limit` | number | Page size (default 100) |
| `offset` | number | Pagination offset (default 0) |

## Known Gaps (Do Not Work Around)

These are acknowledged limitations tracked for future work. Do not attempt ad-hoc fixes:

- **No user attribution**: `audit_log` has no `user_id` column. When multi-user support is added, the schema and `logAction()` signature will be extended.
- **No correlation ID**: Multi-step operations (e.g., document processing) produce independent audit entries with no shared request identifier.
- **No retention policy**: Audit entries accumulate indefinitely. A purge/archive mechanism is a future concern.

## Related

- [database.md](database.md) -- query interface (`run`, `query`, `get`), persistence model, schema conventions
- rest-api.md -- where `logAction()` calls are placed in route handlers
- security.md -- PII handling and data classification
- error-handling.md -- error propagation rules that interact with audit logging
