# Task 1 — Implementation Notes

## Files Modified

### `lib/db.js`
- Added `CREATE TABLE IF NOT EXISTS wizard_blueprints` in `initDb()` (after `org_permission_defaults`, before `initSystemTemplates()`)
- Added 5 exported functions at end of file:
  - `createWizardBlueprint(orgId, name, sectionsJson)` — INSERT, returns lastInsertRowId
  - `getWizardBlueprints(orgId)` — SELECT all for org, ordered by name ASC
  - `getWizardBlueprintById(id, orgId)` — SELECT single, scoped by org_id
  - `updateWizardBlueprint(id, orgId, data)` — UPDATE name/sections_json, scoped by org_id
  - `deleteWizardBlueprint(id, orgId)` — DELETE, scoped by org_id

### `src/lib/db-imports.ts`
- Added 5 re-exports for the new wizard blueprint functions

### `src/app/api/legal-hub/wizard/blueprints/route.ts` (NEW)
- GET: lists org's blueprints (edit perm)
- POST: creates blueprint, validates name required + sections_json valid JSON array (edit perm)

### `src/app/api/legal-hub/wizard/blueprints/[id]/route.ts` (NEW)
- PATCH: updates name and/or sections_json, validates sections_json if provided (edit perm)
- DELETE: deletes blueprint, returns 204 (full perm)

## Key Design Decisions
- All DB queries filter by `org_id` for cross-org isolation
- Auth pattern matches existing template routes exactly (legal_hub feature + permission level)
- DELETE returns 204 (no body) instead of JSON with id (aligns with REST conventions)
- sections_json validation: must be valid JSON and must be an array
