# Task 1 Implementation Plan -- Org Schema, Auth Org Context, Settings Persistence

## Files to Create

1. **`src/app/(app)/no-org/page.tsx`** -- Simple error page for users with no org membership

## Files to Modify

1. **`lib/db.js`** -- New tables, ALTER TABLE migrations, first-run org bootstrap
2. **`lib/db.d.ts`** -- Type declarations for new exported functions
3. **`src/lib/db-imports.ts`** -- Re-export new functions
4. **`src/auth.ts`** -- Type augmentation + JWT/session callbacks for orgId/orgRole/orgName
5. **`src/app/(app)/layout.tsx`** -- Org membership guard
6. **`src/app/api/auth/register/route.ts`** -- Auto-enroll new users in default org
7. **`lib/settings.js`** -- Replace in-memory singleton with DB-backed per-org store
8. **`lib/settings.d.ts`** -- Updated type declarations
9. **`src/lib/settings-imports.ts`** -- Updated re-exports
10. **`src/app/api/settings/route.ts`** -- Auth guard + orgId
11. **`src/app/api/settings/defaults/route.ts`** -- Auth guard (orgId not needed for defaults)
12. **`src/app/api/settings/reset/route.ts`** -- Auth guard + orgId

## Detailed Changes

### 1. lib/db.js -- Schema and Migrations

**New tables** (added at the end of existing CREATE TABLE block, before indexes):

```sql
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  invited_by INTEGER REFERENCES users(id),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS org_invites (
  token TEXT PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME
);
```

**ALTER TABLE migrations** -- add `org_id` to 12 tables using the batch pattern:

Tables: documents, legal_cases, contract_obligations, tasks, legal_holds, policy_rules, qa_cards, audit_log, case_templates, app_settings, chunks, product_features

Also add `user_id` to audit_log.

Note: app_settings currently has `key TEXT PRIMARY KEY`. Adding org_id changes the semantics -- a setting is now per (org_id, key). We need to handle the primary key issue: SQLite cannot ALTER TABLE to change the primary key, but we can add org_id as a column. The unique constraint on (org_id, key) can be added via CREATE UNIQUE INDEX IF NOT EXISTS. The old rows will have org_id = NULL initially, then get backfilled to 1.

**First-run bootstrap** (after `saveDb()` at end of initDb, before `return db`):

```javascript
// Check if organizations table is empty
const orgCount = get(`SELECT COUNT(*) as count FROM organizations`);
if (orgCount && orgCount.count === 0) {
  // 1. Insert default org
  run(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, ["Default Organization", "default"]);

  // 2. Backfill org_id = 1 on all data tables
  const tablesToBackfill = [
    'documents', 'legal_cases', 'contract_obligations', 'tasks',
    'legal_holds', 'policy_rules', 'qa_cards', 'audit_log',
    'case_templates', 'app_settings', 'chunks', 'product_features'
  ];
  for (const table of tablesToBackfill) {
    run(`UPDATE ${table} SET org_id = 1 WHERE org_id IS NULL`);
  }

  // 3. Enroll all existing users as owners
  const users = query(`SELECT id FROM users`);
  for (const user of users) {
    run(`INSERT INTO org_members (org_id, user_id, role) VALUES (1, ?, 'owner')`, [user.id]);
  }
}
```

**New exported functions:**

- `getOrgMemberByUserId(userId)` -- returns first org membership row ordered by joined_at ASC
- `addOrgMember(orgId, userId, role, invitedBy)` -- inserts into org_members
- `getDefaultOrg()` -- returns first org row ordered by id ASC

### 2. src/auth.ts -- Type Augmentation and Callbacks

**Type augmentation** additions:
- Session.user: add `orgId?: number`, `orgRole?: string`, `orgName?: string`
- JWT: add `orgId?: number`, `orgRole?: string`, `orgName?: string`

**JWT callback changes:**
- Import `getOrgMemberByUserId` from db-imports
- In the `if (user)` block (first sign-in), after creating session, look up org membership from org_members via getOrgMemberByUserId. Set `token.orgId`, `token.orgRole`, `token.orgName`.
- In the `else if` block (subsequent requests), also ensure orgId is populated (for lazy re-hydration).

**Session callback changes:**
- Propagate `orgId`, `orgRole`, `orgName` from token to session.

Note on JWT module: The research brief says `"next-auth/jwt"` for the JWT module declaration. But the existing code uses `"@auth/core/jwt"`. I will follow the existing pattern (`@auth/core/jwt`) since that's what's already working in the codebase.

### 3. src/app/(app)/layout.tsx -- Org Guard

After the existing session revocation check, add:

```typescript
if (!session.user.orgId) {
  redirect("/no-org");
}
```

### 4. src/app/(app)/no-org/page.tsx -- Error Page

Simple page explaining the user has no organization membership. Provides a link to contact admin and a sign-out button/link.

### 5. src/app/api/auth/register/route.ts -- Auto-enroll

After `createUser()`, look up the default org and insert into org_members:

```typescript
import { getDefaultOrg, addOrgMember } from "@/lib/db-imports";

// After createUser...
const user = createUser(normalizedEmail, name ?? null, passwordHash);
const defaultOrg = getDefaultOrg();
if (defaultOrg) {
  addOrgMember(defaultOrg.id, user.id, 'member', null);
}
```

### 6. lib/settings.js -- DB-backed per-org Store

Replace entire module:
- Remove `currentSettings` in-memory variable
- `getSettings(orgId)` -- query `app_settings WHERE org_id = ?`, build settings object from rows, merge defaults for missing keys
- `updateSettings(orgId, patch)` -- for each key in patch, upsert into app_settings with org_id
- `resetSettings(orgId)` -- delete all app_settings rows for org_id
- `getDefaultSettings()` -- remains unchanged, returns static defaults

The app_settings table already exists with `key TEXT PRIMARY KEY`. After migration it will have an additional `org_id` column. We need to change the primary key to `(org_id, key)` but SQLite does not support ALTER TABLE for this. Instead, we will add a unique index on (org_id, key) and adjust queries to use org_id. The old primary key on `key` alone will remain but since we add org_id to each row, the INSERT OR REPLACE pattern needs to change to explicit check-then-insert-or-update using the (org_id, key) pair.

Per Lead advisory: the existing `app_settings` has `key TEXT PRIMARY KEY` which must become `(org_id, key)` composite PK. SQLite cannot ALTER TABLE for this. Using Option 1: recreate the table.

Migration approach (inside initDb, after org_id ALTER TABLE block):
```javascript
try {
  // Check if app_settings still has old schema (no org_id column)
  db.run(`SELECT org_id FROM app_settings LIMIT 0`);
  // If we get here, org_id already exists -- skip migration
} catch (e) {
  // org_id doesn't exist -- recreate table with composite PK
  db.run(`ALTER TABLE app_settings RENAME TO app_settings_old`);
  db.run(`CREATE TABLE app_settings (
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    key TEXT NOT NULL,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, key)
  )`);
  db.run(`INSERT INTO app_settings (org_id, key, value, updated_at)
    SELECT 1, key, value, updated_at FROM app_settings_old`);
  db.run(`DROP TABLE app_settings_old`);
}
```

This ensures the upsert pattern `INSERT OR REPLACE INTO app_settings (org_id, key, value, updated_at)` works correctly with the composite PK.

### 7. Settings API Routes

All three routes get the same auth guard pattern at the top:

```typescript
import { auth } from "@/auth";

const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

For GET/PATCH/POST: pass `session.user.orgId` to getSettings/updateSettings/resetSettings.

### 8. getSettings callers outside settings API

The `ask/route.ts` and `desk/analyze/route.ts` also call `getSettings()`. These are in Task 2 scope (API routes get org context). For Task 1, I will update the `getSettings` function signature to accept `orgId` parameter with a default fallback: if no orgId is passed, return defaults. This avoids breaking existing callers until Task 2 updates them.

Wait -- actually, the task description says to update the settings API routes specifically. The other callers (ask, desk) are Task 2's responsibility. But if I change `getSettings()` to require `orgId`, those callers will break. So I'll make `orgId` optional with a default of 1 (the default org) for backward compatibility. Task 2 will then pass the proper orgId.

## Risks and Trade-offs

1. **app_settings PK issue**: Cannot change PK from `key` to `(org_id, key)` via ALTER TABLE. Using a unique index + custom upsert logic instead.
2. **Backward compatibility of getSettings()**: Making orgId optional (default 1) so existing callers in ask/desk routes don't break before Task 2 updates them.
3. **JWT schema change**: All active sessions will be invalidated. Users must re-login. Expected per lead notes.
4. **initDb() ordering**: org tables must be created BEFORE the org bootstrap runs. Tables must be created BEFORE ALTER TABLE migrations. The bootstrap must run AFTER both.

## Success Criteria Mapping

- Fresh install: initDb() creates org tables, detects empty organizations, inserts default org, backfills data, enrolls users -> COVERED by bootstrap logic
- Existing data: same bootstrap but data rows exist -> UPDATE WHERE org_id IS NULL backfills them
- Login returns orgId/orgRole: JWT callback queries org_members -> COVERED by auth.ts changes
- No-org redirect: layout.tsx checks session.user.orgId -> COVERED
- Settings persistence: DB-backed store replaces in-memory -> COVERED by settings.js rewrite
- 401 on unauthenticated settings: auth guard on all three routes -> COVERED
