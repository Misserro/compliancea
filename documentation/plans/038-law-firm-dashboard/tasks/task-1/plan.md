# Task 1 — DB Schema Migration: assigned_to + Lawyer Profile Columns

## Files to Modify

1. **`lib/db.js`** — ALTER TABLE migrations, backfill, function updates
2. **`src/lib/types.ts`** — LegalCase interface additions

## Changes

### 1. `lib/db.js` — Schema Migrations (after line ~808, before `initSystemTemplates()`)

Add a new migration block following the existing `try { ALTER TABLE ... } catch (e) {}` pattern:

```js
// -- Case assignment + lawyer profile (Plan 038) --
try { db.run(`ALTER TABLE legal_cases ADD COLUMN assigned_to INTEGER REFERENCES users(id)`); } catch (e) {}

try { db.run(`ALTER TABLE org_members ADD COLUMN first_name TEXT`); } catch (e) {}
try { db.run(`ALTER TABLE org_members ADD COLUMN last_name TEXT`); } catch (e) {}
try { db.run(`ALTER TABLE org_members ADD COLUMN phone TEXT`); } catch (e) {}
try { db.run(`ALTER TABLE org_members ADD COLUMN specialization TEXT`); } catch (e) {}
try { db.run(`ALTER TABLE org_members ADD COLUMN bar_registration_number TEXT`); } catch (e) {}
```

Add backfill SQL (runs on every startup, but only affects rows where `assigned_to IS NULL`):

```js
db.run(`UPDATE legal_cases SET assigned_to = (
  SELECT user_id FROM org_members
  WHERE org_id = legal_cases.org_id
    AND role IN ('owner', 'admin')
  ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, joined_at ASC
  LIMIT 1
) WHERE assigned_to IS NULL`);
```

### 2. `lib/db.js` — `getLegalCases` function (line ~2815)

Change signature from `({ search, status, caseType, orgId } = {})` to `({ search, status, caseType, orgId, userId, orgRole } = {})`.

Update the SQL:
- Add `LEFT JOIN users u ON lc.assigned_to = u.id`
- Add `u.name as assigned_to_name` to the SELECT
- Add `lc.assigned_to` explicitly in SELECT (already covered by `lc.*` but `assigned_to_name` needs the JOIN)
- After the orgId filter, add: if `orgRole === 'member'`, add `AND lc.assigned_to = ?` with userId param

### 3. `lib/db.js` — `getLegalCaseById` function (line ~2854)

Update the SQL to include the same JOIN and select `assigned_to_name`:
- Add `LEFT JOIN users u ON lc.assigned_to = u.id`
- Add `u.name as assigned_to_name` to SELECT

### 4. `lib/db.js` — `createLegalCase` function (line ~2871)

Add `assignedTo` to the destructured params (with `assignedTo = null`).
Add `assigned_to` column to the INSERT statement and the corresponding value.

### 5. `lib/db.js` — `updateLegalCase` function (line ~2921)

Add `"assigned_to"` to the `allowedFields` array.

### 6. `src/lib/types.ts` — `LegalCase` interface (line ~297)

Add two fields before the closing brace:
```ts
assigned_to: number | null;
assigned_to_name: string | null;
```

## Success Criteria Verification

1. `legal_cases` gets `assigned_to` via ALTER TABLE -- satisfied by migration block
2. Backfill UPDATE ensures all existing cases get non-null `assigned_to` -- satisfied by backfill SQL
3. `org_members` gets all five profile columns -- satisfied by five ALTER TABLE statements
4. `createLegalCase` accepts and stores `assigned_to` -- satisfied by adding to INSERT
5. `getLegalCases` filters by `assigned_to = userId` when `orgRole === 'member'` -- satisfied by conditional WHERE clause
6. `updateLegalCase` allows `assigned_to` -- satisfied by adding to allowedFields

## Risks

- Backfill runs on every startup. It's idempotent (WHERE assigned_to IS NULL) so safe for repeated runs.
- If an org has no owner or admin, the backfill subquery returns NULL and those cases remain unassigned. This is an edge case that shouldn't occur in production (every org has at least one owner).
- `getLegalCaseById` also needs the JOIN for consistency -- adding it even though not explicitly listed in success criteria, since API routes use it for case detail views.
