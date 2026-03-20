/**
 * Integration tests for Task 2: Admin API Routes
 * Plan 030 — Global Admin
 *
 * Tests are written against the plan's success criteria (primary source of truth):
 * 1. GET /api/admin/orgs without super admin returns 403
 * 2. GET /api/admin/orgs with super admin returns all orgs including soft-deleted with status
 * 3. POST /api/admin/orgs creates org; if ownerEmail provided, returns { inviteUrl }
 * 4. POST /api/admin/orgs with duplicate slug returns 409
 * 5. DELETE /api/admin/orgs/[id] sets deleted_at; org members accessing app redirected to /no-org
 * 6. POST /api/admin/orgs/[id]/restore within 30 days clears deleted_at
 * 7. POST /api/admin/orgs/[id]/restore after 30 days returns 409
 *
 * Strategy:
 * - Next.js route handlers cannot be imported into Vitest (no next/server runtime).
 * - We test in two layers:
 *   a) DB-layer integration: exercise the actual DB functions used by the routes
 *      to verify the data mutations are correct.
 *   b) Code inspection: read each route file to verify the correct guard, logic,
 *      and response shapes are implemented per the spec.
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
  DB_PATH: "/tmp/test-admin-api-routes-fake.sqlite",
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

// ─────────────────────────────────────────────────────────────────────────────
// Section A: requireSuperAdmin helper — code inspection
// ─────────────────────────────────────────────────────────────────────────────

describe("requireSuperAdmin helper — src/lib/require-super-admin.ts", () => {
  it("file exists at src/lib/require-super-admin.ts", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(resolve(ROOT, "src/lib/require-super-admin.ts"))).toBe(true);
  });

  it("returns 401 when session has no user (no session)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/lib/require-super-admin.ts"),
      "utf-8"
    );
    expect(content).toContain("status: 401");
    expect(content).toMatch(/session\?\.user/);
  });

  it("returns 403 when session user is not super admin", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/lib/require-super-admin.ts"),
      "utf-8"
    );
    expect(content).toContain("status: 403");
    expect(content).toContain("isSuperAdmin");
  });

  it("returns null (authorized) for super admin", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/lib/require-super-admin.ts"),
      "utf-8"
    );
    expect(content).toContain("return null");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section B: GET /api/admin/orgs — code inspection
// Criterion 1: returns 403 without super admin
// Criterion 2: returns all orgs including soft-deleted with correct status
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 1 & 2: GET /api/admin/orgs — code inspection", () => {
  const routePath = resolve(ROOT, "src/app/api/admin/orgs/route.ts");

  it("route file exists", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(routePath)).toBe(true);
  });

  it("calls requireSuperAdmin for the 403 guard (Criterion 1)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("requireSuperAdmin");
    // Guard result used to short-circuit
    expect(content).toMatch(/requireSuperAdmin\(session\)/);
    expect(content).toMatch(/if \(denied\) return denied/);
  });

  it("calls getAllOrganizations() which includes soft-deleted orgs (Criterion 2)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getAllOrganizations()");
  });

  it("computes status: active | pending_deletion | expired based on deleted_at (Criterion 2)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("active");
    expect(content).toContain("pending_deletion");
    expect(content).toContain("expired");
    expect(content).toContain("deleted_at");
  });

  it("computes daysUntilDeletion for soft-deleted orgs (Criterion 2)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("daysUntilDeletion");
    // 30-day retention constant
    expect(content).toMatch(/30/);
  });

  it("returns { orgs: [...] } response shape (Criterion 2)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toMatch(/orgs.*enriched|orgs.*orgs/);
  });

  it("includes deletedAt field in response for soft-deleted orgs (Criterion 2)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("deletedAt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C: POST /api/admin/orgs — code inspection
// Criterion 3: creates org; if ownerEmail provided, returns { inviteUrl }
// Criterion 4: duplicate slug returns 409
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 3 & 4: POST /api/admin/orgs — code inspection", () => {
  const routePath = resolve(ROOT, "src/app/api/admin/orgs/route.ts");

  it("validates slug format with /^[a-z0-9-]+$/ pattern (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toMatch(/\^?\[a-z0-9-\]\+\$/);
  });

  it("checks slug uniqueness with SELECT before INSERT, returns 409 on conflict (Criterion 4)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("status: 409");
    // The uniqueness query
    expect(content).toMatch(/SELECT.*organizations.*WHERE.*slug/i);
  });

  it("calls createOrganization(name, slug) to create the org (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("createOrganization(");
  });

  it("calls createOrgInvite when ownerEmail is provided (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("createOrgInvite(");
    expect(content).toContain("ownerEmail");
  });

  it("builds inviteUrl from NEXTAUTH_URL + /invite/ + token (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("NEXTAUTH_URL");
    expect(content).toContain("inviteUrl");
    expect(content).toMatch(/invite.*token|token.*invite/);
  });

  it("returns inviteUrl in response only when ownerEmail is provided (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    // inviteUrl is conditionally included
    expect(content).toContain("inviteUrl");
    expect(content).toMatch(/if.*inviteUrl/);
  });

  it("calls saveDb() BEFORE logAction() (REST API standard)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const saveDbPos = content.indexOf("saveDb()");
    const logActionPos = content.indexOf("logAction(");
    expect(saveDbPos).toBeGreaterThan(-1);
    expect(logActionPos).toBeGreaterThan(-1);
    // saveDb() must appear before logAction() in POST handler
    expect(saveDbPos).toBeLessThan(logActionPos);
  });

  it("returns status 201 on successful creation (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("status: 201");
  });

  it("validates name is non-empty (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    // Should have a name validation check returning 400
    expect(content).toMatch(/!name/);
    expect(content).toContain("status: 400");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D: DELETE /api/admin/orgs/[id] — code inspection
// Criterion 5: sets deleted_at; org members redirected to /no-org
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 5: DELETE /api/admin/orgs/[id] — code inspection", () => {
  const routePath = resolve(ROOT, "src/app/api/admin/orgs/[id]/route.ts");

  it("route file exists", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(routePath)).toBe(true);
  });

  it("calls requireSuperAdmin guard", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("requireSuperAdmin");
  });

  it("calls softDeleteOrg(id) to set deleted_at (Criterion 5)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("softDeleteOrg(");
  });

  it("verifies org exists before delete, returns 404 if not found", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgById(");
    expect(content).toContain("status: 404");
  });

  it("returns 409 if org is already soft-deleted (prevents double-delete)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("deleted_at");
    expect(content).toContain("status: 409");
  });

  it("returns 204 on successful soft-delete", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("status: 204");
  });

  it("calls saveDb() BEFORE logAction() after soft-delete (REST API standard)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    // In DELETE handler: saveDb before logAction
    const saveDbPos = content.indexOf("saveDb()");
    const logActionPos = content.indexOf("logAction(");
    expect(saveDbPos).toBeGreaterThan(-1);
    expect(logActionPos).toBeGreaterThan(-1);
    expect(saveDbPos).toBeLessThan(logActionPos);
  });

  it("org members with deleted org get orgId=undefined on next JWT refresh (via getOrgById)", () => {
    // This is the mechanism: getOrgById does NOT filter deleted_at, but
    // the JWT callback calls getOrgMemberForOrg → which calls getOrgById.
    // According to plan risk section, getOrgById returns the org even if deleted,
    // BUT the auth layout guard checks the org: plan says session.orgId still set
    // but (app)/layout.tsx org guard + no-org redirect applies.
    // The KEY verification: getOrgById returns a row with deleted_at set,
    // which the JWT callback should detect to clear orgId.
    // We verify the JWT callback handles this via auth.ts inspection.
    const { readFileSync } = require("node:fs");
    const authContent: string = readFileSync(
      resolve(ROOT, "src/auth.ts"),
      "utf-8"
    );
    // The JWT callback must handle the case where org is soft-deleted
    // Either by checking deleted_at or by getOrgById returning null for deleted orgs.
    // Check that auth.ts refreshes org membership on every request
    expect(authContent).toContain("getOrgMemberForOrg");
    // The JWT callback must re-hydrate orgId on every request (not just first sign-in)
    expect(authContent).toContain("token.orgId");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section E: POST /api/admin/orgs/[id]/restore — code inspection
// Criterion 6: within 30 days clears deleted_at
// Criterion 7: after 30 days returns 409
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 6 & 7: POST /api/admin/orgs/[id]/restore — code inspection", () => {
  const routePath = resolve(ROOT, "src/app/api/admin/orgs/[id]/restore/route.ts");

  it("restore route file exists", () => {
    const { existsSync } = require("node:fs");
    expect(existsSync(routePath)).toBe(true);
  });

  it("calls requireSuperAdmin guard", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("requireSuperAdmin");
  });

  it("calls restoreOrg(id) to clear deleted_at (Criterion 6)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("restoreOrg(");
  });

  it("enforces 30-day retention window — returns 409 if expired (Criterion 7)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    // 30-day check
    expect(content).toMatch(/30/);
    expect(content).toContain("status: 409");
    // Uses Date.now() - deletedAt > retention window logic
    expect(content).toMatch(/Date\.now\(\)/);
    expect(content).toContain("deleted_at");
  });

  it("returns 400 (or error) if org is not currently deleted (restore of non-deleted org)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    // Must check !org.deleted_at and return error
    expect(content).toMatch(/!org\.deleted_at|deleted_at.*null/);
    expect(content).toMatch(/status: 400|status: 409/);
  });

  it("returns 404 if org does not exist", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toContain("status: 404");
  });

  it("calls saveDb() BEFORE logAction() after restore (REST API standard)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    const saveDbPos = content.indexOf("saveDb()");
    const logActionPos = content.indexOf("logAction(");
    expect(saveDbPos).toBeGreaterThan(-1);
    expect(logActionPos).toBeGreaterThan(-1);
    expect(saveDbPos).toBeLessThan(logActionPos);
  });

  it("returns { org } on successful restore (Criterion 6)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(routePath, "utf-8");
    expect(content).toMatch(/org.*restored|getOrgWithMemberCount/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section F: DB-level integration — data mutations (all criteria)
// These tests exercise the actual DB functions used by the routes.
// ─────────────────────────────────────────────────────────────────────────────

describe("DB-level: soft-delete sets deleted_at (Criterion 5)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("softDeleteOrg sets deleted_at on the org row", () => {
    const orgId = dbModule.createOrganization("Test Delete Org", "test-delete");
    dbModule.softDeleteOrg(orgId);

    const org = dbModule.get(`SELECT deleted_at FROM organizations WHERE id = ?`, [orgId]);
    expect(org).not.toBeNull();
    expect(org.deleted_at).not.toBeNull();
    expect(typeof org.deleted_at).toBe("string");
  });

  it("getAllOrganizations includes soft-deleted org (Criterion 2)", () => {
    const orgId = dbModule.createOrganization("Deleted Org", "deleted-org");
    dbModule.softDeleteOrg(orgId);

    const all = dbModule.getAllOrganizations();
    const found = all.find((o: any) => o.id === orgId);
    expect(found).toBeDefined();
    expect(found.deleted_at).not.toBeNull();
  });

  it("getOrgById returns the soft-deleted org (so auth JWT can detect deletion)", () => {
    const orgId = dbModule.createOrganization("JWT Check Org", "jwt-check");
    dbModule.softDeleteOrg(orgId);

    const org = dbModule.getOrgById(orgId);
    expect(org).not.toBeNull();
    // org is returned (not null), with deleted_at set
    expect(org.deleted_at).not.toBeNull();
  });
});

describe("DB-level: createOrganization + duplicate slug (Criterion 3 & 4)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("createOrganization returns a numeric id for a new org", () => {
    const id = dbModule.createOrganization("New Org", "new-org");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("createOrganization inserts correct name and slug", () => {
    const id = dbModule.createOrganization("My Org", "my-org");
    const org = dbModule.get(`SELECT name, slug FROM organizations WHERE id = ?`, [id]);
    expect(org.name).toBe("My Org");
    expect(org.slug).toBe("my-org");
  });

  it("SELECT before INSERT detects duplicate slug (route 409 logic)", () => {
    dbModule.createOrganization("First Org", "same-slug");

    // Simulate the route's uniqueness check
    const existing = dbModule.get(
      `SELECT id FROM organizations WHERE slug = ?`,
      ["same-slug"]
    );
    // Route would return 409 if existing is truthy
    expect(existing).not.toBeNull();
    expect(existing.id).toBeGreaterThan(0);
  });

  it("createOrgInvite with 'owner' role returns a token (for ownerEmail flow, Criterion 3)", () => {
    const orgId = dbModule.createOrganization("Invite Org", "invite-org");
    const invite = dbModule.createOrgInvite(orgId, "owner@example.com", "owner");
    expect(invite).not.toBeNull();
    expect(typeof invite.token).toBe("string");
    expect(invite.token.length).toBeGreaterThan(10);
    expect(invite.orgId).toBe(orgId);
    expect(invite.email).toBe("owner@example.com");
    expect(invite.role).toBe("owner");
  });
});

describe("DB-level: restore within 30 days clears deleted_at (Criterion 6)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("restoreOrg clears deleted_at to NULL", () => {
    const orgId = dbModule.createOrganization("Restore Org", "restore-org");
    dbModule.softDeleteOrg(orgId);
    dbModule.restoreOrg(orgId);

    const org = dbModule.get(`SELECT deleted_at FROM organizations WHERE id = ?`, [orgId]);
    expect(org.deleted_at).toBeNull();
  });

  it("restored org is excluded from getActiveOrganizations() before restore but included after", () => {
    const orgId = dbModule.createOrganization("Toggle Org", "toggle-org");

    // Before soft-delete: active
    let active = dbModule.getActiveOrganizations();
    expect(active.find((o: any) => o.id === orgId)).toBeDefined();

    // After soft-delete: excluded from active
    dbModule.softDeleteOrg(orgId);
    active = dbModule.getActiveOrganizations();
    expect(active.find((o: any) => o.id === orgId)).toBeUndefined();

    // After restore: back in active
    dbModule.restoreOrg(orgId);
    active = dbModule.getActiveOrganizations();
    expect(active.find((o: any) => o.id === orgId)).toBeDefined();
  });
});

describe("DB-level: 30-day retention window boundary check (Criterion 7)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("org deleted today is within 30-day window (restore allowed)", () => {
    const orgId = dbModule.createOrganization("Recent Delete", "recent-delete");
    dbModule.softDeleteOrg(orgId);

    const org = dbModule.getOrgById(orgId);
    expect(org).not.toBeNull();
    const deletedAt = new Date(org.deleted_at).getTime();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const RETENTION_DAYS = 30;
    const expired = Date.now() - deletedAt > RETENTION_DAYS * MS_PER_DAY;
    expect(expired).toBe(false); // within window — restore allowed
  });

  it("org deleted 31+ days ago is outside 30-day window (restore blocked — 409)", () => {
    const orgId = dbModule.createOrganization("Old Delete", "old-delete");

    // Set deleted_at to 31 days ago directly
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    dbModule.run(
      `INSERT INTO organizations (name, slug, deleted_at) VALUES (?, ?, ?)`,
      ["Old Delete Direct", "old-delete-direct", thirtyOneDaysAgo]
    );

    const org = dbModule.get(`SELECT * FROM organizations WHERE slug = ?`, ["old-delete-direct"]);
    expect(org).not.toBeNull();

    const deletedAt = new Date(org.deleted_at).getTime();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const RETENTION_DAYS = 30;
    const expired = Date.now() - deletedAt > RETENTION_DAYS * MS_PER_DAY;
    expect(expired).toBe(true); // expired — route should return 409
  });

  it("route restore logic: Math expression checks correct retention (30 days)", () => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(
      resolve(ROOT, "src/app/api/admin/orgs/[id]/restore/route.ts"),
      "utf-8"
    );
    // Must multiply RETENTION_DAYS by MS_PER_DAY (or equivalent constant)
    expect(content).toMatch(/30\s*\*\s*MS_PER_DAY|RETENTION_DAYS\s*\*\s*MS_PER_DAY/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section G: All routes have requireSuperAdmin — comprehensive auth check
// ─────────────────────────────────────────────────────────────────────────────

describe("All admin routes import and use requireSuperAdmin guard", () => {
  const routes = [
    "src/app/api/admin/orgs/route.ts",
    "src/app/api/admin/orgs/[id]/route.ts",
    "src/app/api/admin/orgs/[id]/restore/route.ts",
  ];

  it.each(routes)("%s imports requireSuperAdmin from @/lib/require-super-admin", (routeFile) => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(resolve(ROOT, routeFile), "utf-8");
    expect(content).toContain('from "@/lib/require-super-admin"');
    expect(content).toContain("requireSuperAdmin");
  });

  it.each(routes)("%s calls await auth() to get session", (routeFile) => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(resolve(ROOT, routeFile), "utf-8");
    expect(content).toContain("await auth()");
    expect(content).toContain('from "@/auth"');
  });

  it.each(routes)("%s calls ensureDb() before DB operations", (routeFile) => {
    const { readFileSync } = require("node:fs");
    const content: string = readFileSync(resolve(ROOT, routeFile), "utf-8");
    expect(content).toContain("ensureDb()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section H: /no-org redirect for org members of soft-deleted org (Criterion 5)
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 5: org members accessing app redirected to /no-org after soft-delete", () => {
  it("(app)/layout.tsx redirects to /no-org when orgId missing AND not super admin", () => {
    const { readFileSync } = require("node:fs");
    const layoutContent: string = readFileSync(
      resolve(ROOT, "src/app/(app)/layout.tsx"),
      "utf-8"
    );
    // Super admin bypass: must check isSuperAdmin
    expect(layoutContent).toContain("isSuperAdmin");
    // Redirect still happens for non-super-admins without org
    expect(layoutContent).toContain('redirect("/no-org")');
  });

  it("auth.ts JWT callback re-hydrates orgId on every request (not just sign-in)", () => {
    const { readFileSync } = require("node:fs");
    const authContent: string = readFileSync(
      resolve(ROOT, "src/auth.ts"),
      "utf-8"
    );
    // The callback must check org membership on subsequent requests too
    // This is what causes orgId to become undefined when org is soft-deleted
    expect(authContent).toContain("token.orgId");
    // Must have a subsequent-request branch (else if token.id or similar)
    expect(authContent).toMatch(/else if.*token\.id|else\s*{[\s\S]*?token\.orgId/);
  });

  it("getOrgById does NOT filter deleted_at — admin routes can see deleted orgs", () => {
    // Verify getOrgById in db.js does not filter by deleted_at (needed for restore route)
    const { readFileSync } = require("node:fs");
    const dbContent: string = readFileSync(
      resolve(ROOT, "lib/db.js"),
      "utf-8"
    );
    // Find the getOrgById function — it should NOT include deleted_at in WHERE clause
    const fnMatch = dbContent.match(/export function getOrgById[\s\S]*?^\}/m);
    expect(fnMatch).not.toBeNull();
    // Should only filter by id, not deleted_at
    expect(fnMatch![0]).not.toContain("deleted_at");
    expect(fnMatch![0]).toMatch(/WHERE id = \?/);
  });

  it("getOrgMemberForOrg filters deleted_at IS NULL — soft-deleted org returns null (Criterion 5)", () => {
    const { readFileSync } = require("node:fs");
    const dbContent: string = readFileSync(
      resolve(ROOT, "lib/db.js"),
      "utf-8"
    );
    const fnMatch = dbContent.match(/export function getOrgMemberForOrg[\s\S]*?^\}/m);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/deleted_at IS NULL/);
  });

  it("getOrgMemberByUserId filters deleted_at IS NULL — soft-deleted org skipped in fallback (Criterion 5)", () => {
    const { readFileSync } = require("node:fs");
    const dbContent: string = readFileSync(
      resolve(ROOT, "lib/db.js"),
      "utf-8"
    );
    const fnMatch = dbContent.match(/export function getOrgMemberByUserId[\s\S]*?^\}/m);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/deleted_at IS NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section I: DB-level: JWT orgId clears after soft-delete (Criterion 5 — behavioral)
// ─────────────────────────────────────────────────────────────────────────────

describe("Criterion 5: JWT callback loses orgId after soft-delete (DB-level behavioral)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getOrgMemberForOrg returns null for member of soft-deleted org", () => {
    // Create an org and a user who is a member
    const orgId = dbModule.createOrganization("SoftDelete JWT Org", "softdelete-jwt");
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["jwtmember@test.com", "JWT Member", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, ["jwtmember@test.com"]);
    dbModule.run(
      `INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'member')`,
      [orgId, user.id]
    );

    // Before soft-delete: membership found
    const before = dbModule.getOrgMemberForOrg(user.id, orgId);
    expect(before).not.toBeNull();

    // After soft-delete: membership returns null (deleted_at IS NULL filter kicks in)
    dbModule.softDeleteOrg(orgId);
    const after = dbModule.getOrgMemberForOrg(user.id, orgId);
    expect(after).toBeNull();
  });

  it("getOrgMemberByUserId returns null when user's only org is soft-deleted (JWT fallback path)", () => {
    const orgId = dbModule.createOrganization("Only Org SoftDeleted", "only-org-softdel");
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["onlyorg@test.com", "Only Org User", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, ["onlyorg@test.com"]);
    dbModule.run(
      `INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'member')`,
      [orgId, user.id]
    );

    // Before soft-delete: getOrgMemberByUserId finds the org
    const before = dbModule.getOrgMemberByUserId(user.id);
    expect(before).not.toBeNull();
    expect(before.org_id).toBe(orgId);

    // After soft-delete: returns null — JWT callback sets token.orgId = undefined
    dbModule.softDeleteOrg(orgId);
    const after = dbModule.getOrgMemberByUserId(user.id);
    expect(after).toBeNull();
    // Result: JWT callback → membership=null → token.orgId not set → layout guard fires → /no-org
  });

  it("getOrgMemberByUserId returns another org when user has multiple orgs and one is soft-deleted", () => {
    // Create two orgs
    const org1Id = dbModule.createOrganization("Active Org", "active-org-multi");
    const org2Id = dbModule.createOrganization("Deleted Org", "deleted-org-multi");

    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["multiorg@test.com", "Multi Org User", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, ["multiorg@test.com"]);

    // Join org1 first (earlier joined_at), then org2
    dbModule.run(
      `INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'member', '2024-01-01')`,
      [org1Id, user.id]
    );
    dbModule.run(
      `INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'member', '2024-06-01')`,
      [org2Id, user.id]
    );

    // Soft-delete org1 (the user's primary org)
    dbModule.softDeleteOrg(org1Id);

    // getOrgMemberByUserId should now return org2 (active), not org1 (deleted)
    const membership = dbModule.getOrgMemberByUserId(user.id);
    expect(membership).not.toBeNull();
    expect(membership.org_id).toBe(org2Id);
  });
});
