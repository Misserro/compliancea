/**
 * Integration tests for Task 1: Permission DB Layer
 *
 * Tests are written against the plan's success criteria:
 * 1. seedOrgPermissionDefaults(1) creates 5 rows with action='full' in org_permission_defaults
 * 2. seedMemberPermissionsFromDefaults(1, 2) creates 5 rows in member_permissions mirroring org defaults
 * 3. getUserPermissionForResource returns 'full' after seeding
 * 4. setMemberPermission overrides a specific resource; subsequent getUserPermissionForResource returns new value
 * 5. resetMemberPermissions restores user back to org defaults
 * 6. createOrganization now seeds org defaults automatically
 * 7. addOrgMember with role='member' seeds user permissions from org defaults
 *
 * Additional edge cases:
 * - Both new tables exist with correct columns and PKs
 * - getOrgPermissionDefaults + getMemberPermissions return arrays with all 5 resources
 * - PERMISSION_RESOURCES contains exactly the 5 expected resources
 * - seedOrgPermissionDefaults is idempotent (INSERT OR IGNORE)
 * - seedMemberPermissionsFromDefaults is idempotent (INSERT OR IGNORE)
 * - getUserPermissionForResource returns 'full' as fallback when no row exists (backward compat)
 * - addOrgMember with role='owner' does NOT seed member permissions
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import initSqlJs from "sql.js";

// ── Mock fs and paths so db.js never touches the real filesystem ─────────────
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  DB_PATH: "/tmp/test-db-fake-031.sqlite",
  DOCUMENTS_DIR: "/tmp/test-docs",
  GDRIVE_DIR: "/tmp/test-gdrive",
  INVOICES_DIR: "/tmp/test-invoices",
  CONTRACT_ATTACHMENTS_DIR: "/tmp/test-contract-attachments",
  CASE_ATTACHMENTS_DIR: "/tmp/test-case-attachments",
  DB_DIR: "/tmp/test-db",
  isRailway: false,
  ensureDirectories: vi.fn(),
}));

// @ts-ignore
import * as dbModule from "../../lib/db.js";

const EXPECTED_RESOURCES = ['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards'];

// ── Helper: create a test user and return their id ────────────────────────────
function createTestUser(email: string): number {
  dbModule.run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    [email, "Test User", "hash"]
  );
  const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [email]);
  return user!.id;
}

// ── Helper: create a second org and return its id ─────────────────────────────
function createTestOrg(name: string, slug: string): number {
  return dbModule.createOrganization(name, slug);
}

// ── Schema tests ──────────────────────────────────────────────────────────────

describe("Schema: permission tables created by initDb()", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("member_permissions table exists with correct columns", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(member_permissions)`);
    expect(result.length).toBeGreaterThan(0);
    const columns = result[0].values.map((row: any[]) => row[1]);
    expect(columns).toContain("org_id");
    expect(columns).toContain("user_id");
    expect(columns).toContain("resource");
    expect(columns).toContain("action");
  });

  it("member_permissions has composite PK (org_id, user_id, resource)", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(member_permissions)`);
    // pk column in PRAGMA table_info: 0=not PK, positive=part of PK
    const pkCols = result[0].values
      .filter((row: any[]) => row[5] > 0)
      .map((row: any[]) => row[1]);
    expect(pkCols).toContain("org_id");
    expect(pkCols).toContain("user_id");
    expect(pkCols).toContain("resource");
  });

  it("org_permission_defaults table exists with correct columns", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(org_permission_defaults)`);
    expect(result.length).toBeGreaterThan(0);
    const columns = result[0].values.map((row: any[]) => row[1]);
    expect(columns).toContain("org_id");
    expect(columns).toContain("resource");
    expect(columns).toContain("action");
  });

  it("org_permission_defaults has composite PK (org_id, resource)", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(org_permission_defaults)`);
    const pkCols = result[0].values
      .filter((row: any[]) => row[5] > 0)
      .map((row: any[]) => row[1]);
    expect(pkCols).toContain("org_id");
    expect(pkCols).toContain("resource");
  });
});

// ── PERMISSION_RESOURCES constant ─────────────────────────────────────────────

describe("PERMISSION_RESOURCES constant", () => {
  it("is exported and contains exactly the 5 expected resources", () => {
    expect(dbModule.PERMISSION_RESOURCES).toEqual(EXPECTED_RESOURCES);
  });

  it("contains exactly 5 elements", () => {
    expect(dbModule.PERMISSION_RESOURCES).toHaveLength(5);
  });
});

// ── Criterion 1: seedOrgPermissionDefaults ────────────────────────────────────

describe("seedOrgPermissionDefaults — Criterion 1", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("creates exactly 5 rows in org_permission_defaults with action='full'", () => {
    // Use org id=1 which was created by bootstrap (but NOT via createOrganization,
    // so defaults were not seeded — we call seedOrgPermissionDefaults directly)
    dbModule.seedOrgPermissionDefaults(1);
    const rows = dbModule.query(
      `SELECT * FROM org_permission_defaults WHERE org_id = 1`
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.action).toBe("full");
    }
  });

  it("creates one row per resource — covers all 5 expected resources", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const rows = dbModule.query(
      `SELECT resource FROM org_permission_defaults WHERE org_id = 1`
    );
    const resources = rows.map((r: any) => r.resource);
    for (const expected of EXPECTED_RESOURCES) {
      expect(resources).toContain(expected);
    }
  });

  it("is idempotent — calling twice does not duplicate rows", () => {
    dbModule.seedOrgPermissionDefaults(1);
    dbModule.seedOrgPermissionDefaults(1);
    const rows = dbModule.query(
      `SELECT * FROM org_permission_defaults WHERE org_id = 1`
    );
    expect(rows).toHaveLength(5);
  });
});

// ── Criterion 2: seedMemberPermissionsFromDefaults ────────────────────────────

describe("seedMemberPermissionsFromDefaults — Criterion 2", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("creates 5 rows in member_permissions mirroring org defaults", () => {
    // Seed org defaults for org 1 first
    dbModule.seedOrgPermissionDefaults(1);
    // Create a test user
    const userId = createTestUser("user-seed@test.com");

    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    const rows = dbModule.query(
      `SELECT * FROM member_permissions WHERE org_id = 1 AND user_id = ?`,
      [userId]
    );
    expect(rows).toHaveLength(5);
  });

  it("member_permissions rows mirror org defaults (same action values)", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-mirror@test.com");

    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    const orgDefaults = dbModule.getOrgPermissionDefaults(1);
    const memberPerms = dbModule.getMemberPermissions(1, userId);

    // Build maps for comparison
    const defaultMap: Record<string, string> = {};
    for (const d of orgDefaults) {
      defaultMap[d.resource] = d.action;
    }
    for (const p of memberPerms) {
      expect(p.action).toBe(defaultMap[p.resource]);
    }
  });

  it("is idempotent — calling twice does not duplicate rows", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-idem@test.com");

    dbModule.seedMemberPermissionsFromDefaults(1, userId);
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    const rows = dbModule.query(
      `SELECT * FROM member_permissions WHERE org_id = 1 AND user_id = ?`,
      [userId]
    );
    expect(rows).toHaveLength(5);
  });

  it("preserves existing custom permissions when called again (INSERT OR IGNORE)", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-preserve@test.com");

    // Initial seed
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    // Manually override one permission
    dbModule.setMemberPermission(1, userId, "contracts", "view");

    // Re-seed — should NOT overwrite the override
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    const perm = dbModule.getUserPermissionForResource(1, userId, "contracts");
    expect(perm).toBe("view"); // Custom value preserved
  });
});

// ── Criterion 3: getUserPermissionForResource returns 'full' after seeding ────

describe("getUserPermissionForResource — Criterion 3", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns 'full' for every resource after seeding", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-getperm@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    for (const resource of EXPECTED_RESOURCES) {
      const perm = dbModule.getUserPermissionForResource(1, userId, resource);
      expect(perm).toBe("full");
    }
  });

  it("returns 'full' as fallback when no row exists (backward compatibility)", () => {
    const userId = createTestUser("user-norow@test.com");
    // No seeding — no rows exist
    const perm = dbModule.getUserPermissionForResource(1, userId, "documents");
    expect(perm).toBe("full");
  });
});

// ── Criterion 4: setMemberPermission overrides a specific resource ─────────────

describe("setMemberPermission — Criterion 4", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("overrides contracts permission to 'view'; subsequent get returns 'view'", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-override@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    dbModule.setMemberPermission(1, userId, "contracts", "view");

    const perm = dbModule.getUserPermissionForResource(1, userId, "contracts");
    expect(perm).toBe("view");
  });

  it("can override to 'none'", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-none@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    dbModule.setMemberPermission(1, userId, "legal_hub", "none");
    expect(dbModule.getUserPermissionForResource(1, userId, "legal_hub")).toBe("none");
  });

  it("can override to 'edit'", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-edit@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    dbModule.setMemberPermission(1, userId, "policies", "edit");
    expect(dbModule.getUserPermissionForResource(1, userId, "policies")).toBe("edit");
  });

  it("does not affect other resources when one is overridden", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-isolated@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    dbModule.setMemberPermission(1, userId, "contracts", "view");

    // Other resources remain 'full'
    expect(dbModule.getUserPermissionForResource(1, userId, "documents")).toBe("full");
    expect(dbModule.getUserPermissionForResource(1, userId, "legal_hub")).toBe("full");
    expect(dbModule.getUserPermissionForResource(1, userId, "policies")).toBe("full");
    expect(dbModule.getUserPermissionForResource(1, userId, "qa_cards")).toBe("full");
  });
});

// ── Criterion 5: resetMemberPermissions restores user back to org defaults ────

describe("resetMemberPermissions — Criterion 5", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("restores user back to org defaults after override", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-reset@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    // Override multiple permissions
    dbModule.setMemberPermission(1, userId, "contracts", "none");
    dbModule.setMemberPermission(1, userId, "legal_hub", "view");

    // Reset
    dbModule.resetMemberPermissions(1, userId);

    // All should be back to 'full' (matching org defaults)
    for (const resource of EXPECTED_RESOURCES) {
      const perm = dbModule.getUserPermissionForResource(1, userId, resource);
      expect(perm).toBe("full");
    }
  });

  it("still has exactly 5 rows after reset", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-reset-count@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    dbModule.setMemberPermission(1, userId, "contracts", "none");
    dbModule.resetMemberPermissions(1, userId);

    const rows = dbModule.query(
      `SELECT * FROM member_permissions WHERE org_id = 1 AND user_id = ?`,
      [userId]
    );
    expect(rows).toHaveLength(5);
  });

  it("respects current org defaults (not original seeded values) after org default changes", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-reset-newdefault@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    // Change org default for 'documents' to 'view'
    dbModule.setOrgPermissionDefault(1, "documents", "view");

    // Override user permission
    dbModule.setMemberPermission(1, userId, "documents", "none");

    // Reset — should restore to current org default (view), not original (full)
    dbModule.resetMemberPermissions(1, userId);

    const perm = dbModule.getUserPermissionForResource(1, userId, "documents");
    expect(perm).toBe("view");
  });
});

// ── Criterion 6: createOrganization seeds org defaults automatically ──────────

describe("createOrganization seeds org defaults automatically — Criterion 6", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("creates 5 org_permission_defaults rows when createOrganization is called", () => {
    const orgId = createTestOrg("New Org", "new-org");

    const rows = dbModule.query(
      `SELECT * FROM org_permission_defaults WHERE org_id = ?`,
      [orgId]
    );
    expect(rows).toHaveLength(5);
  });

  it("all 5 default rows have action='full'", () => {
    const orgId = createTestOrg("Another Org", "another-org");

    const rows = dbModule.query(
      `SELECT * FROM org_permission_defaults WHERE org_id = ?`,
      [orgId]
    );
    for (const row of rows) {
      expect(row.action).toBe("full");
    }
  });

  it("seeded resources cover all 5 expected resources", () => {
    const orgId = createTestOrg("Third Org", "third-org");

    const rows = dbModule.query(
      `SELECT resource FROM org_permission_defaults WHERE org_id = ?`,
      [orgId]
    );
    const resources = rows.map((r: any) => r.resource);
    for (const expected of EXPECTED_RESOURCES) {
      expect(resources).toContain(expected);
    }
  });
});

// ── Criterion 7: addOrgMember with role='member' seeds permissions ─────────────

describe("addOrgMember with role='member' seeds user permissions — Criterion 7", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("seeds 5 member_permissions rows when role='member' and org has defaults", () => {
    // Create a new org via createOrganization (which seeds defaults)
    const orgId = createTestOrg("Member Test Org", "member-test-org");
    const userId = createTestUser("member-test@test.com");

    dbModule.addOrgMember(orgId, userId, "member", null);

    const rows = dbModule.query(
      `SELECT * FROM member_permissions WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    );
    expect(rows).toHaveLength(5);
  });

  it("seeded member permissions mirror org defaults when role='member'", () => {
    const orgId = createTestOrg("Member Mirror Org", "member-mirror-org");
    const userId = createTestUser("member-mirror@test.com");

    dbModule.addOrgMember(orgId, userId, "member", null);

    for (const resource of EXPECTED_RESOURCES) {
      const perm = dbModule.getUserPermissionForResource(orgId, userId, resource);
      expect(perm).toBe("full"); // defaults are 'full' from createOrganization
    }
  });

  it("does NOT seed member_permissions when role='owner'", () => {
    const orgId = createTestOrg("Owner Test Org", "owner-test-org");
    const userId = createTestUser("owner-test@test.com");

    dbModule.addOrgMember(orgId, userId, "owner", null);

    const rows = dbModule.query(
      `SELECT * FROM member_permissions WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    );
    expect(rows).toHaveLength(0);
  });

  it("does NOT seed member_permissions when role='admin'", () => {
    const orgId = createTestOrg("Admin Test Org", "admin-test-org");
    const userId = createTestUser("admin-test@test.com");

    dbModule.addOrgMember(orgId, userId, "admin", null);

    const rows = dbModule.query(
      `SELECT * FROM member_permissions WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    );
    expect(rows).toHaveLength(0);
  });
});

// ── getOrgPermissionDefaults and getMemberPermissions array return ─────────────

describe("getOrgPermissionDefaults + getMemberPermissions return all 5 resources", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getOrgPermissionDefaults returns array of 5 {resource, action} objects", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const defaults = dbModule.getOrgPermissionDefaults(1);
    expect(Array.isArray(defaults)).toBe(true);
    expect(defaults).toHaveLength(5);
    for (const d of defaults) {
      expect(d).toHaveProperty("resource");
      expect(d).toHaveProperty("action");
    }
  });

  it("getMemberPermissions returns array of 5 {resource, action} objects after seeding", () => {
    dbModule.seedOrgPermissionDefaults(1);
    const userId = createTestUser("user-getmember@test.com");
    dbModule.seedMemberPermissionsFromDefaults(1, userId);

    const perms = dbModule.getMemberPermissions(1, userId);
    expect(Array.isArray(perms)).toBe(true);
    expect(perms).toHaveLength(5);
    for (const p of perms) {
      expect(p).toHaveProperty("resource");
      expect(p).toHaveProperty("action");
    }
  });

  it("getMemberPermissions returns empty array for user with no permissions", () => {
    const userId = createTestUser("user-empty@test.com");
    const perms = dbModule.getMemberPermissions(1, userId);
    expect(Array.isArray(perms)).toBe(true);
    expect(perms).toHaveLength(0);
  });
});
