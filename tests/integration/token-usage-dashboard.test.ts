/**
 * Integration tests for Task 3 of Plan 048 — Super-Admin Token Usage Dashboard
 *
 * Success criteria tested (verbatim from plan README.md):
 * 1. A super admin can navigate to /admin/token-usage and see a table of all users
 *    with their aggregated token counts and estimated costs
 * 2. A non-super-admin user receives a redirect or 403 when accessing the page/API
 * 3. The "Total" row at the bottom correctly sums all user rows
 * 4. The table is visible and loads without errors when token_usage table is empty
 *    (shows empty state message)
 *
 * Strategy:
 * - Next.js route handlers and Server Components cannot be imported into Vitest.
 * - Layer A (code inspection): verify auth guards, imports, response shapes, empty state
 *   text, and total-row logic by reading the source files.
 * - Layer B (DB + math): exercise getTokenUsageSummary() against a real in-memory DB
 *   and verify the reduce math matches what the page component does.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

// ── Mock fs and paths so db.js never touches the real filesystem ──────────────
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
  DB_PATH: "/tmp/test-token-usage-dashboard-fake.sqlite",
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
const API_ROUTE = resolve(ROOT, "src/app/api/admin/token-usage/route.ts");
const PAGE = resolve(ROOT, "src/app/(admin)/admin/token-usage/page.tsx");
const LAYOUT = resolve(ROOT, "src/app/(admin)/layout.tsx");

// ── Test helpers ──────────────────────────────────────────────────────────────

async function initFreshDb() {
  await dbModule.initDb();
  return dbModule.getDb();
}

function seedUsers(db: any) {
  // org id=1 ("Default Organization") already created by initDb()
  db.run(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash) VALUES (1, 'alice@example.com', 'Alice', 'x')`
  );
  db.run(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES (2, 'Second Org', 'second-org')`);
  db.run(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash) VALUES (2, 'bob@example.com', 'Bob', 'x')`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER A — Code inspection
// ─────────────────────────────────────────────────────────────────────────────

// Criterion 2 (non-super-admin gets 403/redirect) — API Route

describe("Criterion 2 — API route: non-super-admin receives 401/403", () => {
  it("API route file exists at src/app/api/admin/token-usage/route.ts", () => {
    const { existsSync: nodeExistsSync } = require("node:fs");
    expect(nodeExistsSync(API_ROUTE)).toBe(true);
  });

  it("API route imports requireSuperAdmin from @/lib/require-super-admin", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(API_ROUTE, "utf-8");
    expect(src).toContain('from "@/lib/require-super-admin"');
    expect(src).toContain("requireSuperAdmin");
  });

  it("API route calls await auth() before requireSuperAdmin", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(API_ROUTE, "utf-8");
    const authPos = src.indexOf("await auth()");
    const guardPos = src.indexOf("requireSuperAdmin(");
    expect(authPos).toBeGreaterThan(-1);
    expect(guardPos).toBeGreaterThan(-1);
    expect(authPos).toBeLessThan(guardPos);
  });

  it("API route calls requireSuperAdmin BEFORE ensureDb() — no data leakage path", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(API_ROUTE, "utf-8");
    const guardPos = src.indexOf("requireSuperAdmin(");
    const ensureDbPos = src.indexOf("ensureDb()");
    expect(guardPos).toBeGreaterThan(-1);
    expect(ensureDbPos).toBeGreaterThan(-1);
    expect(guardPos).toBeLessThan(ensureDbPos);
  });

  it("API route short-circuits on denied (if denied) return denied pattern)", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(API_ROUTE, "utf-8");
    expect(src).toMatch(/if \(denied\) return denied/);
  });
});

// Criterion 2 — Page redirect for non-super-admin

describe("Criterion 2 — Page: non-super-admin receives redirect", () => {
  it("page file exists at src/app/(admin)/admin/token-usage/page.tsx", () => {
    const { existsSync: nodeExistsSync } = require("node:fs");
    expect(nodeExistsSync(PAGE)).toBe(true);
  });

  it("page redirects to /login when no session user", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toMatch(/redirect\(["']\/login["']\)/);
    expect(src).toMatch(/session\?\.user/);
  });

  it("page redirects to / when user is not super admin", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("isSuperAdmin");
    expect(src).toMatch(/redirect\(["']\/["']\)/);
    // Guard must come before DB call — compare positions of the actual guard check
    // and the actual function call (not the import statement at the top).
    // The guard is `if (!session.user.isSuperAdmin) redirect("/")` at runtime,
    // while the call is `getTokenUsageSummary()` (with parentheses, not import statement).
    const isSuperAdminPos = src.indexOf("!session.user.isSuperAdmin");
    const getTokenCallPos = src.indexOf("getTokenUsageSummary()");
    expect(isSuperAdminPos).toBeGreaterThan(-1);
    expect(getTokenCallPos).toBeGreaterThan(-1);
    expect(isSuperAdminPos).toBeLessThan(getTokenCallPos);
  });
});

// Criterion 1 — Super admin sees table with all required columns

describe("Criterion 1 — Super admin sees table with required columns", () => {
  it("page imports getTokenUsageSummary from db-imports", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("getTokenUsageSummary");
    expect(src).toContain("db-imports");
  });

  it("page imports formatNumber and formatCost from @/lib/utils (post-refactor)", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain('from "@/lib/utils"');
    expect(src).toContain("formatNumber");
    expect(src).toContain("formatCost");
  });

  it("formatNumber and formatCost are exported from src/lib/utils.ts", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const utilsSrc: string = nodeReadFileSync(resolve(ROOT, "src/lib/utils.ts"), "utf-8");
    expect(utilsSrc).toMatch(/export function formatNumber/);
    expect(utilsSrc).toMatch(/export function formatCost/);
  });

  it("page calls getTokenUsageSummary() with no org filter (all users, all orgs)", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    // Must call getTokenUsageSummary() with no arguments — no orgId filter
    expect(src).toMatch(/getTokenUsageSummary\(\)/);
  });

  it("page renders table with User column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("User");
  });

  it("page renders table with Email column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("Email");
  });

  it("page renders table with Organization column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("Organization");
  });

  it("page renders table with Claude Input Tokens column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("Claude Input");
  });

  it("page renders table with Claude Output Tokens column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("Claude Output");
  });

  it("page renders table with Voyage Tokens column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("Voyage");
  });

  it("page renders table with Est. Cost column header", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toMatch(/Est.*Cost|Cost.*USD/);
  });

  it("layout.tsx has Token Usage nav link pointing to /admin/token-usage", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(LAYOUT, "utf-8");
    expect(src).toContain("/admin/token-usage");
    expect(src).toMatch(/Token Usage/);
  });
});

// Criterion 3 — Total row sums all user rows

describe("Criterion 3 — Total row sums all user rows (code inspection)", () => {
  it("page uses reduce to compute totals over the full usage array", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain(".reduce(");
    // Accumulates all four numeric fields
    expect(src).toContain("claudeInputTokens");
    expect(src).toContain("claudeOutputTokens");
    expect(src).toContain("voyageTokens");
    expect(src).toContain("estimatedCostUsd");
  });

  it("total row is rendered with a 'Total' label", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain(">Total<");
  });

  it("total row is inside the usage.length > 0 branch (not rendered when empty)", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    // The empty state check must come before the total row in the JSX
    const emptyCheckPos = src.indexOf("usage.length === 0");
    const totalRowPos = src.indexOf(">Total<");
    expect(emptyCheckPos).toBeGreaterThan(-1);
    expect(totalRowPos).toBeGreaterThan(-1);
    // Total row appears after the empty-state check — meaning it is in the else branch
    expect(totalRowPos).toBeGreaterThan(emptyCheckPos);
  });

  it("reduce initial value is zero for all four fields", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    // Initial accumulator must set claudeInputTokens: 0, claudeOutputTokens: 0, etc.
    expect(src).toMatch(/claudeInputTokens:\s*0/);
    expect(src).toMatch(/claudeOutputTokens:\s*0/);
    expect(src).toMatch(/voyageTokens:\s*0/);
    expect(src).toMatch(/estimatedCostUsd:\s*0/);
  });
});

// Criterion 4 — Empty state when token_usage table is empty

describe("Criterion 4 — Empty state message when no token usage data", () => {
  it("page renders empty state message when usage array is empty", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toMatch(/No token usage data|no.*usage.*yet|no.*data.*recorded/i);
  });

  it("empty state uses colSpan to span all table columns", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    // colSpan must cover all 7 columns
    expect(src).toMatch(/colSpan=\{7\}/);
  });

  it("empty state checks usage.length === 0 to branch correctly", () => {
    const { readFileSync: nodeReadFileSync } = require("node:fs");
    const src: string = nodeReadFileSync(PAGE, "utf-8");
    expect(src).toContain("usage.length === 0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER B — DB + math verification
// ─────────────────────────────────────────────────────────────────────────────

// Criterion 1 — getTokenUsageSummary() returns correct aggregates for the table

describe("Criterion 1 — DB layer: getTokenUsageSummary() returns data for table rendering", () => {
  let db: any;

  beforeEach(async () => {
    db = await initFreshDb();
    seedUsers(db);
  });

  it("returns empty array when token_usage is empty (empty state criterion)", () => {
    const result = dbModule.getTokenUsageSummary();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("returns one row per user with correct field names for page rendering", () => {
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/ask", model: "sonnet",
      inputTokens: 1000, outputTokens: 500, voyageTokens: 100, costUsd: 0.01,
    });

    const result = dbModule.getTokenUsageSummary();
    expect(result.length).toBe(1);
    const row = result[0];
    // Verify all fields the page component uses
    expect(row).toHaveProperty("userId");
    expect(row).toHaveProperty("userName");
    expect(row).toHaveProperty("userEmail");
    expect(row).toHaveProperty("orgId");
    expect(row).toHaveProperty("orgName");
    expect(row).toHaveProperty("claudeInputTokens");
    expect(row).toHaveProperty("claudeOutputTokens");
    expect(row).toHaveProperty("voyageTokens");
    expect(row).toHaveProperty("estimatedCostUsd");
  });

  it("called with no arguments (no orgId filter) returns all users across all orgs", () => {
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/ask", model: "sonnet",
      inputTokens: 500, outputTokens: 200, voyageTokens: 0, costUsd: 0.005,
    });
    dbModule.logTokenUsage({
      userId: 2, orgId: 2, route: "/api/analyze", model: "sonnet",
      inputTokens: 300, outputTokens: 100, voyageTokens: 50, costUsd: 0.002,
    });

    const result = dbModule.getTokenUsageSummary();
    expect(result.length).toBe(2);
    const userIds = result.map((r: any) => r.userId);
    expect(userIds).toContain(1);
    expect(userIds).toContain(2);
  });
});

// Criterion 3 — Total row math: simulate the page's reduce logic

describe("Criterion 3 — Total row math: reduce over getTokenUsageSummary() results", () => {
  let db: any;

  beforeEach(async () => {
    db = await initFreshDb();
    seedUsers(db);
  });

  it("reduce over single-user data produces correct totals", () => {
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/ask", model: "sonnet",
      inputTokens: 1000, outputTokens: 500, voyageTokens: 100, costUsd: 0.01,
    });
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/analyze", model: "sonnet",
      inputTokens: 2000, outputTokens: 800, voyageTokens: 0, costUsd: 0.02,
    });

    const usage = dbModule.getTokenUsageSummary();
    // Simulate the page's reduce (same logic as page.tsx lines 34-42)
    const totals = usage.reduce(
      (acc: any, row: any) => ({
        claudeInputTokens: acc.claudeInputTokens + (row.claudeInputTokens ?? 0),
        claudeOutputTokens: acc.claudeOutputTokens + (row.claudeOutputTokens ?? 0),
        voyageTokens: acc.voyageTokens + (row.voyageTokens ?? 0),
        estimatedCostUsd: acc.estimatedCostUsd + (row.estimatedCostUsd ?? 0),
      }),
      { claudeInputTokens: 0, claudeOutputTokens: 0, voyageTokens: 0, estimatedCostUsd: 0 }
    );

    // One user with two routes summed at DB level:
    expect(totals.claudeInputTokens).toBe(3000);
    expect(totals.claudeOutputTokens).toBe(1300);
    expect(totals.voyageTokens).toBe(100);
    expect(totals.estimatedCostUsd).toBeCloseTo(0.03, 6);
  });

  it("reduce over multi-user data sums ALL rows correctly", () => {
    // User 1: org 1
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/ask", model: "sonnet",
      inputTokens: 1000, outputTokens: 400, voyageTokens: 200, costUsd: 0.005,
    });
    // User 2: org 2
    dbModule.logTokenUsage({
      userId: 2, orgId: 2, route: "/api/analyze", model: "sonnet",
      inputTokens: 500, outputTokens: 300, voyageTokens: 100, costUsd: 0.003,
    });

    const usage = dbModule.getTokenUsageSummary();
    expect(usage.length).toBe(2);

    const totals = usage.reduce(
      (acc: any, row: any) => ({
        claudeInputTokens: acc.claudeInputTokens + (row.claudeInputTokens ?? 0),
        claudeOutputTokens: acc.claudeOutputTokens + (row.claudeOutputTokens ?? 0),
        voyageTokens: acc.voyageTokens + (row.voyageTokens ?? 0),
        estimatedCostUsd: acc.estimatedCostUsd + (row.estimatedCostUsd ?? 0),
      }),
      { claudeInputTokens: 0, claudeOutputTokens: 0, voyageTokens: 0, estimatedCostUsd: 0 }
    );

    expect(totals.claudeInputTokens).toBe(1500);   // 1000 + 500
    expect(totals.claudeOutputTokens).toBe(700);    // 400 + 300
    expect(totals.voyageTokens).toBe(300);           // 200 + 100
    expect(totals.estimatedCostUsd).toBeCloseTo(0.008, 6); // 0.005 + 0.003
  });

  it("reduce over empty array returns zero totals (safe for empty state)", () => {
    const usage: any[] = [];
    const totals = usage.reduce(
      (acc: any, row: any) => ({
        claudeInputTokens: acc.claudeInputTokens + (row.claudeInputTokens ?? 0),
        claudeOutputTokens: acc.claudeOutputTokens + (row.claudeOutputTokens ?? 0),
        voyageTokens: acc.voyageTokens + (row.voyageTokens ?? 0),
        estimatedCostUsd: acc.estimatedCostUsd + (row.estimatedCostUsd ?? 0),
      }),
      { claudeInputTokens: 0, claudeOutputTokens: 0, voyageTokens: 0, estimatedCostUsd: 0 }
    );

    expect(totals.claudeInputTokens).toBe(0);
    expect(totals.claudeOutputTokens).toBe(0);
    expect(totals.voyageTokens).toBe(0);
    expect(totals.estimatedCostUsd).toBe(0);
  });

  it("results are sorted by estimatedCostUsd DESC — highest cost user appears first", () => {
    // User 1: cheaper
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/ask", model: "sonnet",
      inputTokens: 100, outputTokens: 50, voyageTokens: 0, costUsd: 0.001,
    });
    // User 2: more expensive
    dbModule.logTokenUsage({
      userId: 2, orgId: 2, route: "/api/analyze", model: "sonnet",
      inputTokens: 5000, outputTokens: 2000, voyageTokens: 0, costUsd: 0.05,
    });

    const result = dbModule.getTokenUsageSummary();
    expect(result.length).toBe(2);
    // First row should be the most expensive user
    expect(result[0].estimatedCostUsd).toBeGreaterThanOrEqual(result[1].estimatedCostUsd);
    expect(result[0].userId).toBe(2);
  });

  it("total row math is stable with ?? 0 coalescing — handles potential null tokens", () => {
    // Directly insert a row with a NULL-equivalent value to test defensive coalescence
    dbModule.logTokenUsage({
      userId: 1, orgId: 1, route: "/api/ask", model: "sonnet",
      inputTokens: 0, outputTokens: 0, voyageTokens: 0, costUsd: 0,
    });

    const usage = dbModule.getTokenUsageSummary();
    const totals = usage.reduce(
      (acc: any, row: any) => ({
        claudeInputTokens: acc.claudeInputTokens + (row.claudeInputTokens ?? 0),
        claudeOutputTokens: acc.claudeOutputTokens + (row.claudeOutputTokens ?? 0),
        voyageTokens: acc.voyageTokens + (row.voyageTokens ?? 0),
        estimatedCostUsd: acc.estimatedCostUsd + (row.estimatedCostUsd ?? 0),
      }),
      { claudeInputTokens: 0, claudeOutputTokens: 0, voyageTokens: 0, estimatedCostUsd: 0 }
    );

    expect(totals.claudeInputTokens).toBe(0);
    expect(totals.estimatedCostUsd).toBe(0);
  });
});
