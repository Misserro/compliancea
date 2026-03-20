/**
 * Integration tests for Task 1 (Plan 028): Invite DB Layer and API Routes
 *
 * Tests verify against the plan's success criteria:
 * 1. POST /api/org/invites with owner session returns { token, inviteUrl, email, role, expiresAt } status 201
 * 2. POST with same email a second time revokes old token first (only one pending invite per email per org)
 * 3. POST with member session returns 403
 * 4. GET /api/org/invites returns only pending (non-accepted, non-expired) invites
 * 5. DELETE /api/org/invites/[token] removes invite; subsequent GET /api/invites/[token] returns valid:false reason:not_found
 * 6. GET /api/invites/[token] requires no auth (middleware exclusion)
 * 7. Expired or accepted tokens return valid:false with correct reason
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
  DB_PATH: "/tmp/test-db-invites-fake.sqlite",
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

// ── Section 1: DB Layer — createOrgInvite ─────────────────────────────────────

describe("DB Layer — createOrgInvite (Criterion 1 & 2)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("createOrgInvite returns { token, orgId, email, role, expiresAt }", () => {
    const result = dbModule.createOrgInvite(1, "user@example.com", "member");
    expect(result).not.toBeNull();
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(10);
    expect(result.orgId).toBe(1);
    expect(result.email).toBe("user@example.com");
    expect(result.role).toBe("member");
    expect(result.expiresAt).toBeDefined();
  });

  it("token is unique on each call", () => {
    const r1 = dbModule.createOrgInvite(1, "a@test.com", "member");
    const r2 = dbModule.createOrgInvite(1, "b@test.com", "member");
    expect(r1.token).not.toBe(r2.token);
  });

  it("expiresAt is approximately 7 days in the future", () => {
    const before = Date.now();
    const result = dbModule.createOrgInvite(1, "exp@test.com", "admin");
    const after = Date.now();
    const expiresMs = new Date(result.expiresAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // Allow 5 seconds tolerance
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 5000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 5000);
  });

  it("invite row is persisted to org_invites table", () => {
    const result = dbModule.createOrgInvite(1, "persist@test.com", "member");
    const row = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [result.token]
    );
    expect(row).not.toBeNull();
    expect(row.email).toBe("persist@test.com");
    expect(row.org_id).toBe(1);
    expect(row.role).toBe("member");
    expect(row.accepted_at).toBeNull();
  });

  it("second invite for same email+org revokes the previous pending token (Criterion 2)", () => {
    const first = dbModule.createOrgInvite(1, "dup@test.com", "member");
    const second = dbModule.createOrgInvite(1, "dup@test.com", "admin");

    // First token should be gone (revoked/deleted)
    const firstRow = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [first.token]
    );
    expect(firstRow).toBeNull();

    // Second token should exist
    const secondRow = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [second.token]
    );
    expect(secondRow).not.toBeNull();
    expect(secondRow.email).toBe("dup@test.com");
  });

  it("second invite for same email in a DIFFERENT org does NOT revoke the first org's token", () => {
    // Create second org
    dbModule.run(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, [
      "Second Org",
      "second",
    ]);
    const first = dbModule.createOrgInvite(1, "crossorg@test.com", "member");
    const second = dbModule.createOrgInvite(2, "crossorg@test.com", "member");

    // First token (org 1) should still exist
    const firstRow = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [first.token]
    );
    expect(firstRow).not.toBeNull();

    // Second token (org 2) should also exist
    const secondRow = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [second.token]
    );
    expect(secondRow).not.toBeNull();
  });
});

// ── Section 2: DB Layer — getOrgInviteByToken ─────────────────────────────────

describe("DB Layer — getOrgInviteByToken", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns the invite with orgName via JOIN on valid token", () => {
    const created = dbModule.createOrgInvite(1, "gettest@test.com", "admin");
    const result = dbModule.getOrgInviteByToken(created.token);
    expect(result).not.toBeNull();
    expect(result.token).toBe(created.token);
    expect(result.orgId).toBe(1);
    expect(result.orgName).toBe("Default Organization");
    expect(result.email).toBe("gettest@test.com");
    expect(result.role).toBe("admin");
    expect(result.expiresAt).toBeDefined();
    expect(result.acceptedAt).toBeNull();
  });

  it("returns null for a non-existent token", () => {
    const result = dbModule.getOrgInviteByToken("nonexistent-token-xyz");
    expect(result).toBeNull();
  });
});

// ── Section 3: DB Layer — listOrgInvites ─────────────────────────────────────

describe("DB Layer — listOrgInvites (Criterion 4)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns pending invites only (not accepted)", () => {
    // Create a pending invite
    dbModule.createOrgInvite(1, "pending@test.com", "member");

    const list = dbModule.listOrgInvites(1);
    const pendingEntry = list.find((i: any) => i.email === "pending@test.com");
    expect(pendingEntry).toBeDefined();
  });

  it("does NOT include already-accepted invites", () => {
    const created = dbModule.createOrgInvite(1, "accepted@test.com", "member");
    // Accept it
    dbModule.acceptOrgInvite(created.token);

    const list = dbModule.listOrgInvites(1);
    const found = list.find((i: any) => i.email === "accepted@test.com");
    expect(found).toBeUndefined();
  });

  it("does NOT include expired invites (expires_at < NOW) — day-boundary expiry", () => {
    // Insert an already-expired invite using SQLite datetime arithmetic to ensure
    // it is stored in the same format as datetime('now') comparison
    const expiredToken = "expired-token-test-123";
    dbModule.run(
      `INSERT INTO org_invites (token, org_id, email, role, expires_at)
       VALUES (?, 1, ?, 'member', datetime('now', '-1 day'))`,
      [expiredToken, "expired@test.com"]
    );

    const list = dbModule.listOrgInvites(1);
    const found = list.find((i: any) => i.email === "expired@test.com");
    expect(found).toBeUndefined();
  });

  it("does NOT include recently-expired invites (expired within same day — ISO format edge case)", () => {
    // Critical edge case: createOrgInvite stores expiresAt in ISO format
    // (e.g. '2026-03-20T10:00:00.000Z') but SQLite's datetime('now') returns
    // '2026-03-20 11:48:00'. The 'T' character (ASCII 84) is > ' ' (ASCII 32),
    // so ISO-format past dates on the same day compare as GREATER THAN datetime('now').
    // This means listOrgInvites would incorrectly show same-day-expired invites.
    // Store an expired invite using ISO format (same as createOrgInvite does)
    const expiredToken = "expired-iso-token-test-456";
    // 2 hours ago in ISO format
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    dbModule.run(
      `INSERT INTO org_invites (token, org_id, email, role, expires_at)
       VALUES (?, 1, ?, 'member', ?)`,
      [expiredToken, "expired-iso@test.com", twoHoursAgo]
    );

    const list = dbModule.listOrgInvites(1);
    const found = list.find((i: any) => i.email === "expired-iso@test.com");
    // This SHOULD be undefined — an expired invite must not appear in pending list
    expect(found).toBeUndefined();
  });

  it("returns { token, email, role, expiresAt } shape", () => {
    dbModule.createOrgInvite(1, "shape@test.com", "admin");
    const list = dbModule.listOrgInvites(1);
    const entry = list.find((i: any) => i.email === "shape@test.com");
    expect(entry).toBeDefined();
    expect(typeof entry.token).toBe("string");
    expect(entry.email).toBe("shape@test.com");
    expect(entry.role).toBe("admin");
    expect(entry.expiresAt).toBeDefined();
  });

  it("plan spec requires createdAt in listOrgInvites shape — verifying implementation compliance", () => {
    // Plan spec: listOrgInvites(orgId) → [{ token, email, role, expiresAt, createdAt }]
    // This test verifies the implementation returns createdAt as required by the spec.
    dbModule.createOrgInvite(1, "createdat@test.com", "member");
    const list = dbModule.listOrgInvites(1);
    const entry = list.find((i: any) => i.email === "createdat@test.com");
    expect(entry).toBeDefined();
    // The plan spec requires createdAt — if this fails, the implementation is missing it
    expect(entry.createdAt).toBeDefined();
  });

  it("only returns invites for the requested orgId (isolation)", () => {
    dbModule.run(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, [
      "Org Two",
      "org-two",
    ]);
    dbModule.createOrgInvite(1, "org1invite@test.com", "member");
    dbModule.createOrgInvite(2, "org2invite@test.com", "member");

    const org1List = dbModule.listOrgInvites(1);
    const org2List = dbModule.listOrgInvites(2);

    const org1Emails = org1List.map((i: any) => i.email);
    const org2Emails = org2List.map((i: any) => i.email);

    expect(org1Emails).toContain("org1invite@test.com");
    expect(org1Emails).not.toContain("org2invite@test.com");
    expect(org2Emails).toContain("org2invite@test.com");
    expect(org2Emails).not.toContain("org1invite@test.com");
  });
});

// ── Section 4: DB Layer — revokeOrgInvite ────────────────────────────────────

describe("DB Layer — revokeOrgInvite (Criterion 5)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("deletes the invite row; getOrgInviteByToken returns null after revoke", () => {
    const created = dbModule.createOrgInvite(1, "revoke@test.com", "member");
    dbModule.revokeOrgInvite(created.token);

    const result = dbModule.getOrgInviteByToken(created.token);
    expect(result).toBeNull();
  });

  it("token is removed from org_invites table after revoke", () => {
    const created = dbModule.createOrgInvite(1, "revoke2@test.com", "admin");
    dbModule.revokeOrgInvite(created.token);

    const row = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [created.token]
    );
    expect(row).toBeNull();
  });
});

// ── Section 5: DB Layer — acceptOrgInvite ────────────────────────────────────

describe("DB Layer — acceptOrgInvite (Criterion 7)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("marks accepted_at = CURRENT_TIMESTAMP on the invite row", () => {
    const created = dbModule.createOrgInvite(1, "accept@test.com", "member");
    dbModule.acceptOrgInvite(created.token);

    const row = dbModule.get(
      `SELECT * FROM org_invites WHERE token = ?`,
      [created.token]
    );
    expect(row).not.toBeNull();
    expect(row.accepted_at).not.toBeNull();
  });

  it("accepted invite no longer appears in listOrgInvites", () => {
    const created = dbModule.createOrgInvite(1, "accept2@test.com", "member");
    dbModule.acceptOrgInvite(created.token);

    const list = dbModule.listOrgInvites(1);
    const found = list.find((i: any) => i.email === "accept2@test.com");
    expect(found).toBeUndefined();
  });
});

// ── Section 6: DB Layer — getAllOrgMembershipsForUser ─────────────────────────

describe("DB Layer — getAllOrgMembershipsForUser (used in Task 4 org switcher)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns all org memberships for a user with orgName", () => {
    dbModule.run(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, [
      "Org Two",
      "org-two",
    ]);
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["multiorg@test.com", "Multi Org User", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "multiorg@test.com",
    ]);

    dbModule.addOrgMember(1, user.id, "owner", null);
    dbModule.run(
      `INSERT INTO org_members (org_id, user_id, role, invited_by) VALUES (2, ?, 'member', NULL)`,
      [user.id]
    );

    const memberships = dbModule.getAllOrgMembershipsForUser(user.id);
    expect(Array.isArray(memberships)).toBe(true);
    expect(memberships.length).toBe(2);

    const org1 = memberships.find((m: any) => m.orgId === 1);
    const org2 = memberships.find((m: any) => m.orgId === 2);

    expect(org1).toBeDefined();
    expect(org1.orgName).toBe("Default Organization");
    expect(org1.role).toBe("owner");

    expect(org2).toBeDefined();
    expect(org2.orgName).toBe("Org Two");
    expect(org2.role).toBe("member");
  });

  it("returns empty array for user with no memberships", () => {
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["noorgs@test.com", "No Orgs", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "noorgs@test.com",
    ]);

    const memberships = dbModule.getAllOrgMembershipsForUser(user.id);
    expect(Array.isArray(memberships)).toBe(true);
    expect(memberships.length).toBe(0);
  });
});

// ── Section 7: DB Layer — getOrgMemberForOrg ──────────────────────────────────

describe("DB Layer — getOrgMemberForOrg (used in JWT callback and switch API)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("returns { orgId, orgName, role } for a member of that org", () => {
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["member4org@test.com", "Member", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "member4org@test.com",
    ]);
    dbModule.addOrgMember(1, user.id, "admin", null);

    const result = dbModule.getOrgMemberForOrg(user.id, 1);
    expect(result).not.toBeNull();
    expect(result.orgId).toBe(1);
    expect(result.orgName).toBe("Default Organization");
    expect(result.role).toBe("admin");
  });

  it("returns null when user is NOT a member of that org", () => {
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["notmember@test.com", "Not Member", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "notmember@test.com",
    ]);

    const result = dbModule.getOrgMemberForOrg(user.id, 1);
    expect(result).toBeNull();
  });
});

// ── Section 8: API Route — POST /api/org/invites (code inspection) ────────────
// NOTE: Uses require("node:fs") inside each test body to avoid the vi.mock("fs") interceptor.

describe("POST /api/org/invites route — code inspection (Criteria 1, 3)", () => {
  it("route file exists at src/app/api/org/invites/route.ts", () => {
    const { existsSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    expect(existsSync(routePath)).toBe(true);
  });

  it("POST handler validates owner/admin role and returns 403 for members (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("orgRole");
    expect(content).toContain("status: 403");
    expect(content).toMatch(/owner|admin/);
  });

  it("POST handler returns status 201 on success (Criterion 1)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("status: 201");
  });

  it("POST handler returns { token, inviteUrl, email, role, expiresAt } shape (Criterion 1)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("token");
    expect(content).toContain("inviteUrl");
    expect(content).toContain("email");
    expect(content).toContain("role");
    expect(content).toContain("expiresAt");
  });

  it("POST handler constructs inviteUrl using NEXTAUTH_URL env var", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("NEXTAUTH_URL");
    expect(content).toContain("/invite/");
  });

  it("POST handler validates email and role inputs (Criterion 1)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toMatch(/email/i);
    expect(content).toMatch(/member|admin/);
    expect(content).toContain("status: 400");
  });

  it("GET handler calls listOrgInvites and returns { invites } (Criterion 4)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("listOrgInvites");
    expect(content).toContain("invites");
  });

  it("route calls auth() and checks for session (auth guard)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("await auth()");
    expect(content).toContain("status: 401");
  });
});

// ── Section 9: API Route — DELETE /api/org/invites/[token] (code inspection) ──

describe("DELETE /api/org/invites/[token] route — code inspection (Criterion 5)", () => {
  it("route file exists at src/app/api/org/invites/[token]/route.ts", () => {
    const { existsSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/[token]/route.ts");
    expect(existsSync(routePath)).toBe(true);
  });

  it("DELETE handler calls revokeOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("revokeOrgInvite");
  });

  it("DELETE handler verifies invite belongs to caller's org before revoking", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgInviteByToken");
    expect(content).toContain("orgId");
  });

  it("DELETE handler returns 204 on success", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("204");
  });

  it("DELETE handler requires owner/admin auth", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/org/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("await auth()");
    expect(content).toContain("status: 403");
  });
});

// ── Section 10: API Route — GET /api/invites/[token] (public, code inspection) ─

describe("GET /api/invites/[token] route — code inspection (Criteria 6 & 7)", () => {
  it("route file exists at src/app/api/invites/[token]/route.ts", () => {
    const { existsSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    expect(existsSync(routePath)).toBe(true);
  });

  it("GET handler returns { valid: false, reason: 'not_found' } for unknown token (Criterion 7)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("not_found");
    expect(content).toContain("valid");
  });

  it("GET handler returns { valid: false, reason: 'already_accepted' } for accepted tokens (Criterion 7)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("already_accepted");
  });

  it("GET handler returns { valid: false, reason: 'expired' } for expired tokens (Criterion 7)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("expired");
  });

  it("GET handler returns { valid: true, orgName, role, email, expiresAt } for valid tokens (Criterion 6)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("valid: true");
    expect(content).toContain("orgName");
    expect(content).toContain("role");
    expect(content).toContain("email");
    expect(content).toContain("expiresAt");
  });

  it("GET handler calls getOrgInviteByToken to look up the token", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("getOrgInviteByToken");
  });

  it("GET handler does NOT enforce auth — route must be public (Criterion 6)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    // Route must NOT have a top-level auth guard that returns 401
    // The public route should not gate GET on session presence
    // Check no pattern of: await auth() then check session then return 401 as the first thing
    // We verify the route doesn't unconditionally require auth for GET
    expect(content).not.toMatch(/export async function GET[^}]*await auth\(\)[^}]*status.*401[^}]*}/s);
  });
});

// ── Section 11: Middleware — /api/invites exclusion (Criterion 6) ─────────────

describe("Middleware — /api/invites exclusion for public access (Criterion 6)", () => {
  it("middleware.ts matcher excludes /api/invites from auth protection", () => {
    const { readFileSync } = require("node:fs");
    const middlewarePath = resolve(ROOT, "middleware.ts");
    const content = readFileSync(middlewarePath, "utf-8");
    // The matcher must exclude api/invites so it's accessible without auth
    expect(content).toContain("api/invites");
  });
});

// ── Section 12: db.d.ts and db-imports.ts — type declarations ────────────────

describe("Type declarations — db.d.ts and db-imports.ts completeness", () => {
  it("lib/db.d.ts exports createOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("createOrgInvite");
  });

  it("lib/db.d.ts exports getOrgInviteByToken", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("getOrgInviteByToken");
  });

  it("lib/db.d.ts exports listOrgInvites", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("listOrgInvites");
  });

  it("lib/db.d.ts exports acceptOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("acceptOrgInvite");
  });

  it("lib/db.d.ts exports revokeOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("revokeOrgInvite");
  });

  it("lib/db.d.ts exports getAllOrgMembershipsForUser", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("getAllOrgMembershipsForUser");
  });

  it("lib/db.d.ts exports getOrgMemberForOrg", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("getOrgMemberForOrg");
  });

  it("src/lib/db-imports.ts re-exports createOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("createOrgInvite");
  });

  it("src/lib/db-imports.ts re-exports getOrgInviteByToken", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("getOrgInviteByToken");
  });

  it("src/lib/db-imports.ts re-exports listOrgInvites", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("listOrgInvites");
  });

  it("src/lib/db-imports.ts re-exports acceptOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("acceptOrgInvite");
  });

  it("src/lib/db-imports.ts re-exports revokeOrgInvite", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("revokeOrgInvite");
  });

  it("src/lib/db-imports.ts re-exports getAllOrgMembershipsForUser", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("getAllOrgMembershipsForUser");
  });

  it("src/lib/db-imports.ts re-exports getOrgMemberForOrg", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("getOrgMemberForOrg");
  });
});
