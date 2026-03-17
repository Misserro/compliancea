# Database Standard

> Established: 2026-03-17
> Applies to: Vaulta / sql.js SQLite (WASM, no ORM, raw SQL)
> Related: logging.md, rest-api.md, security.md, module-separation.md

## Principle

All database access flows through a single module (`lib/db.js`) using parameterized queries against an in-memory SQLite database that is serialized to disk after every write. Because sql.js runs in a single JavaScript thread with no connection pooling and no ORM safety net, every query pattern must be deliberate about injection prevention, write persistence, and error visibility. A compliance database that silently loses data or permits injection is a regulatory liability.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| String interpolation of user-supplied values into SQL: `` `WHERE name = '${name}'` `` | Parameterized placeholders: `WHERE name = ?` with values in the params array |
| Swallowing errors with empty `catch` blocks on mutation paths: `catch (e) { /* ignore */ }` | Let errors propagate; only use try/catch-ignore for idempotent migration `ALTER TABLE ADD COLUMN` where "column already exists" is the expected case |
| Writing SQL directly in route handlers (`src/app/api/`) | Call exported functions from `lib/db.js`; import through `src/lib/db-imports.ts` bridge |
| Calling `db.run()` / `db.prepare()` directly outside `lib/db.js` | Use the `run()`, `query()`, or `get()` wrappers which handle persistence and error propagation |
| Hard-coding status/enum values inline in SQL: `WHERE status NOT IN ('met', 'waived')` scattered across files | Define status sets as constants in `lib/db.js` and reference them by name |

## Architecture

```
src/app/api/**/*.ts  -->  src/lib/db-imports.ts  -->  lib/db.js  -->  sql.js (WASM)
                                                                          |
                                                                       db.export()
                                                                          |
                                                                      data/vaulta.db
```

- **`lib/db.js`** (CJS): sole owner of all SQL. Exports named functions for every operation.
- **`src/lib/db-imports.ts`**: TypeScript re-export bridge. Route handlers import from here.
- **`lib/db.d.ts`**: Type declarations for all exported functions.
- **Single thread**: sql.js runs in-process. No concurrent writes. No connection pool.

## Query Interface

Three wrappers in `lib/db.js` handle all database interaction:

| Function | Returns | Use for | Persistence |
|---|---|---|---|
| `query(sql, params)` | `Object[]` | SELECT returning multiple rows | No (read-only) |
| `get(sql, params)` | `Object \| null` | SELECT returning one row | No (read-only) |
| `run(sql, params)` | `{ changes, lastInsertRowId }` | INSERT, UPDATE, DELETE | Yes -- calls `saveDb()` automatically |

### query()

```javascript
// Returns array of row objects; empty array if no matches
const docs = query(
  `SELECT ${DOC_COLUMNS} FROM documents WHERE status = ? ORDER BY added_at DESC`,
  [status]
);
```

### get()

```javascript
// Returns first row as object, or null
const doc = get(
  `SELECT ${DOC_COLUMNS} FROM documents WHERE id = ?`,
  [id]
);
```

### run()

```javascript
// Returns { changes, lastInsertRowId }; calls saveDb() internally
const result = run(
  `INSERT INTO documents (name, path, folder, category) VALUES (?, ?, ?, ?)`,
  [name, filePath, folder, category]
);
const newId = result.lastInsertRowId;
```

## Parameterization Rules

Every value that originates outside `lib/db.js` must be passed as a `?` placeholder parameter. No exceptions.

### Single values

```javascript
run(`UPDATE documents SET status = ? WHERE id = ?`, [newStatus, id]);
```

### Dynamic IN clauses

Build placeholder strings from the array length, then spread the array into params:

```javascript
const placeholders = documentIds.map(() => "?").join(",");
const rows = query(
  `SELECT * FROM chunks WHERE document_id IN (${placeholders})`,
  documentIds
);
```

### Dynamic SET clauses (allowlist pattern)

When accepting an object of fields to update, filter against an explicit allowlist before building the SET clause. Column names from the allowlist are safe to interpolate because they are hard-coded strings, not user input:

```javascript
const allowedFields = ["doc_type", "client", "jurisdiction", "tags", "status"];

const fields = [];
const params = [];

for (const [key, value] of Object.entries(metadata)) {
  if (allowedFields.includes(key)) {
    fields.push(`${key} = ?`);
    params.push(value);
  }
}

if (fields.length === 0) return;
fields.push("updated_at = CURRENT_TIMESTAMP");
params.push(id);

run(`UPDATE documents SET ${fields.join(", ")} WHERE id = ?`, params);
```

This is the established pattern used in `updateDocumentMetadata()`, `updateObligation()`, and `updateQaCard()`. Follow it exactly for any new dynamic update function.

## Persistence Model

sql.js operates on an in-memory database. Persistence works as follows:

1. `run()` executes the SQL statement against the in-memory database
2. `run()` calls `saveDb()` which does `fs.writeFileSync(DB_PATH, Buffer.from(db.export()))`
3. The entire database is serialized to disk on every write

Consequences:
- **Every `run()` call is durable** -- if the process crashes after `run()` returns, the write is on disk
- **Reads are always from memory** -- `query()` and `get()` do not touch the filesystem
- **Write cost scales with database size** -- `db.export()` serializes the entire DB every time

## Schema Conventions

### Tables

- `INTEGER PRIMARY KEY AUTOINCREMENT` on every table -- IDs are never reused
- `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` on every table
- `updated_at DATETIME` on tables where records are modified (set via `updated_at = CURRENT_TIMESTAMP` in UPDATE statements, not via trigger)
- Foreign keys use `REFERENCES parent_table(id)` with `ON DELETE CASCADE` where child rows have no independent meaning

### Column types

| SQLite type | Use for |
|---|---|
| `TEXT NOT NULL` | Required string fields (names, paths, entity types) |
| `TEXT` | Optional strings, JSON-serialized objects (`details_json`, `evidence_json`, `metadata_json`) |
| `INTEGER` | IDs, booleans (0/1), counts |
| `INTEGER DEFAULT 0` | Boolean flags (`processed`, `legal_hold`, `confirmed_tags`) |
| `REAL` | Confidence scores, floating-point values |
| `DATETIME` | Timestamps (stored as ISO strings by SQLite) |

### JSON in TEXT columns

Complex nested data is stored as JSON in TEXT columns. The convention:
- Column names end with `_json` (e.g., `scope_json`, `details_json`, `evidence_json`) to signal JSON content
- Exception: `details` in `audit_log` and `tags`/`auto_tags` in `documents` predate this convention
- Parse with `JSON.parse()` in application code; never query into JSON structure with SQL

### Shared column lists

Define column lists as constants when the same SELECT columns are used across multiple functions:

```javascript
const DOC_COLUMNS = `id, name, path, folder, category, added_at, processed, ...`;

// Reuse everywhere
export function getAllDocuments() {
  return query(`SELECT ${DOC_COLUMNS} FROM documents ORDER BY category, added_at DESC`);
}

export function getDocumentById(id) {
  return get(`SELECT ${DOC_COLUMNS} FROM documents WHERE id = ?`, [id]);
}
```

## Migration Pattern

New columns are added using the try/catch `ALTER TABLE` pattern. This is the only place where catch-and-ignore is acceptable:

```javascript
// In initDb() -- runs on every startup
try {
  db.run(`ALTER TABLE documents ADD COLUMN new_field TEXT`);
} catch (e) {
  // Column already exists -- expected on subsequent startups
}
```

For multiple columns, use the batch migration pattern:

```javascript
const newColumns = [
  { name: "field_a", def: "TEXT" },
  { name: "field_b", def: "INTEGER DEFAULT 0" },
];

for (const col of newColumns) {
  try {
    db.run(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.def}`);
  } catch (e) {
    // Column already exists
  }
}
```

Rules:
- All migrations run inside `initDb()` -- nowhere else
- Use `CREATE TABLE IF NOT EXISTS` for new tables
- Use try/catch `ALTER TABLE ADD COLUMN` for new columns on existing tables
- Column definitions (`col.def`) are hard-coded strings in the migration array, never user input
- Create indexes with `CREATE INDEX IF NOT EXISTS`

## Function Design in lib/db.js

Every database operation is a named export from `lib/db.js`. Follow these conventions:

| Convention | Example |
|---|---|
| Getter returning one row: `get{Entity}By{Field}` | `getDocumentById(id)`, `getDocumentByPath(path)` |
| Getter returning many rows: `getAll{Entities}` or `get{Entities}By{Field}` | `getAllDocuments()`, `getChunksByDocumentId(id)` |
| Insert: `add{Entity}` | `addDocument(name, path, folder, category)` |
| Update: `update{Entity}{Field}` or `update{Entity}` | `updateDocumentStatus(id, status)`, `updateDocumentMetadata(id, metadata)` |
| Delete: `delete{Entity}` or `delete{Entities}By{Field}` | `deleteDocument(id)`, `deleteChunksByDocumentId(docId)` |
| Count: `get{Entity}Count` or `getTotal{Entity}Count` | `getOpenTaskCount()`, `getTotalDocumentCount()` |

Return values:
- **Insert functions** return `lastInsertRowId` (the new row's ID)
- **Update/delete functions** return nothing (void) unless the caller needs confirmation
- **Getters** return the query/get result directly

## Multi-Step Mutations

sql.js in this project does not use transactions. When a mutation involves multiple tables, execute them sequentially and be aware that partial failure is possible:

```javascript
export function deleteDocument(id) {
  // Delete children first
  run("DELETE FROM chunks WHERE document_id = ?", [id]);
  // Then delete parent
  run("DELETE FROM documents WHERE id = ?", [id]);
}
```

Order operations so that if a crash occurs mid-sequence, the database is in a recoverable state (orphaned children are preferable to dangling foreign keys).

## Type Bridge

TypeScript route handlers never import from `lib/db.js` directly. The bridge pattern:

**`src/lib/db-imports.ts`** re-exports functions:
```typescript
export { getAllDocuments, getDocumentById, addDocument, ... } from "../../lib/db.js";
```

**`lib/db.d.ts`** provides type stubs:
```typescript
export function getDocumentById(id: number): Record<string, any> | null;
export function run(sql: string, params?: any[]): { changes: number; lastInsertRowId: number };
```

When adding a new function to `lib/db.js`:
1. Add the function implementation in `lib/db.js`
2. Add the type declaration in `lib/db.d.ts`
3. Add the re-export in `src/lib/db-imports.ts`

## Known Gaps (Do Not Work Around)

These are acknowledged limitations tracked for future work:

- **No transactions**: Multi-step mutations are not atomic. Do not attempt manual transaction simulation.
- **No migration versioning**: Migrations are idempotent ADD COLUMN statements. There is no version tracking table.
- **No backup mechanism**: The single `vaulta.db` file is the only copy. Backup is an infrastructure concern.
- **No query profiling**: There is no slow-query logging. If performance investigation is needed, add temporary timing around specific functions, then remove it.
- **Hard deletes only**: All DELETE operations physically remove rows. Soft-delete is not implemented.

## Related

- [logging.md](logging.md) -- audit trail writes use `run()` through `logAction()`; audit immutability rules
- rest-api.md -- route handlers that call database functions
- security.md -- parameterization requirements, data sensitivity classifications
- module-separation.md -- CJS/TypeScript bridge pattern, module boundaries
