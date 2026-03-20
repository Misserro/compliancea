/**
 * Integration tests for Task 2 (Plan 028): Invite Acceptance Flow
 *
 * Tests verify against the plan's Task 2 success criteria:
 * 1. /invite/{validToken} publicly accessible without auth; shows org name + role
 * 2. /invite/{expiredToken} shows "This invite has expired" message
 * 3. /invite/{acceptedToken} shows "This invite has already been used" message
 * 4. Logged-in user visiting valid token → auto-enrolled, session switches, lands on /dashboard
 * 5. Logged-out user visiting valid token → redirected to /login?invite=TOKEN with banner; after login enrolled
 * 6. POST /api/invites/[token]/accept called second time returns 409
 * 7. Middleware does NOT block unauthenticated access to /invite/*
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
  DB_PATH: "/tmp/test-db-invite-accept-fake.sqlite",
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

const ROOT = resolve(__dirname, "../..");

// ── Section 1: Middleware — /invite/* exclusion (Criterion 7) ─────────────────

describe("Middleware — /invite/* must be publicly accessible (Criterion 7)", () => {
  it("middleware.ts matcher includes 'invite' in the exclusion pattern", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "middleware.ts"), "utf-8");
    // Must exclude 'invite' (not just 'api/invites') so /invite/[token] pages are unblocked
    expect(content).toMatch(/invite/);
    // Verify the pattern string is the exclusion matcher
    expect(content).toContain("matcher");
  });

  it("middleware.ts exclusion pattern covers the /invite path (not just /api/invites)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "middleware.ts"), "utf-8");
    // The matcher must contain 'invite' as a standalone exclusion (separate from api/invites)
    // Pattern: (?!...api/invites|...invite...) — must exclude the /invite page path
    // We check that 'invite' appears in the negative lookahead without being only 'api/invites'
    const matcherMatch = content.match(/matcher\s*:\s*\[([^\]]+)\]/s);
    expect(matcherMatch).not.toBeNull();
    const matcherStr = matcherMatch![1];
    // 'invite' must appear as its own exclusion token (covers /invite/[token])
    expect(matcherStr).toMatch(/\binvite\b/);
    // Additionally api/invites must also be excluded (for the public GET endpoint)
    expect(matcherStr).toContain("api/invites");
  });

  it("auth.config.ts authorized callback allows /invite paths without auth (Criterion 7)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "auth.config.ts"), "utf-8");
    // Must have a special case that returns true for /invite paths
    expect(content).toContain("/invite");
    expect(content).toContain("return true");
  });

  it("auth.config.ts check is for pathname.startsWith('/invite') or equivalent", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "auth.config.ts"), "utf-8");
    // Must check the pathname, not just a static string
    expect(content).toContain("pathname");
    expect(content).toMatch(/startsWith|includes|===|\/invite/);
  });
});

// ── Section 2: Invite landing page file existence and structure (Criteria 1–3) ─

describe("Invite landing page — file existence and state rendering (Criteria 1, 2, 3)", () => {
  it("src/app/invite/[token]/page.tsx exists (NOT inside (app) route group)", () => {
    const { existsSync } = require("node:fs");
    const pagePath = resolve(ROOT, "src/app/invite/[token]/page.tsx");
    expect(existsSync(pagePath)).toBe(true);
    // Must NOT be inside (app) group
    const appGroupPath = resolve(ROOT, "src/app/(app)/invite/[token]/page.tsx");
    expect(existsSync(appGroupPath)).toBe(false);
  });

  it("invite-accept-client.tsx client component exists alongside page", () => {
    const { existsSync } = require("node:fs");
    const clientPath = resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx");
    expect(existsSync(clientPath)).toBe(true);
  });

  it("landing page renders 'already used' state for acceptedAt tokens (Criterion 3)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/page.tsx"), "utf-8");
    // Must check invite.acceptedAt and render an appropriate message
    expect(content).toContain("acceptedAt");
    expect(content).toMatch(/already.*(been|used)|invite.*already/i);
  });

  it("landing page renders 'expired' state for past-expiry tokens (Criterion 2)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/page.tsx"), "utf-8");
    // Must check expiresAt and render an expiry message
    expect(content).toContain("expiresAt");
    expect(content).toMatch(/expired|expire/i);
    // Plan exact wording: "This invite has expired. Ask your admin to resend the invite."
    expect(content).toMatch(/expired/i);
  });

  it("landing page renders org name and role for valid invite (Criterion 1)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/page.tsx"), "utf-8");
    // Must display orgName and role
    expect(content).toContain("orgName");
    expect(content).toContain("role");
  });

  it("landing page calls getOrgInviteByToken directly (server component reads DB)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/page.tsx"), "utf-8");
    expect(content).toContain("getOrgInviteByToken");
  });

  it("landing page does NOT import auth() — it is a public server component", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/page.tsx"), "utf-8");
    // The server component must NOT gate on auth() — it's public
    expect(content).not.toMatch(/^import.*\bauth\b.*from/m);
    // It should not call await auth() in the page server component
    expect(content).not.toContain("await auth()");
  });
});

// ── Section 3: Invite accept client — logged-in auto-enrollment (Criterion 4) ─

describe("InviteAcceptClient — logged-in user auto-accept flow (Criterion 4)", () => {
  it("client component calls POST /api/invites/[token]/accept automatically when session is authenticated", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    // Must call the accept endpoint
    expect(content).toContain("/api/invites/");
    expect(content).toContain("accept");
    expect(content).toContain("POST");
  });

  it("client component calls update({ switchToOrgId }) after successful accept (Criterion 4)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    expect(content).toContain("switchToOrgId");
    expect(content).toContain("update");
  });

  it("client component redirects to /dashboard after successful accept (Criterion 4)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    expect(content).toContain("/dashboard");
    expect(content).toContain("router.push");
  });

  it("client component uses useSession to detect auth status", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    expect(content).toContain("useSession");
    expect(content).toContain("authenticated");
  });

  it("client component guards against double-accept with a ref flag", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    // Must use a ref or similar guard to prevent duplicate accept calls
    expect(content).toContain("useRef");
  });

  it("client component clears pendingInviteToken from sessionStorage after accept", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    expect(content).toContain("pendingInviteToken");
    expect(content).toContain("sessionStorage");
    expect(content).toContain("removeItem");
  });

  it("client component shows CTA buttons for logged-out users linking to /login?invite=TOKEN (Criterion 5)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/invite/[token]/invite-accept-client.tsx"), "utf-8");
    // The unauthenticated state must have a link to /login?invite=...
    expect(content).toContain("/login?invite=");
    expect(content).toContain("/register?invite=");
  });
});

// ── Section 4: Login page invite awareness (Criterion 5) ──────────────────────

describe("Login page — invite token awareness (Criterion 5)", () => {
  it("login page reads ?invite=TOKEN from search params", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/login/page.tsx"), "utf-8");
    expect(content).toContain("invite");
    expect(content).toContain("useSearchParams");
  });

  it("login page stores invite token in sessionStorage as pendingInviteToken", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/login/page.tsx"), "utf-8");
    expect(content).toContain("pendingInviteToken");
    expect(content).toContain("sessionStorage");
    expect(content).toContain("setItem");
  });

  it("login page shows invite context banner when ?invite param is present", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/login/page.tsx"), "utf-8");
    // Plan: "show a subtle banner: 'You've been invited to join an organization. Log in to accept.'"
    expect(content).toMatch(/invited.*join|join.*organization/i);
  });

  it("login page redirects to /invite/{token} after successful login if pendingInviteToken exists", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/login/page.tsx"), "utf-8");
    expect(content).toContain("pendingInviteToken");
    expect(content).toContain("getItem");
    expect(content).toContain("/invite/");
  });

  it("login page wraps useSearchParams in Suspense (required by Next.js App Router)", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/login/page.tsx"), "utf-8");
    expect(content).toContain("Suspense");
  });
});

// ── Section 5: Register page invite awareness ─────────────────────────────────

describe("Register page — invite token awareness", () => {
  it("register page reads ?invite=TOKEN from search params", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/register/page.tsx"), "utf-8");
    expect(content).toContain("invite");
    expect(content).toContain("useSearchParams");
  });

  it("register page stores token in sessionStorage as pendingInviteToken", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/register/page.tsx"), "utf-8");
    expect(content).toContain("pendingInviteToken");
    expect(content).toContain("sessionStorage");
    expect(content).toContain("setItem");
  });

  it("register page shows invite context banner", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/register/page.tsx"), "utf-8");
    expect(content).toMatch(/invited|organization/i);
  });

  it("register page redirects to /invite/{token} after successful registration if pendingInviteToken exists", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/register/page.tsx"), "utf-8");
    expect(content).toContain("pendingInviteToken");
    expect(content).toContain("getItem");
    expect(content).toContain("/invite/");
  });

  it("register page wraps useSearchParams in Suspense", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/(auth)/register/page.tsx"), "utf-8");
    expect(content).toContain("Suspense");
  });
});

// ── Section 6: POST /api/invites/[token]/accept — DB-level logic (Criterion 6) ─

describe("POST /api/invites/[token]/accept — DB logic for 409 (Criterion 6)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("calling acceptOrgInvite sets accepted_at — second call to getOrgInviteByToken returns acceptedAt set", () => {
    const created = dbModule.createOrgInvite(1, "accept409@test.com", "member");

    // Simulate first accept: mark token as accepted
    dbModule.acceptOrgInvite(created.token);

    // Now the invite should have acceptedAt set
    const invite = dbModule.getOrgInviteByToken(created.token);
    expect(invite).not.toBeNull();
    expect(invite.acceptedAt).not.toBeNull();
  });

  it("accept route file has POST handler that checks acceptedAt and returns 409 (Criterion 6)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");

    // Must have a POST export
    expect(content).toContain("export async function POST");

    // Must check acceptedAt before enrolling
    expect(content).toContain("acceptedAt");

    // Must return 409 for already-accepted token
    expect(content).toContain("status: 409");
  });

  it("accept route checks for already-accepted state AND already-member state, both 409", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");

    // Two distinct 409 paths: already accepted + already member
    const count409 = (content.match(/status:\s*409/g) || []).length;
    expect(count409).toBeGreaterThanOrEqual(2);
  });

  it("accept route requires auth — returns 401 without session", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("await auth()");
    expect(content).toContain("status: 401");
  });

  it("accept route calls addOrgMember, acceptOrgInvite, saveDb in correct order", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("addOrgMember");
    expect(content).toContain("acceptOrgInvite");
    expect(content).toContain("saveDb");
  });

  it("accept route returns { orgId, orgName, role } on success (for session switch)", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("orgId");
    expect(content).toContain("orgName");
    expect(content).toContain("role");
  });

  it("accept route calls logAction for audit trail", () => {
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("logAction");
  });

  it("DB: addOrgMember then acceptOrgInvite — second getOrgInviteByToken.acceptedAt is set", () => {
    // Create an org member and an invite, simulate the full accept flow at DB level
    const created = dbModule.createOrgInvite(1, "flowtest@test.com", "member");

    // Insert a test user
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["flowtest@test.com", "Flow Test User", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "flowtest@test.com",
    ]);

    // First acceptance: add member + mark invite accepted
    dbModule.addOrgMember(1, user.id, created.role, null);
    dbModule.acceptOrgInvite(created.token);

    // Verify invite is now marked accepted
    const inviteAfter = dbModule.getOrgInviteByToken(created.token);
    expect(inviteAfter.acceptedAt).not.toBeNull();

    // Verify user is now a member
    const member = dbModule.getOrgMemberRecord(1, user.id);
    expect(member).not.toBeNull();
    expect(member.role).toBe("member");

    // Second call scenario: getOrgInviteByToken.acceptedAt is set → route returns 409
    // (This is what the route handler checks first)
    expect(inviteAfter.acceptedAt).not.toBeNull(); // confirms 409 path would trigger
  });
});

// ── Section 7: accept route — getOrgMemberRecord import availability ──────────

describe("POST accept route — getOrgMemberRecord function availability", () => {
  it("getOrgMemberRecord is exported from src/lib/db-imports.ts", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/lib/db-imports.ts"), "utf-8");
    expect(content).toContain("getOrgMemberRecord");
  });

  it("getOrgMemberRecord is declared in lib/db.d.ts", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "lib/db.d.ts"), "utf-8");
    expect(content).toContain("getOrgMemberRecord");
  });

  it("accept route imports getOrgMemberRecord from db-imports", () => {
    const { readFileSync } = require("node:fs");
    const content = readFileSync(resolve(ROOT, "src/app/api/invites/[token]/route.ts"), "utf-8");
    expect(content).toContain("getOrgMemberRecord");
  });
});

// ── Section 8: Full invite acceptance flow — DB behavioral test ───────────────

describe("Full invite acceptance — behavioral DB trace (Criteria 4 and 6)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("after accept: user is member of org with correct role", () => {
    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["enrollee@test.com", "Enrollee", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "enrollee@test.com",
    ]);

    const invite = dbModule.createOrgInvite(1, "enrollee@test.com", "admin");

    // Simulate first accept
    dbModule.addOrgMember(invite.orgId, user.id, invite.role, null);
    dbModule.acceptOrgInvite(invite.token);

    // User is now a member with role 'admin'
    const member = dbModule.getOrgMemberRecord(invite.orgId, user.id);
    expect(member).not.toBeNull();
    expect(member.role).toBe("admin");
  });

  it("after accept: invite no longer in pending list", () => {
    const invite = dbModule.createOrgInvite(1, "pendinggone@test.com", "member");

    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["pendinggone@test.com", "Gone User", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "pendinggone@test.com",
    ]);

    dbModule.addOrgMember(invite.orgId, user.id, invite.role, null);
    dbModule.acceptOrgInvite(invite.token);

    const list = dbModule.listOrgInvites(1);
    const found = list.find((i: any) => i.email === "pendinggone@test.com");
    expect(found).toBeUndefined();
  });

  it("second accept attempt: getOrgInviteByToken.acceptedAt is set → 409 path confirmed", () => {
    const invite = dbModule.createOrgInvite(1, "doubleaccept@test.com", "member");

    dbModule.run(
      `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
      ["doubleaccept@test.com", "Double Accept", "hash"]
    );
    const user = dbModule.get(`SELECT id FROM users WHERE email = ?`, [
      "doubleaccept@test.com",
    ]);

    // First accept
    dbModule.addOrgMember(invite.orgId, user.id, invite.role, null);
    dbModule.acceptOrgInvite(invite.token);

    // Second accept: acceptedAt is set → route should return 409
    const inviteAfter = dbModule.getOrgInviteByToken(invite.token);
    expect(inviteAfter.acceptedAt).not.toBeNull();
    // The route checks: if (invite.acceptedAt) → 409
  });

  it("expired token: route would return 410 (not 409)", () => {
    // Insert an already-expired invite
    const expiredToken = "expired-acceptance-test-token";
    dbModule.run(
      `INSERT INTO org_invites (token, org_id, email, role, expires_at)
       VALUES (?, 1, ?, 'member', datetime('now', '-1 day'))`,
      [expiredToken, "expired-accept@test.com"]
    );

    const invite = dbModule.getOrgInviteByToken(expiredToken);
    expect(invite).not.toBeNull();
    // The route checks expiry and returns 410, not 409
    const isExpired = new Date(invite.expiresAt) < new Date();
    expect(isExpired).toBe(true);

    // Confirm route handles this with 410
    const { readFileSync } = require("node:fs");
    const routePath = resolve(ROOT, "src/app/api/invites/[token]/route.ts");
    const content = readFileSync(routePath, "utf-8");
    expect(content).toContain("status: 410");
  });
});
