# Task 1 — Wizard Blueprints DB Layer + CRUD API

## Plan

### 1. `lib/db.js` — Table + Functions

**Table** — Add `CREATE TABLE IF NOT EXISTS wizard_blueprints` in `initDb()`, after the `org_permission_defaults` table and before `initSystemTemplates()`:

```sql
CREATE TABLE IF NOT EXISTS wizard_blueprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sections_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Functions** — Add 5 functions at end of file (after `getLatestMigrationJobForOrg`):

1. `createWizardBlueprint(orgId, name, sectionsJson)` — INSERT, return `lastInsertRowId`
2. `getWizardBlueprints(orgId)` — SELECT WHERE org_id = ?, ORDER BY name ASC
3. `getWizardBlueprintById(id, orgId)` — SELECT WHERE id = ? AND org_id = ?
4. `updateWizardBlueprint(id, orgId, data)` — UPDATE allowed fields (name, sections_json) WHERE id = ? AND org_id = ?
5. `deleteWizardBlueprint(id, orgId)` — DELETE WHERE id = ? AND org_id = ?

### 2. `src/lib/db-imports.ts` — Re-exports

Add 5 new function names to the existing export block.

### 3. `src/app/api/legal-hub/wizard/blueprints/route.ts` — GET + POST

Follow `templates/route.ts` pattern exactly:
- Auth: session check → legal_hub feature + edit permission (member role only)
- GET: call `getWizardBlueprints(orgId)`, return `{ blueprints }`
- POST: validate `name` required, call `createWizardBlueprint`, return 201 with `{ blueprint }`

### 4. `src/app/api/legal-hub/wizard/blueprints/[id]/route.ts` — PATCH + DELETE

Follow `templates/[id]/route.ts` pattern exactly:
- PATCH: edit perm, validate id, check exists via `getWizardBlueprintById(id, orgId)`, allow `name` and `sections_json` fields, validate `sections_json` is valid JSON array if provided, call `updateWizardBlueprint`
- DELETE: full perm, validate id, check exists, call `deleteWizardBlueprint`, return 204
