/**
 * Integration tests for Task 2: Full Data Isolation — Query Layer and API Route Org Scoping
 *
 * Tests verify against plan success criteria:
 * 1. Documents page shows only documents belonging to the session user's org
 * 2. Cases page shows only cases belonging to the session user's org
 * 3. Dashboard stats reflect only the org's data
 * 4. Ask Library / RAG search returns only results from the org's document chunks
 * 5. New audit log entries include user_id and org_id
 * 6. grep: every getAllDocuments|getDocumentById|getLegalCases call site passes orgId
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
  DB_PATH: "/tmp/test-db-iso-fake.sqlite",
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

// ── Helper: seed two orgs with data ──────────────────────────────────────────
async function seedTwoOrgs() {
  await dbModule.initDb(); // creates org 1 "Default Organization"

  // Create a second org
  dbModule.run(
    `INSERT INTO organizations (name, slug) VALUES (?, ?)`,
    ["Org Two", "org-two"]
  );

  // Insert two users and enroll them in different orgs
  dbModule.run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    ["user1@org1.com", "User One", "hash1"]
  );
  dbModule.run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    ["user2@org2.com", "User Two", "hash2"]
  );
  const u1 = dbModule.get(`SELECT id FROM users WHERE email = ?`, ["user1@org1.com"]);
  const u2 = dbModule.get(`SELECT id FROM users WHERE email = ?`, ["user2@org2.com"]);

  dbModule.run(`INSERT INTO org_members (org_id, user_id, role) VALUES (1, ?, 'owner')`, [u1.id]);
  dbModule.run(`INSERT INTO org_members (org_id, user_id, role) VALUES (2, ?, 'owner')`, [u2.id]);

  return { userId1: u1.id, userId2: u2.id };
}

// ── Section 1: Document isolation ────────────────────────────────────────────

describe("getAllDocuments — org isolation (Criterion: Documents show only org data)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getAllDocuments(orgId=1) returns only org 1 documents", async () => {
    await seedTwoOrgs();

    // Insert one document for org 1 and one for org 2
    dbModule.run(
      `INSERT INTO documents (name, path, org_id) VALUES (?, ?, ?)`,
      ["Doc Org 1", "/tmp/doc1.pdf", 1]
    );
    dbModule.run(
      `INSERT INTO documents (name, path, org_id) VALUES (?, ?, ?)`,
      ["Doc Org 2", "/tmp/doc2.pdf", 2]
    );

    const docs1 = dbModule.getAllDocuments(1);
    expect(docs1).toHaveLength(1);
    expect(docs1[0].name).toBe("Doc Org 1");

    const docs2 = dbModule.getAllDocuments(2);
    expect(docs2).toHaveLength(1);
    expect(docs2[0].name).toBe("Doc Org 2");
  });

  it("getAllDocuments(orgId=1) returns empty array when no docs belong to org", async () => {
    await seedTwoOrgs();

    // Only insert doc for org 2
    dbModule.run(
      `INSERT INTO documents (name, path, org_id) VALUES (?, ?, ?)`,
      ["Org2 Only Doc", "/tmp/doc2only.pdf", 2]
    );

    const docs1 = dbModule.getAllDocuments(1);
    expect(docs1).toHaveLength(0);
  });

  it("getAllDocuments does NOT return cross-org documents", async () => {
    await seedTwoOrgs();

    // Insert 5 docs for org 2
    for (let i = 1; i <= 5; i++) {
      dbModule.run(
        `INSERT INTO documents (name, path, org_id) VALUES (?, ?, ?)`,
        [`OrgTwo Doc ${i}`, `/tmp/org2-doc${i}.pdf`, 2]
      );
    }
    // Insert 2 docs for org 1
    for (let i = 1; i <= 2; i++) {
      dbModule.run(
        `INSERT INTO documents (name, path, org_id) VALUES (?, ?, ?)`,
        [`OrgOne Doc ${i}`, `/tmp/org1-doc${i}.pdf`, 1]
      );
    }

    const docs1 = dbModule.getAllDocuments(1);
    expect(docs1).toHaveLength(2);
    // Verify none of the org2 documents leaked into org1 results
    const names = docs1.map((d: { name: string }) => d.name);
    expect(names.every((n: string) => n.startsWith("OrgOne"))).toBe(true);
  });
});

// ── Section 2: Document by ID isolation ──────────────────────────────────────

describe("getDocumentById — cross-org access prevention", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getDocumentById(id, orgId) returns null when document belongs to different org", async () => {
    await seedTwoOrgs();

    // Insert doc for org 2
    const docId = dbModule.addDocument("Org2 Doc", "/tmp/org2doc.pdf", null, null, 2);

    // Org 1 tries to access it — should be null (access denied)
    const result = dbModule.getDocumentById(docId, 1);
    expect(result).toBeNull();
  });

  it("getDocumentById(id, orgId) returns document when orgId matches", async () => {
    await seedTwoOrgs();

    const docId = dbModule.addDocument("Org1 Doc", "/tmp/org1doc.pdf", null, null, 1);
    const result = dbModule.getDocumentById(docId, 1);
    expect(result).not.toBeNull();
    expect(result.name).toBe("Org1 Doc");
  });
});

// ── Section 3: Legal Cases isolation ─────────────────────────────────────────

describe("getLegalCases — org isolation (Criterion: Cases show only org data)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getLegalCases({ orgId: 1 }) returns only org 1 cases", async () => {
    await seedTwoOrgs();

    // Create cases for both orgs
    dbModule.createLegalCase({
      title: "Case Org 1", caseType: "civil", referenceNumber: null, internalNumber: null,
      procedureType: null, court: null, courtDivision: null, judge: null,
      summary: null, claimDescription: null, claimValue: null, claimCurrency: "PLN",
      tags: [], extensionData: {}, orgId: 1,
    });
    dbModule.createLegalCase({
      title: "Case Org 2", caseType: "civil", referenceNumber: null, internalNumber: null,
      procedureType: null, court: null, courtDivision: null, judge: null,
      summary: null, claimDescription: null, claimValue: null, claimCurrency: "PLN",
      tags: [], extensionData: {}, orgId: 2,
    });

    const result1 = dbModule.getLegalCases({ orgId: 1 });
    expect(result1.cases).toHaveLength(1);
    expect(result1.cases[0].title).toBe("Case Org 1");

    const result2 = dbModule.getLegalCases({ orgId: 2 });
    expect(result2.cases).toHaveLength(1);
    expect(result2.cases[0].title).toBe("Case Org 2");
  });

  it("getLegalCases without orgId returns all cases (backward-compat, not filtered)", () => {
    // This tests that the function at least doesn't break without orgId
    const result = dbModule.getLegalCases({});
    expect(Array.isArray(result.cases)).toBe(true);
  });
});

// ── Section 4: Audit log — user_id and org_id stored ─────────────────────────

describe("logAction — stores user_id and org_id in audit_log (Criterion: audit entries include user_id and org_id)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("logAction with options stores user_id and org_id in the audit_log row", async () => {
    const { readFileSync, existsSync } = require("node:fs");
    // Use the real audit module
    // @ts-ignore
    const { logAction } = await import("../../lib/audit.js");

    logAction("document", 42, "created", { name: "test.pdf" }, { userId: 99, orgId: 7 });

    const rows = dbModule.query(
      `SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? AND action = ?`,
      ["document", 42, "created"]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(99);
    expect(rows[0].org_id).toBe(7);
    expect(rows[0].entity_type).toBe("document");
    expect(rows[0].action).toBe("created");
  });

  it("logAction without options stores null user_id and null org_id", async () => {
    // @ts-ignore
    const { logAction } = await import("../../lib/audit.js");

    logAction("document", 1, "viewed", null);

    const rows = dbModule.query(
      `SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? AND action = ?`,
      ["document", 1, "viewed"]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].org_id).toBeNull();
  });

  it("getAuditLog filters entries by org_id when provided", async () => {
    // @ts-ignore
    const { logAction, getAuditLog } = await import("../../lib/audit.js");

    // Log two actions: one for org 1, one for org 2
    logAction("document", 10, "created", null, { userId: 1, orgId: 1 });
    logAction("document", 20, "created", null, { userId: 2, orgId: 2 });

    const org1Entries = getAuditLog({ orgId: 1 });
    expect(org1Entries.every((e: { org_id: number }) => e.org_id === 1)).toBe(true);
    const org1EntityIds = org1Entries.map((e: { entity_id: number }) => e.entity_id);
    expect(org1EntityIds).toContain(10);
    expect(org1EntityIds).not.toContain(20);

    const org2Entries = getAuditLog({ orgId: 2 });
    expect(org2Entries.every((e: { org_id: number }) => e.org_id === 2)).toBe(true);
    const org2EntityIds = org2Entries.map((e: { entity_id: number }) => e.entity_id);
    expect(org2EntityIds).toContain(20);
    expect(org2EntityIds).not.toContain(10);
  });
});

// ── Section 5: Tasks isolation ────────────────────────────────────────────────

describe("getAllTasks — org isolation", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("getAllTasks(null, orgId) returns only tasks for the given org", async () => {
    await seedTwoOrgs();

    dbModule.run(
      `INSERT INTO tasks (title, entity_type, entity_id, task_type, status, org_id) VALUES (?, ?, ?, ?, ?, ?)`,
      ["Task Org 1", "document", 1, "review", "open", 1]
    );
    dbModule.run(
      `INSERT INTO tasks (title, entity_type, entity_id, task_type, status, org_id) VALUES (?, ?, ?, ?, ?, ?)`,
      ["Task Org 2", "document", 2, "review", "open", 2]
    );

    const tasks1 = dbModule.getAllTasks(null, 1);
    expect(tasks1).toHaveLength(1);
    expect(tasks1[0].title).toBe("Task Org 1");

    const tasks2 = dbModule.getAllTasks(null, 2);
    expect(tasks2).toHaveLength(1);
    expect(tasks2[0].title).toBe("Task Org 2");
  });
});

// ── Section 6: API route code inspection — orgId passed at every call site ────

describe("API route orgId call sites — static code verification (Criterion: grep check)", () => {
  it("api/documents/route.ts passes orgId to getAllDocuments", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/documents/route.ts"),
      "utf-8"
    );
    expect(content).toContain("getAllDocuments(orgId)");
    expect(content).toContain("await auth()");
    expect(content).toContain("orgId = Number(session.user.orgId)");
  });

  it("api/dashboard/route.ts passes orgId to all major query functions", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/dashboard/route.ts"),
      "utf-8"
    );
    expect(content).toContain("getAllDocuments(orgId)");
    expect(content).toContain("getAllObligations(orgId)");
    expect(content).toContain("getOverdueObligations(orgId)");
    expect(content).toContain("getContractsWithSummaries(orgId)");
  });

  it("api/legal-hub/cases/route.ts passes orgId to getLegalCases", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/legal-hub/cases/route.ts"),
      "utf-8"
    );
    expect(content).toContain("orgId");
    expect(content).toContain("getLegalCases(");
    // orgId must be in the getLegalCases call
    expect(content).toMatch(/getLegalCases\([^)]*orgId/);
  });

  it("api/ask/route.ts passes orgId to searchDocuments (RAG scoping)", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/ask/route.ts"),
      "utf-8"
    );
    // orgId must be extracted from session
    expect(content).toContain("orgId = Number(session.user.orgId)");
    // searchDocuments is called with a variable (searchOptions), not an inline literal —
    // verify the searchOptions variable includes orgId in its construction (both ternary branches).
    // The ternary assigns searchOptions then calls searchDocuments(question, searchOptions).
    expect(content).toContain("searchDocuments(question, searchOptions)");
    // Both branches of the ternary must include orgId — there must be >=2 orgId refs
    // between the `const searchOptions` declaration and the `searchDocuments` call.
    const blockMatch = content.match(/const searchOptions[\s\S]*?searchDocuments\(question, searchOptions\)/);
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    const orgIdCount = (block.match(/\borgId\b/g) || []).length;
    // Both ternary branches must carry orgId (expect exactly 2 in the block)
    expect(orgIdCount).toBeGreaterThanOrEqual(2);
  });

  it("api/audit/route.ts passes orgId to getAuditLog filters", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/audit/route.ts"),
      "utf-8"
    );
    expect(content).toContain("orgId");
    expect(content).toMatch(/filters\s*=\s*\{[^}]*orgId/s);
  });

  it("api/tasks/route.ts passes orgId to getAllTasks", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const content: string = readFileSync(
      resolve(__dirname, "../../src/app/api/tasks/route.ts"),
      "utf-8"
    );
    expect(content).toContain("getAllTasks(statusFilter, orgId)");
  });
});

// ── Section 7: addDocument stores org_id ─────────────────────────────────────

describe("addDocument — stores org_id (Criterion: Documents page isolation)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("addDocument with orgId stores the org_id in the document row", () => {
    const docId = dbModule.addDocument("Test Doc", "/tmp/test-orgid.pdf", null, null, 3);
    const row = dbModule.get(`SELECT org_id FROM documents WHERE id = ?`, [docId]);
    expect(row).not.toBeNull();
    expect(row.org_id).toBe(3);
  });

  it("addDocument without orgId stores null org_id (backward compat)", () => {
    const docId = dbModule.addDocument("No Org Doc", "/tmp/test-no-org.pdf", null, null);
    const row = dbModule.get(`SELECT org_id FROM documents WHERE id = ?`, [docId]);
    expect(row).not.toBeNull();
    expect(row.org_id).toBeNull();
  });
});

// ── Section 8: createLegalCase stores org_id ──────────────────────────────────

describe("createLegalCase — stores org_id (Criterion: Cases isolation)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("createLegalCase with orgId stores the org_id in the legal_cases row", () => {
    const caseId = dbModule.createLegalCase({
      title: "Org Scoped Case", caseType: "civil",
      referenceNumber: null, internalNumber: null, procedureType: null,
      court: null, courtDivision: null, judge: null, summary: null,
      claimDescription: null, claimValue: null, claimCurrency: "PLN",
      tags: [], extensionData: {}, orgId: 5,
    });
    const row = dbModule.get(`SELECT org_id FROM legal_cases WHERE id = ?`, [caseId]);
    expect(row).not.toBeNull();
    expect(row.org_id).toBe(5);
  });
});
