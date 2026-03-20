/**
 * Integration tests for Task 3: Permission Management API
 * Plan 031 — User Permission System
 *
 * Success criteria (from plan README — PRIMARY source of truth):
 * 1. GET /api/org/permissions returns all 5 resources with their default actions
 * 2. PUT /api/org/permissions with { defaults: { contracts: 'view' } } → subsequent GET shows contracts='view'
 * 3. GET /api/org/members/[id]/permissions returns all 5 resources for that member
 * 4. PUT /api/org/members/[id]/permissions overrides specific resources
 * 5. POST /api/org/members/[id]/permissions/reset restores member to current org defaults
 * 6. All routes return 403 for member role (owner/admin only)
 *
 * Strategy:
 * - Next.js route handlers cannot be imported into Vitest (no next/server runtime).
 * - We test in two layers:
 *   a) DB-layer integration: exercise the actual DB functions to verify data mutations.
 *   b) Code inspection: read each route file to verify guard logic, response shapes,
 *      validation, and audit/saveDb ordering match the spec.
 *
 * NOTE: All file reads use require("node:fs") to bypass the vi.mock("fs") that
 * prevents db.js from touching the real filesystem. require("node:fs") bypasses
 * the mock and reads real files.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolve } from "node:path";

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
  DB_PATH: "/tmp/test-permission-mgmt-api-fake.sqlite",
  DOCUMENTS_DIR: "/tmp/test-docs",
  GDRIVE_DIR: "/tmp/test-gdrive",
  INVOICES_DIR: "/tmp/test-invoices",
  CONTRACT_ATTACHMENTS_DIR: "/tmp/test-contract-attachments",
  CASE_ATTACHMENTS_DIR: "/tmp/test-case-attachments",
  DB_DIR: "/tmp/test-db",
  isRailway: false,
  ensureDirectories: vi.fn(),
}));

// Import the real db module AFTER mocks are set up
// @ts-ignore
import * as dbModule from "../../lib/db.js";

const ROOT = resolve(__dirname, "../..");
const EXPECTED_RESOURCES = ["documents", "contracts", "legal_hub", "policies", "qa_cards"];
const VALID_ACTIONS = ["none", "view", "edit", "full"];

// ── DB helpers ────────────────────────────────────────────────────────────────

function createTestUser(email: string): number {
  dbModule.run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    [email, "Test User", "hash"]
  );
  const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [email]);
  return user!.id;
}

function createTestOrg(name: string, slug: string): number {
  return dbModule.createOrganization(name, slug);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE EXISTENCE CHECKS
// ─────────────────────────────────────────────────────────────────────────────

describe("Route files exist (Task 3 file list)", () => {
  it("src/app/api/org/permissions/route.ts exists", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(resolve(ROOT, "src/app/api/org/permissions/route.ts"))).toBe(true);
  });

  it("src/app/api/org/members/[id]/permissions/route.ts exists", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(resolve(ROOT, "src/app/api/org/members/[id]/permissions/route.ts"))).toBe(true);
  });

  it("src/app/api/org/members/[id]/permissions/reset/route.ts exists", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(resolve(ROOT, "src/app/api/org/members/[id]/permissions/reset/route.ts"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 6: All routes return 403 for member role
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 6: All routes enforce owner/admin guard — code inspection", () => {
  const routes = [
    "src/app/api/org/permissions/route.ts",
    "src/app/api/org/members/[id]/permissions/route.ts",
    "src/app/api/org/members/[id]/permissions/reset/route.ts",
  ];

  for (const rel of routes) {
    const label = rel.replace("src/app/api/", "");

    it(`${label}: returns 401 if no session (unauthenticated)`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("status: 401");
      expect(content).toMatch(/session\?\.user/);
    });

    it(`${label}: returns 403 if orgRole is member (or any non-owner/non-admin)`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("status: 403");
      expect(content).toMatch(/orgRole\s*!==\s*"owner"/);
      expect(content).toMatch(/orgRole\s*!==\s*"admin"/);
    });

    it(`${label}: exports runtime = "nodejs"`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain('export const runtime = "nodejs"');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 1: GET /api/org/permissions returns all 5 resources
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 1: GET /api/org/permissions — all 5 resources", () => {
  const routePath = resolve(ROOT, "src/app/api/org/permissions/route.ts");

  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("[DB] getOrgPermissionDefaults returns 5 rows after org creation", () => {
    const orgId = createTestOrg("Test Org GET", "test-org-get");
    const defaults = dbModule.getOrgPermissionDefaults(orgId);
    expect(defaults).toHaveLength(5);
    const resources = defaults.map((d: any) => d.resource);
    for (const r of EXPECTED_RESOURCES) {
      expect(resources).toContain(r);
    }
  });

  it("[DB] each default has a valid action value", () => {
    const orgId = createTestOrg("Test Org Action", "test-org-action");
    const defaults = dbModule.getOrgPermissionDefaults(orgId);
    for (const d of defaults) {
      expect(VALID_ACTIONS).toContain(d.action);
    }
  });

  it("[code] GET handler calls getOrgPermissionDefaults(orgId)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgPermissionDefaults(orgId)");
  });

  it("[code] GET handler maps array to object with Object.fromEntries", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("Object.fromEntries");
    expect(content).toMatch(/resource.*action/);
  });

  it("[code] GET handler returns { defaults: ... }", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toMatch(/defaults.*defaultsObj|defaults.*updatedObj|\{ defaults:/);
  });

  it("[code] GET handler imports getOrgPermissionDefaults from db-imports", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgPermissionDefaults");
    expect(content).toContain("db-imports");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 2: PUT /api/org/permissions persists changes
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 2: PUT /api/org/permissions — persists partial updates", () => {
  const routePath = resolve(ROOT, "src/app/api/org/permissions/route.ts");

  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("[DB] setOrgPermissionDefault changes contracts to 'view'; subsequent get returns 'view'", () => {
    const orgId = createTestOrg("Org PUT Test", "org-put-test");

    const before = dbModule.getOrgPermissionDefaults(orgId).find(
      (d: any) => d.resource === "contracts"
    );
    expect(before.action).toBe("full");

    dbModule.setOrgPermissionDefault(orgId, "contracts", "view");

    const after = dbModule.getOrgPermissionDefaults(orgId).find(
      (d: any) => d.resource === "contracts"
    );
    expect(after.action).toBe("view");
  });

  it("[DB] partial update: only contracts changes, others remain untouched", () => {
    const orgId = createTestOrg("Org Partial Test", "org-partial-test");
    dbModule.setOrgPermissionDefault(orgId, "contracts", "view");

    const defaults = dbModule.getOrgPermissionDefaults(orgId);
    const resourceMap: Record<string, string> = {};
    for (const d of defaults) resourceMap[d.resource] = d.action;

    expect(resourceMap["contracts"]).toBe("view");
    expect(resourceMap["documents"]).toBe("full");
    expect(resourceMap["legal_hub"]).toBe("full");
    expect(resourceMap["policies"]).toBe("full");
    expect(resourceMap["qa_cards"]).toBe("full");
  });

  it("[DB] can set all 4 action levels for each resource", () => {
    const orgId = createTestOrg("Org All Actions", "org-all-actions");
    for (const action of VALID_ACTIONS) {
      dbModule.setOrgPermissionDefault(orgId, "documents", action);
      const result = dbModule.getOrgPermissionDefaults(orgId).find(
        (d: any) => d.resource === "documents"
      );
      expect(result.action).toBe(action);
    }
  });

  it("[code] PUT handler validates each resource against PERMISSION_RESOURCES", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("PERMISSION_RESOURCES");
    expect(content).toContain("Invalid resource");
    expect(content).toContain("status: 400");
  });

  it("[code] PUT handler validates action against valid actions list", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("VALID_ACTIONS");
    expect(content).toContain("Invalid action");
  });

  it("[code] PUT handler calls setOrgPermissionDefault for each entry", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("setOrgPermissionDefault(orgId, resource,");
  });

  it("[code] PUT handler calls saveDb() BEFORE logAction() (order enforced)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const savePos = content.indexOf("saveDb()");
    const logPos = content.indexOf("logAction(");
    expect(savePos).toBeGreaterThan(-1);
    expect(logPos).toBeGreaterThan(-1);
    expect(savePos).toBeLessThan(logPos);
  });

  it("[code] PUT handler calls logAction with 'org_permissions' entity and 'update' action", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain('"org_permissions"');
    expect(content).toContain('"update"');
    expect(content).toContain("logAction(");
  });

  it("[code] PUT handler re-fetches defaults after update (getOrgPermissionDefaults appears twice)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const fetchCount = (content.match(/getOrgPermissionDefaults/g) || []).length;
    expect(fetchCount).toBeGreaterThanOrEqual(2);
  });

  it("[code] PUT handler rejects empty defaults object with 400 'No permissions provided'", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("No permissions provided");
    expect(content).toContain("status: 400");
  });

  it("[code] PUT handler requires body to have a 'defaults' key", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("body.defaults");
    expect(content).toContain("Body must contain a 'defaults' object");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 3: GET /api/org/members/[id]/permissions returns all 5 resources
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 3: GET /api/org/members/[id]/permissions — all 5 resources", () => {
  const routePath = resolve(ROOT, "src/app/api/org/members/[id]/permissions/route.ts");

  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("[DB] getMemberPermissions returns 5 rows for a seeded member", () => {
    const orgId = createTestOrg("Org Member GET", "org-member-get");
    const userId = createTestUser("member-get@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    const perms = dbModule.getMemberPermissions(orgId, userId);
    expect(perms).toHaveLength(5);
    const resources = perms.map((p: any) => p.resource);
    for (const r of EXPECTED_RESOURCES) {
      expect(resources).toContain(r);
    }
  });

  it("[DB] each permission row has a valid action value", () => {
    const orgId = createTestOrg("Org Member Actions", "org-member-actions");
    const userId = createTestUser("member-actions@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    const perms = dbModule.getMemberPermissions(orgId, userId);
    for (const p of perms) {
      expect(VALID_ACTIONS).toContain(p.action);
    }
  });

  it("[code] GET handler extracts params.id and validates it is numeric", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("parseInt(id, 10)");
    expect(content).toContain("isNaN(targetUserId)");
    expect(content).toContain("Invalid ID");
  });

  it("[code] GET handler verifies target is a member of the org (getOrgMemberRecord check)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgMemberRecord(orgId, targetUserId)");
    expect(content).toContain("Member not found");
    expect(content).toContain("status: 404");
  });

  it("[code] GET handler calls getMemberPermissions(orgId, targetUserId)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getMemberPermissions(orgId, targetUserId)");
  });

  it("[code] GET handler maps array to object and returns { permissions: ... }", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("Object.fromEntries");
    expect(content).toMatch(/permissions.*permsObj|\{ permissions:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 4: PUT /api/org/members/[id]/permissions overrides resources
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 4: PUT /api/org/members/[id]/permissions — overrides specific resources", () => {
  const routePath = resolve(ROOT, "src/app/api/org/members/[id]/permissions/route.ts");

  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("[DB] setMemberPermission overrides contracts to 'view'; getMemberPermissions reflects change", () => {
    const orgId = createTestOrg("Org Override", "org-override");
    const userId = createTestUser("member-override@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    dbModule.setMemberPermission(orgId, userId, "contracts", "view");

    const perms = dbModule.getMemberPermissions(orgId, userId);
    const contracts = perms.find((p: any) => p.resource === "contracts");
    expect(contracts.action).toBe("view");
  });

  it("[DB] override is partial: other resources retain their action", () => {
    const orgId = createTestOrg("Org Partial Override", "org-partial-override");
    const userId = createTestUser("member-partial@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    dbModule.setMemberPermission(orgId, userId, "contracts", "none");

    const perms = dbModule.getMemberPermissions(orgId, userId);
    const permMap: Record<string, string> = {};
    for (const p of perms) permMap[p.resource] = p.action;

    expect(permMap["contracts"]).toBe("none");
    expect(permMap["documents"]).toBe("full");
    expect(permMap["legal_hub"]).toBe("full");
  });

  it("[DB] can override to all 4 action levels", () => {
    const orgId = createTestOrg("Org All Levels", "org-all-levels");
    const userId = createTestUser("member-all-levels@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    for (const action of VALID_ACTIONS) {
      dbModule.setMemberPermission(orgId, userId, "legal_hub", action);
      const perm = dbModule.getUserPermissionForResource(orgId, userId, "legal_hub");
      expect(perm).toBe(action);
    }
  });

  it("[code] PUT handler validates resource against PERMISSION_RESOURCES with 400", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("PERMISSION_RESOURCES");
    expect(content).toContain("Invalid resource");
    expect(content).toContain("status: 400");
  });

  it("[code] PUT handler validates action against VALID_ACTIONS with 400", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("VALID_ACTIONS");
    expect(content).toContain("Invalid action");
  });

  it("[code] PUT handler calls setMemberPermission for each entry", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("setMemberPermission(orgId, targetUserId, resource,");
  });

  it("[code] PUT handler calls saveDb() BEFORE logAction() (enforced order)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const savePos = content.indexOf("saveDb()");
    const logPos = content.indexOf("logAction(");
    expect(savePos).toBeGreaterThan(-1);
    expect(logPos).toBeGreaterThan(-1);
    expect(savePos).toBeLessThan(logPos);
  });

  it("[code] PUT handler logs 'member_permissions' entity with 'update' action", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain('"member_permissions"');
    expect(content).toContain('"update"');
  });

  it("[code] PUT handler re-fetches permissions after update for response (getMemberPermissions appears twice)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const fetchCount = (content.match(/getMemberPermissions/g) || []).length;
    expect(fetchCount).toBeGreaterThanOrEqual(2);
  });

  it("[code] PUT handler returns { permissions: updatedObj }", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toMatch(/\{ permissions:/);
  });

  it("[code] PUT handler verifies target is a member of the org before writing", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgMemberRecord(orgId, targetUserId)");
    expect(content).toContain("Member not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Criterion 5: POST /api/org/members/[id]/permissions/reset
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 5: POST /api/org/members/[id]/permissions/reset — restores org defaults", () => {
  const routePath = resolve(ROOT, "src/app/api/org/members/[id]/permissions/reset/route.ts");

  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("[DB] resetMemberPermissions restores member to current org defaults after overrides", () => {
    const orgId = createTestOrg("Org Reset Test", "org-reset-test");
    const userId = createTestUser("member-reset@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    dbModule.setMemberPermission(orgId, userId, "contracts", "none");
    dbModule.setMemberPermission(orgId, userId, "legal_hub", "view");
    dbModule.setMemberPermission(orgId, userId, "documents", "edit");

    dbModule.resetMemberPermissions(orgId, userId);

    const perms = dbModule.getMemberPermissions(orgId, userId);
    for (const p of perms) {
      expect(p.action).toBe("full");
    }
  });

  it("[DB] reset produces exactly 5 rows (all resources present after reset)", () => {
    const orgId = createTestOrg("Org Reset Count", "org-reset-count");
    const userId = createTestUser("member-reset-count@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    dbModule.setMemberPermission(orgId, userId, "contracts", "none");
    dbModule.resetMemberPermissions(orgId, userId);

    const perms = dbModule.getMemberPermissions(orgId, userId);
    expect(perms).toHaveLength(5);
  });

  it("[DB] reset uses CURRENT org defaults, not original seed values", () => {
    const orgId = createTestOrg("Org Reset Curr Default", "org-reset-curr-default");
    const userId = createTestUser("member-reset-curr@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    // Change org default AFTER member joined
    dbModule.setOrgPermissionDefault(orgId, "documents", "view");

    // Override member
    dbModule.setMemberPermission(orgId, userId, "documents", "none");

    // Reset must reflect new org default 'view', not original 'full'
    dbModule.resetMemberPermissions(orgId, userId);

    const perm = dbModule.getUserPermissionForResource(orgId, userId, "documents");
    expect(perm).toBe("view");
  });

  it("[code] POST handler only exports POST (not GET/PUT)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("export async function POST(");
    expect(content).not.toContain("export async function GET(");
    expect(content).not.toContain("export async function PUT(");
  });

  it("[code] POST handler calls resetMemberPermissions(orgId, targetUserId)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("resetMemberPermissions(orgId, targetUserId)");
  });

  it("[code] POST handler calls saveDb() BEFORE logAction()", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const savePos = content.indexOf("saveDb()");
    const logPos = content.indexOf("logAction(");
    expect(savePos).toBeGreaterThan(-1);
    expect(logPos).toBeGreaterThan(-1);
    expect(savePos).toBeLessThan(logPos);
  });

  it("[code] POST handler logs 'member_permissions' entity with 'reset' action", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain('"member_permissions"');
    expect(content).toContain('"reset"');
  });

  it("[code] POST handler re-fetches getMemberPermissions after reset and returns { permissions: {...} }", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getMemberPermissions(orgId, targetUserId)");
    expect(content).toMatch(/\{ permissions:/);
  });

  it("[code] POST handler validates params.id is numeric", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("parseInt(id, 10)");
    expect(content).toContain("isNaN(targetUserId)");
    expect(content).toContain("Invalid ID");
  });

  it("[code] POST handler verifies target is a member of the org (cross-org safety)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgMemberRecord(orgId, targetUserId)");
    expect(content).toContain("Member not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Round-trip: PUT then GET verifies persistence (criteria 2 & 4)
// ─────────────────────────────────────────────────────────────────────────────

describe("Round-trip: PUT then GET verifies persistence (criteria 2 & 4)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("[DB] org defaults: PUT contracts='view' → GET returns contracts='view'", () => {
    const orgId = createTestOrg("Roundtrip Org Defaults", "roundtrip-org-defaults");

    dbModule.setOrgPermissionDefault(orgId, "contracts", "view");

    const defaults = dbModule.getOrgPermissionDefaults(orgId);
    const contractsEntry = defaults.find((d: any) => d.resource === "contracts");
    expect(contractsEntry).toBeDefined();
    expect(contractsEntry.action).toBe("view");
  });

  it("[DB] member permissions: PUT legal_hub='edit' → GET returns legal_hub='edit'", () => {
    const orgId = createTestOrg("Roundtrip Member Perms", "roundtrip-member-perms");
    const userId = createTestUser("roundtrip-member@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    dbModule.setMemberPermission(orgId, userId, "legal_hub", "edit");

    const perms = dbModule.getMemberPermissions(orgId, userId);
    const legalHub = perms.find((p: any) => p.resource === "legal_hub");
    expect(legalHub).toBeDefined();
    expect(legalHub.action).toBe("edit");
  });

  it("[DB] reset after PUT: GET returns org default value, not the overridden value", () => {
    const orgId = createTestOrg("Roundtrip Reset", "roundtrip-reset");
    const userId = createTestUser("roundtrip-reset@test.com");
    dbModule.addOrgMember(orgId, userId, "member", null);

    dbModule.setMemberPermission(orgId, userId, "policies", "none");
    dbModule.resetMemberPermissions(orgId, userId);

    const perms = dbModule.getMemberPermissions(orgId, userId);
    const policies = perms.find((p: any) => p.resource === "policies");
    expect(policies.action).toBe("full");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Validation edge cases — code inspection", () => {
  it("[code] org/permissions PUT: uses PERMISSION_RESOURCES.includes() check", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/org/permissions/route.ts"),
      "utf-8"
    );
    expect(content).toMatch(/PERMISSION_RESOURCES\.includes\(resource\)/);
    expect(content).toContain("Invalid resource");
  });

  it("[code] org/permissions PUT: uses VALID_ACTIONS.includes() check for action", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/org/permissions/route.ts"),
      "utf-8"
    );
    expect(content).toMatch(/VALID_ACTIONS\.includes\(action\)/);
    expect(content).toContain("Invalid action");
  });

  it("[code] members/[id]/permissions PUT: uses PERMISSION_RESOURCES.includes() check", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/org/members/[id]/permissions/route.ts"),
      "utf-8"
    );
    expect(content).toMatch(/PERMISSION_RESOURCES\.includes\(resource\)/);
    expect(content).toContain("Invalid resource");
  });

  it("[code] members/[id]/permissions PUT: uses VALID_ACTIONS.includes() check for action", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/org/members/[id]/permissions/route.ts"),
      "utf-8"
    );
    expect(content).toMatch(/VALID_ACTIONS\.includes\(action\)/);
    expect(content).toContain("Invalid action");
  });

  it("[code] org/permissions PUT: malformed JSON body returns 400 'Invalid JSON body'", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/org/permissions/route.ts"),
      "utf-8"
    );
    expect(content).toContain("Invalid JSON body");
    expect(content).toContain("status: 400");
  });

  it("[code] members/[id]/permissions PUT: malformed JSON body returns 400 'Invalid JSON body'", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/org/members/[id]/permissions/route.ts"),
      "utf-8"
    );
    expect(content).toContain("Invalid JSON body");
    expect(content).toContain("status: 400");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Correct imports and infrastructure patterns
// ─────────────────────────────────────────────────────────────────────────────

describe("Correct imports and infrastructure patterns — code inspection", () => {
  const routes = [
    { label: "org/permissions", path: "src/app/api/org/permissions/route.ts" },
    { label: "members/[id]/permissions", path: "src/app/api/org/members/[id]/permissions/route.ts" },
    { label: "members/[id]/permissions/reset", path: "src/app/api/org/members/[id]/permissions/reset/route.ts" },
  ];

  for (const { label, path: rel } of routes) {
    it(`${label}: imports auth from @/auth`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("@/auth");
      expect(content).toContain("auth");
    });

    it(`${label}: imports ensureDb from @/lib/server-utils`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("server-utils");
      expect(content).toContain("ensureDb");
    });

    it(`${label}: imports from @/lib/db-imports`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("db-imports");
    });

    it(`${label}: imports logAction from @/lib/audit-imports`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("audit-imports");
      expect(content).toContain("logAction");
    });

    it(`${label}: imports saveDb`, () => {
      const { readFileSync } = require("node:fs");
      const content: string = readFileSync(resolve(ROOT, rel), "utf-8");
      expect(content).toContain("saveDb");
    });
  }
});
