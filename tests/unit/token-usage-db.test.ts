/**
 * Unit tests for Task 1 of Plan 048 — Token Usage DB Table & Helpers
 *
 * Success criteria tested (verbatim from plan README.md):
 * 1. After ensureDb(), the token_usage table exists with all columns
 * 2. logTokenUsage({ userId, orgId, route, model, inputTokens, outputTokens, voyageTokens, costUsd })
 *    inserts a row without throwing
 * 3. getTokenUsageSummary() returns an array of per-user aggregates summing tokens and cost
 * 4. Calling logTokenUsage does not need to be awaited and a thrown error inside it does not propagate
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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
  DB_PATH: "/tmp/test-token-usage-fake.sqlite",
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

// ── Test helpers ──────────────────────────────────────────────────────────────

async function initFreshDb() {
  await dbModule.initDb();
  return dbModule.getDb();
}

/**
 * Seed the minimum rows required by token_usage FK constraints.
 * initDb() already creates org id=1 ("Default Organization") on a fresh DB,
 * so we only insert the user and (optionally) a second org.
 */
function seedUserAndOrg(db: any) {
  // org id=1 already exists after initDb() bootstrap — insert user only
  db.run(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash) VALUES (1, 'tester@example.com', 'Tester', 'x')`
  );
}

function seedSecondUserAndOrg(db: any) {
  db.run(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES (2, 'Other Org', 'other-org')`);
  db.run(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash) VALUES (2, 'other@example.com', 'Other User', 'x')`
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Criterion 1 — token_usage table exists with all columns after initDb()", () => {
  let db: any;

  beforeEach(async () => {
    db = await initFreshDb();
  });

  it("token_usage table is present in sqlite_master", () => {
    const rows = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'`
    );
    expect(rows.length, "token_usage not found in sqlite_master").toBe(1);
    expect(rows[0].values[0][0]).toBe("token_usage");
  });

  it("has all 10 required columns", () => {
    const rows = db.exec(`PRAGMA table_info(token_usage)`);
    expect(rows.length, "PRAGMA returned no rows").toBeGreaterThan(0);
    const colNames: string[] = rows[0].values.map((r: any[]) => r[1]);

    const required = [
      "id",
      "user_id",
      "org_id",
      "route",
      "model",
      "input_tokens",
      "output_tokens",
      "voyage_tokens",
      "cost_usd",
      "created_at",
    ];
    for (const col of required) {
      expect(colNames, `missing column: ${col}`).toContain(col);
    }
  });

  it("id column is INTEGER PRIMARY KEY AUTOINCREMENT", () => {
    const rows = db.exec(`PRAGMA table_info(token_usage)`);
    const idCol = rows[0].values.find((r: any[]) => r[1] === "id");
    expect(idCol, "id column not found").toBeTruthy();
    expect(idCol[2].toUpperCase()).toContain("INTEGER");
    expect(idCol[5]).toBe(1); // pk flag
  });

  it("cost_usd column type is REAL", () => {
    const rows = db.exec(`PRAGMA table_info(token_usage)`);
    const col = rows[0].values.find((r: any[]) => r[1] === "cost_usd");
    expect(col, "cost_usd column not found").toBeTruthy();
    expect(col[2].toUpperCase()).toContain("REAL");
  });
});

describe("Criterion 2 — logTokenUsage() inserts a row without throwing", () => {
  let db: any;

  beforeEach(async () => {
    db = await initFreshDb();
    seedUserAndOrg(db);
  });

  it("inserts a row when called with all required params", () => {
    expect(() => {
      dbModule.logTokenUsage({
        userId: 1,
        orgId: 1,
        route: "/api/ask",
        model: "sonnet",
        inputTokens: 100,
        outputTokens: 50,
        voyageTokens: 10,
        costUsd: 0.002,
      });
    }).not.toThrow();

    const rows = db.exec(`SELECT * FROM token_usage`);
    expect(rows.length, "no rows in token_usage after insert").toBe(1);
    const [id, user_id, org_id, route, model, input_tokens, output_tokens, voyage_tokens, cost_usd] =
      rows[0].values[0];
    expect(user_id).toBe(1);
    expect(org_id).toBe(1);
    expect(route).toBe("/api/ask");
    expect(model).toBe("sonnet");
    expect(input_tokens).toBe(100);
    expect(output_tokens).toBe(50);
    expect(voyage_tokens).toBe(10);
    expect(cost_usd).toBeCloseTo(0.002);
  });

  it("voyageTokens defaults to 0 when omitted", () => {
    dbModule.logTokenUsage({
      userId: 1,
      orgId: 1,
      route: "/api/analyze",
      model: "haiku",
      inputTokens: 200,
      outputTokens: 80,
      costUsd: 0.001,
    });
    const rows = db.exec(`SELECT voyage_tokens FROM token_usage`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("costUsd defaults to 0 when omitted", () => {
    dbModule.logTokenUsage({
      userId: 1,
      orgId: 1,
      route: "/api/analyze",
      model: "haiku",
      inputTokens: 200,
      outputTokens: 80,
    });
    const rows = db.exec(`SELECT cost_usd FROM token_usage`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  it("inserts multiple rows for multiple calls", () => {
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 10, outputTokens: 5 });
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/analyze", model: "haiku", inputTokens: 20, outputTokens: 8 });
    const rows = db.exec(`SELECT COUNT(*) FROM token_usage`);
    expect(rows[0].values[0][0]).toBe(2);
  });
});

describe("Criterion 3 — getTokenUsageSummary() returns per-user aggregates", () => {
  let db: any;

  beforeEach(async () => {
    db = await initFreshDb();
    seedUserAndOrg(db);
    seedSecondUserAndOrg(db);
  });

  it("returns empty array when table is empty", () => {
    const result = dbModule.getTokenUsageSummary();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("returns one row per user after inserts", () => {
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 100, outputTokens: 50, voyageTokens: 10, costUsd: 0.002 });
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/analyze", model: "haiku", inputTokens: 200, outputTokens: 80, voyageTokens: 0, costUsd: 0.001 });
    dbModule.logTokenUsage({ userId: 2, orgId: 2, route: "/api/ask", model: "sonnet", inputTokens: 50, outputTokens: 25, voyageTokens: 5, costUsd: 0.0005 });

    const result = dbModule.getTokenUsageSummary();
    expect(result.length).toBe(2);
  });

  it("correctly sums inputTokens across routes for a single user", () => {
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 100, outputTokens: 50, voyageTokens: 10, costUsd: 0.002 });
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/analyze", model: "haiku", inputTokens: 200, outputTokens: 80, voyageTokens: 0, costUsd: 0.001 });

    const result = dbModule.getTokenUsageSummary();
    expect(result.length).toBe(1);
    const row = result[0];
    expect(row.claudeInputTokens).toBe(300);   // 100 + 200
    expect(row.claudeOutputTokens).toBe(130);  // 50 + 80
    expect(row.voyageTokens).toBe(10);         // 10 + 0
    expect(row.estimatedCostUsd).toBeCloseTo(0.003); // 0.002 + 0.001
  });

  it("result objects have the required shape", () => {
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 100, outputTokens: 50, voyageTokens: 10, costUsd: 0.002 });
    const result = dbModule.getTokenUsageSummary();
    const row = result[0];
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

  it("userName and userEmail are populated from users join", () => {
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 100, outputTokens: 50 });
    const result = dbModule.getTokenUsageSummary();
    expect(result[0].userName).toBe("Tester");
    expect(result[0].userEmail).toBe("tester@example.com");
    // org id=1 is "Default Organization" (seeded by initDb bootstrap)
    expect(result[0].orgName).toBe("Default Organization");
  });

  it("orgId filter restricts results to that org only", () => {
    // user 1 → org 1, user 2 → org 2 (seeded above)
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 100, outputTokens: 50 });
    dbModule.logTokenUsage({ userId: 2, orgId: 2, route: "/api/ask", model: "sonnet", inputTokens: 50, outputTokens: 25 });

    const resultAll = dbModule.getTokenUsageSummary();
    expect(resultAll.length).toBe(2);

    const resultFiltered = dbModule.getTokenUsageSummary({ orgId: 1 });
    expect(resultFiltered.length).toBe(1);
    expect(resultFiltered[0].orgId).toBe(1);
  });

  it("results are sorted by estimatedCostUsd descending", () => {
    dbModule.logTokenUsage({ userId: 2, orgId: 2, route: "/api/ask", model: "sonnet", inputTokens: 50, outputTokens: 25, costUsd: 0.0005 });
    dbModule.logTokenUsage({ userId: 1, orgId: 1, route: "/api/ask", model: "sonnet", inputTokens: 100, outputTokens: 50, costUsd: 0.002 });

    const result = dbModule.getTokenUsageSummary();
    expect(result.length).toBe(2);
    expect(result[0].estimatedCostUsd).toBeGreaterThanOrEqual(result[1].estimatedCostUsd);
  });
});

describe("Criterion 4 — logTokenUsage does not propagate errors", () => {
  let db: any;

  beforeEach(async () => {
    db = await initFreshDb();
    // NOTE: intentionally NOT seeding users/orgs — FK violation will occur
  });

  it("does not throw when the DB insert fails (FK violation)", () => {
    // userId 999 and orgId 999 do not exist — this will cause a constraint error
    // The function must swallow it silently
    expect(() => {
      dbModule.logTokenUsage({
        userId: 999,
        orgId: 999,
        route: "/api/ask",
        model: "sonnet",
        inputTokens: 100,
        outputTokens: 50,
        voyageTokens: 0,
        costUsd: 0.001,
      });
    }).not.toThrow();
  });

  it("is a synchronous function (return value is not a Promise)", () => {
    // A fire-and-forget function must be synchronous so the caller truly does
    // not need to await it and errors cannot escape as unhandled rejections.
    // We seed valid data here so the insert actually succeeds — we're testing
    // the return type, not an error path.
    seedUserAndOrg(db);
    const returnValue = dbModule.logTokenUsage({
      userId: 1,
      orgId: 1,
      route: "/api/ask",
      model: "sonnet",
      inputTokens: 10,
      outputTokens: 5,
    });
    // Must return undefined (not a Promise)
    expect(returnValue).toBeUndefined();
  });
});

describe("Criterion — exports from db-imports.ts", () => {
  it("logTokenUsage is exported from src/lib/db-imports.ts", async () => {
    const dbImports = await import("../../src/lib/db-imports.js");
    expect(typeof (dbImports as any).logTokenUsage).toBe("function");
  });

  it("getTokenUsageSummary is exported from src/lib/db-imports.ts", async () => {
    const dbImports = await import("../../src/lib/db-imports.js");
    expect(typeof (dbImports as any).getTokenUsageSummary).toBe("function");
  });
});
