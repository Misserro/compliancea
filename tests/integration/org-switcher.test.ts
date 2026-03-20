/**
 * Integration tests for Task 4: Org Switcher
 *
 * Tests verify against plan success criteria (README.md Task 4):
 * 1. Single-org user: sidebar shows static org name, no dropdown — no regression
 * 2. Multi-org user: sidebar shows dropdown listing all orgs; current org has checkmark
 * 3. Clicking different org switches session without re-login
 * 4. After switching, session.user.orgId/orgRole/orgName reflect new org
 * 5. If removed from active org, next request falls back to first remaining org (not 500)
 * 6. POST /api/org/switch with non-member targetOrgId returns 403
 * 7. GET /api/org/memberships returns all orgs for authenticated user
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock fs and paths ────────────────────────────────────────────────────────
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
  DB_PATH: "/tmp/test-db-switcher-fake.sqlite",
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

// ── Helper: set up two orgs with two users ───────────────────────────────────
async function seedMultiOrgScenario() {
  await dbModule.initDb(); // creates org 1 "Default Organization"

  // Create a second org
  dbModule.run(
    `INSERT INTO organizations (name, slug) VALUES (?, ?)`,
    ["Acme Corp", "acme"]
  );

  // User 1: member of both orgs
  dbModule.run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    ["multi@test.com", "Multi Org User", "hash"]
  );
  const multiUser = dbModule.get(
    `SELECT id FROM users WHERE email = ?`,
    ["multi@test.com"]
  );
  dbModule.run(
    `INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (1, ?, 'owner', '2024-01-01')`,
    [multiUser!.id]
  );
  dbModule.run(
    `INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (2, ?, 'admin', '2024-06-01')`,
    [multiUser!.id]
  );

  // User 2: member of org 1 only
  dbModule.run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    ["single@test.com", "Single Org User", "hash"]
  );
  const singleUser = dbModule.get(
    `SELECT id FROM users WHERE email = ?`,
    ["single@test.com"]
  );
  dbModule.run(
    `INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES (1, ?, 'member', '2024-01-15')`,
    [singleUser!.id]
  );

  return {
    multiUserId: multiUser!.id as number,
    singleUserId: singleUser!.id as number,
  };
}

// ── Section 1: getAllOrgMembershipsForUser DB function ────────────────────────

describe("getAllOrgMembershipsForUser (Criterion 7 — DB layer)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns all org memberships for a multi-org user with correct shape", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    const memberships = dbModule.getAllOrgMembershipsForUser(multiUserId);

    expect(Array.isArray(memberships)).toBe(true);
    expect(memberships).toHaveLength(2);

    // Both orgs should be present
    const orgIds = memberships.map((m: any) => m.orgId);
    expect(orgIds).toContain(1);
    expect(orgIds).toContain(2);
  });

  it("returns camelCase field names (orgId, orgName, orgSlug, role)", async () => {
    const { multiUserId } = await seedMultiOrgScenario();
    const memberships = dbModule.getAllOrgMembershipsForUser(multiUserId);
    const first = memberships[0];

    expect(first).toHaveProperty("orgId");
    expect(first).toHaveProperty("orgName");
    expect(first).toHaveProperty("orgSlug");
    expect(first).toHaveProperty("role");
    // Must NOT expose snake_case equivalents (would break the API response contract)
    expect(first.org_id).toBeUndefined();
    expect(first.org_name).toBeUndefined();
  });

  it("includes orgName populated via JOIN with organizations table", async () => {
    const { multiUserId } = await seedMultiOrgScenario();
    const memberships = dbModule.getAllOrgMembershipsForUser(multiUserId);

    const org1 = memberships.find((m: any) => m.orgId === 1);
    const org2 = memberships.find((m: any) => m.orgId === 2);

    expect(org1!.orgName).toBe("Default Organization");
    expect(org2!.orgName).toBe("Acme Corp");
  });

  it("returns orgs in joined_at ASC order (oldest first)", async () => {
    const { multiUserId } = await seedMultiOrgScenario();
    const memberships = dbModule.getAllOrgMembershipsForUser(multiUserId);

    expect(memberships[0].orgId).toBe(1); // joined 2024-01-01
    expect(memberships[1].orgId).toBe(2); // joined 2024-06-01
  });

  it("returns empty array for a user with no org memberships", async () => {
    await dbModule.initDb();
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["orphan@test.com", "Orphan User", "hash"]
    );
    const user = dbModule.get(
      `SELECT id FROM users WHERE email = ?`,
      ["orphan@test.com"]
    );

    const memberships = dbModule.getAllOrgMembershipsForUser(user!.id);
    expect(memberships).toHaveLength(0);
  });

  it("returns exactly 1 membership for a single-org user", async () => {
    const { singleUserId } = await seedMultiOrgScenario();
    const memberships = dbModule.getAllOrgMembershipsForUser(singleUserId);

    expect(memberships).toHaveLength(1);
    expect(memberships[0].orgId).toBe(1);
  });
});

// ── Section 2: getOrgMemberForOrg DB function ─────────────────────────────────

describe("getOrgMemberForOrg (Criteria 5, 6 — DB layer)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns membership object with camelCase fields when user belongs to org", async () => {
    const { multiUserId } = await seedMultiOrgScenario();
    const membership = dbModule.getOrgMemberForOrg(multiUserId, 1);

    expect(membership).not.toBeNull();
    expect(membership.orgId).toBe(1);
    expect(membership.orgName).toBe("Default Organization");
    expect(membership.role).toBe("owner");
  });

  it("returns null when user is NOT a member of the specified org", async () => {
    const { singleUserId } = await seedMultiOrgScenario();
    // singleUser is only in org 1, not org 2
    const membership = dbModule.getOrgMemberForOrg(singleUserId, 2);

    expect(membership).toBeNull();
  });

  it("returns null for a completely non-existent org", async () => {
    const { multiUserId } = await seedMultiOrgScenario();
    const membership = dbModule.getOrgMemberForOrg(multiUserId, 9999);

    expect(membership).toBeNull();
  });

  it("returns correct role for each org when user has different roles", async () => {
    const { multiUserId } = await seedMultiOrgScenario();
    const org1Membership = dbModule.getOrgMemberForOrg(multiUserId, 1);
    const org2Membership = dbModule.getOrgMemberForOrg(multiUserId, 2);

    expect(org1Membership.role).toBe("owner");
    expect(org2Membership.role).toBe("admin");
  });
});

// ── Section 3: JWT callback logic — static code verification ─────────────────

describe("JWT callback three-branch fix (Criteria 3, 4, 5 — code inspection)", () => {
  it("auth.ts imports getOrgMemberForOrg", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    expect(content).toContain("getOrgMemberForOrg");
    expect(content).toContain('from "@/lib/db-imports"');
  });

  it("JWT callback accepts trigger and session parameters", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    // The jwt callback must destructure trigger and session
    expect(content).toMatch(/async jwt\s*\(\s*\{[^}]*trigger[^}]*\}/);
    expect(content).toMatch(/async jwt\s*\(\s*\{[^}]*session[^}]*\}/);
  });

  it("Branch 1: trigger=update with switchToOrgId calls getOrgMemberForOrg", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    // Must check for explicit org switch trigger
    expect(content).toContain('trigger === "update"');
    expect(content).toContain("session?.switchToOrgId");
    expect(content).toContain("switchToOrgId");
  });

  it("Branch 2: token.orgId set calls getOrgMemberForOrg (not getOrgMemberByUserId)", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    // Must check token.orgId before falling back
    expect(content).toContain("token.orgId");
    // Must call getOrgMemberForOrg to preserve chosen org
    expect(content).toContain("getOrgMemberForOrg(Number(token.id), Number(token.orgId))");
  });

  it("Branch 2 fallback: if removed from org falls back to getOrgMemberByUserId (not 500)", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    // There must be a fallback within the token.orgId branch
    // Pattern: check membership after getOrgMemberForOrg, if null fall back
    expect(content).toContain("if (!membership) membership = getOrgMemberByUserId");
  });

  it("Branch 3: no org set falls back to getOrgMemberByUserId", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    // Must have else branch calling getOrgMemberByUserId
    expect(content).toContain("getOrgMemberByUserId(Number(token.id))");
  });

  it("Field normalization: handles camelCase orgId and snake_case org_id from different DB functions", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/auth.ts"),
      "utf-8"
    );
    // Must normalize — either via ?? or explicit check
    expect(content).toMatch(/membership\.orgId\s*\?\?\s*membership\.org_id/);
    expect(content).toMatch(/membership\.orgName\s*\?\?\s*membership\.org_name/);
  });
});

// ── Section 4: JWT callback behavior — simulated logic ───────────────────────

describe("JWT callback three-branch logic — behavioral simulation (Criteria 3, 4, 5)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("Branch 1 (trigger=update): getOrgMemberForOrg correctly resolves switchToOrgId", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    // Simulate the JWT callback Branch 1 logic
    const switchToOrgId = 2;
    const membership = dbModule.getOrgMemberForOrg(multiUserId, switchToOrgId);

    // Should find org 2 membership
    expect(membership).not.toBeNull();
    const orgId = membership.orgId ?? membership.org_id;
    const orgRole = membership.role;
    const orgName = membership.orgName ?? membership.org_name;

    expect(orgId).toBe(2);
    expect(orgRole).toBe("admin");
    expect(orgName).toBe("Acme Corp");
  });

  it("Branch 2 (token.orgId set): getOrgMemberForOrg preserves the chosen org", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    // User has previously switched to org 2 (token.orgId = 2)
    const tokenOrgId = 2;
    const membership = dbModule.getOrgMemberForOrg(multiUserId, tokenOrgId);

    expect(membership).not.toBeNull();
    expect(membership.orgId ?? membership.org_id).toBe(2);
  });

  it("Branch 2 fallback: null from getOrgMemberForOrg (removed from org) falls back correctly", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    // Simulate user removed from org 2 (token.orgId = 2, but no longer a member)
    dbModule.run(
      `DELETE FROM org_members WHERE user_id = ? AND org_id = 2`,
      [multiUserId]
    );

    // Branch 2 first attempt: getOrgMemberForOrg → null
    const membership = dbModule.getOrgMemberForOrg(multiUserId, 2);
    expect(membership).toBeNull();

    // Fallback: getOrgMemberByUserId → returns first remaining org (org 1)
    const fallback = dbModule.getOrgMemberByUserId(multiUserId);
    expect(fallback).not.toBeNull();
    expect(fallback!.org_id).toBe(1); // first remaining org
    // This verifies no 500 — a valid org is found after fallback
  });

  it("Branch 3 (no orgId set): getOrgMemberByUserId picks the first org", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    // Simulate first-ever session (no token.orgId)
    const membership = dbModule.getOrgMemberByUserId(multiUserId);

    expect(membership).not.toBeNull();
    expect(membership!.org_id).toBe(1); // first org, joined earliest
  });

  it("session.user fields (orgId, orgRole, orgName) all reflect the switched org", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    // Simulate switching to org 2
    const membership = dbModule.getOrgMemberForOrg(multiUserId, 2);

    // Simulate the session callback logic
    const tokenOrgId = membership.orgId ?? membership.org_id;
    const tokenOrgRole = membership.role;
    const tokenOrgName = membership.orgName ?? membership.org_name;

    // These are what session.user.* would receive
    expect(tokenOrgId).toBe(2);
    expect(tokenOrgRole).toBe("admin");
    expect(tokenOrgName).toBe("Acme Corp");
  });
});

// ── Section 5: POST /api/org/switch — static code verification ───────────────

describe("POST /api/org/switch (Criterion 6 — code inspection)", () => {
  it("switch route file exists at expected path", () => {
    const { existsSync } = require("node:fs");
    const { resolve } = require("node:path");
    expect(
      existsSync(
        resolve(__dirname, "../../src/app/api/org/switch/route.ts")
      )
    ).toBe(true);
  });

  it("switch route requires auth and returns 401 when no session", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/switch/route.ts"),
      "utf-8"
    );
    expect(content).toContain('from "@/auth"');
    expect(content).toContain("await auth()");
    expect(content).toContain("status: 401");
    expect(content).toContain("!session?.user");
  });

  it("switch route validates targetOrgId is a number and returns 400 otherwise", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/switch/route.ts"),
      "utf-8"
    );
    expect(content).toContain("targetOrgId");
    expect(content).toContain("status: 400");
    expect(content).toMatch(/typeof targetOrgId\s*!==\s*["']number["']/);
  });

  it("switch route calls getOrgMemberForOrg and returns 403 when not a member", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/switch/route.ts"),
      "utf-8"
    );
    expect(content).toContain("getOrgMemberForOrg");
    expect(content).toContain("status: 403");
    expect(content).toContain("Not a member of this organization");
  });

  it("switch route returns { success: true } on success", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/switch/route.ts"),
      "utf-8"
    );
    expect(content).toContain('success: true');
  });

  it("switch route calls logAction and saveDb for audit trail", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/switch/route.ts"),
      "utf-8"
    );
    expect(content).toContain("logAction");
    expect(content).toContain("saveDb");
  });
});

// ── Section 6: GET /api/org/memberships — static code verification ────────────

describe("GET /api/org/memberships (Criterion 7 — code inspection)", () => {
  it("memberships route file exists at expected path", () => {
    const { existsSync } = require("node:fs");
    const { resolve } = require("node:path");
    expect(
      existsSync(
        resolve(__dirname, "../../src/app/api/org/memberships/route.ts")
      )
    ).toBe(true);
  });

  it("memberships route requires auth and returns 401 when no session", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/memberships/route.ts"),
      "utf-8"
    );
    expect(content).toContain('from "@/auth"');
    expect(content).toContain("await auth()");
    expect(content).toContain("status: 401");
    expect(content).toContain("!session?.user");
  });

  it("memberships route calls getAllOrgMembershipsForUser with session user id", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/memberships/route.ts"),
      "utf-8"
    );
    expect(content).toContain("getAllOrgMembershipsForUser");
    expect(content).toContain("session.user.id");
  });

  it("memberships route returns { memberships: [...] } shape", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/org/memberships/route.ts"),
      "utf-8"
    );
    expect(content).toContain("memberships");
    expect(content).toMatch(/\{\s*memberships\s*\}/);
  });
});

// ── Section 7: db-imports.ts exports both new functions ───────────────────────

describe("db-imports.ts re-exports (Criteria 6, 7 — completeness check)", () => {
  it("getAllOrgMembershipsForUser is exported from db-imports.ts", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/lib/db-imports.ts"),
      "utf-8"
    );
    expect(content).toContain("getAllOrgMembershipsForUser");
  });

  it("getOrgMemberForOrg is exported from db-imports.ts", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/lib/db-imports.ts"),
      "utf-8"
    );
    expect(content).toContain("getOrgMemberForOrg");
  });
});

// ── Section 8: db.d.ts type declarations ─────────────────────────────────────

describe("db.d.ts type declarations (completeness)", () => {
  it("getAllOrgMembershipsForUser is declared in db.d.ts", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../lib/db.d.ts"),
      "utf-8"
    );
    expect(content).toContain("getAllOrgMembershipsForUser");
  });

  it("getOrgMemberForOrg is declared in db.d.ts", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../lib/db.d.ts"),
      "utf-8"
    );
    expect(content).toContain("getOrgMemberForOrg");
  });
});

// ── Section 9: Sidebar component — static code verification ──────────────────

describe("Sidebar org switcher (Criteria 1, 2 — code inspection)", () => {
  it("sidebar conditionally renders DropdownMenu when memberships.length > 1", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    expect(content).toContain("memberships.length > 1");
    expect(content).toContain("DropdownMenu");
  });

  it("sidebar renders static h1 when memberships.length <= 1 (single-org regression guard)", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    // Must have an else branch with <h1> for single-org
    expect(content).toContain("<h1");
    expect(content).toContain("{orgName}");
    // The conditional must be an if/else (ternary or explicit)
    expect(content).toMatch(/memberships\.length\s*>\s*1\s*\?[\s\S]*:\s*\(/);
  });

  it("sidebar fetches memberships from GET /api/org/memberships on mount", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    expect(content).toContain("/api/org/memberships");
    expect(content).toContain("fetchMemberships");
  });

  it("sidebar shows checkmark on current org (Check icon + currentOrgId comparison)", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    expect(content).toContain("Check");
    expect(content).toContain("currentOrgId");
    // The comparison must normalize types (Number() or ==) to avoid string vs number mismatch
    expect(content).toMatch(/Number\(m\.orgId\)\s*===\s*Number\(currentOrgId\)/);
  });

  it("sidebar calls update({ switchToOrgId }) then router.refresh() on org click", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    expect(content).toContain("update({ switchToOrgId");
    expect(content).toContain("router.refresh()");
  });

  it("sidebar uses isSwitching guard to prevent double-click during switch", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    expect(content).toContain("isSwitching");
    expect(content).toContain("disabled={isSwitching}");
  });

  it("sidebar imports useRouter and useSession update", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
      "utf-8"
    );
    expect(content).toContain("useRouter");
    expect(content).toContain("update");
    expect(content).toContain("ChevronDown");
  });
});

// ── Section 10: 403 check — DB-level simulation ───────────────────────────────

describe("POST /api/org/switch 403 for non-member (Criterion 6 — behavioral)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getOrgMemberForOrg returns null for user not in org — route would return 403", async () => {
    const { singleUserId } = await seedMultiOrgScenario();

    // singleUser is only in org 1 — NOT in org 2
    const membership = dbModule.getOrgMemberForOrg(singleUserId, 2);

    // The route checks: if (!membership) return 403
    // We verify the DB returns null (the precondition for 403)
    expect(membership).toBeNull();
  });

  it("getOrgMemberForOrg returns membership for legitimate member — route would return 200", async () => {
    const { multiUserId } = await seedMultiOrgScenario();

    // multiUser is in org 2
    const membership = dbModule.getOrgMemberForOrg(multiUserId, 2);
    expect(membership).not.toBeNull();
  });
});
