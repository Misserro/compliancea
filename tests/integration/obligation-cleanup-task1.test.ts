/**
 * Integration tests for Plan 060, Task 1 — Hidden Contract Obligation Cleanup
 *
 * Tests use an in-memory sql.js database (same pattern as gdrive-per-org-task1-runtime.test.ts).
 *
 * Success criteria covered:
 * 1. deleteObligationsByDocumentId deletes tasks then obligations for a document
 * 2. deleteDocument calls deleteObligationsByDocumentId (obligations gone after deleteDocument)
 * 3. getOverdueObligations excludes archived and sync_status='deleted' contracts
 * 4. getUpcomingObligations excludes archived and sync_status='deleted' contracts
 * 5. getAllObligations excludes archived and sync_status='deleted' contracts
 * 6. getContractsWithSummaries overdue subquery excludes archived/deleted contracts (via WHERE not including them in results)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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
  DB_PATH: "/tmp/test-db-obligation-cleanup.sqlite",
  DOCUMENTS_DIR: "/tmp/test-docs",
  GDRIVE_DIR: "/tmp/test-gdrive",
  INVOICES_DIR: "/tmp/test-invoices",
  CONTRACT_ATTACHMENTS_DIR: "/tmp/test-ca",
  CASE_ATTACHMENTS_DIR: "/tmp/test-cases",
  DB_DIR: "/tmp/test-db",
  isRailway: false,
  ensureDirectories: vi.fn(),
}));

// @ts-ignore
import * as dbModule from "../../lib/db.js";

// Helpers

function insertDocument(db: any, opts: {
  name: string;
  path: string;
  orgId?: number;
  status?: string;
  syncStatus?: string | null;
  docType?: string;
  source?: string;
}) {
  const {
    name, path, orgId = 1, status = "active",
    syncStatus = null, docType = "contract", source = "gdrive"
  } = opts;
  db.run(
    `INSERT INTO documents (name, path, status, sync_status, doc_type, source, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, path, status, syncStatus, docType, source, orgId]
  );
  const rows = db.exec(`SELECT id FROM documents WHERE path = '${path}'`);
  return rows[0].values[0][0] as number;
}

function insertObligation(db: any, documentId: number, opts: {
  status?: string;
  dueDate?: string;
  stage?: string;
} = {}) {
  const { status = "active", dueDate = "2020-01-01", stage = "active" } = opts;
  db.run(
    `INSERT INTO contract_obligations (document_id, title, obligation_type, status, due_date, stage)
     VALUES (?, 'Test Obligation', 'others', ?, ?, ?)`,
    [documentId, status, dueDate, stage]
  );
  const rows = db.exec(
    `SELECT id FROM contract_obligations WHERE document_id = ${documentId} ORDER BY id DESC LIMIT 1`
  );
  return rows[0].values[0][0] as number;
}

function insertTask(db: any, obligationId: number) {
  db.run(
    `INSERT INTO tasks (title, status, obligation_id) VALUES ('Test Task', 'open', ?)`,
    [obligationId]
  );
}

function countObligations(db: any, documentId: number): number {
  const rows = db.exec(
    `SELECT COUNT(*) FROM contract_obligations WHERE document_id = ${documentId}`
  );
  return rows[0].values[0][0] as number;
}

function countTasks(db: any, obligationId: number): number {
  const rows = db.exec(
    `SELECT COUNT(*) FROM tasks WHERE obligation_id = ${obligationId}`
  );
  return rows.length > 0 ? (rows[0].values[0][0] as number) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Plan 060 — deleteObligationsByDocumentId", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("function is exported from db.js", () => {
    expect(typeof dbModule.deleteObligationsByDocumentId).toBe("function");
  });

  it("deletes obligations for the given document", () => {
    const db = dbModule.getDb();
    const docId = insertDocument(db, { name: "contract.pdf", path: "/tmp/contract.pdf" });
    insertObligation(db, docId);

    expect(countObligations(db, docId)).toBe(1);
    dbModule.deleteObligationsByDocumentId(docId);
    expect(countObligations(db, docId)).toBe(0);
  });

  it("deletes tasks linked to the document's obligations before deleting obligations", () => {
    const db = dbModule.getDb();
    const docId = insertDocument(db, { name: "contract2.pdf", path: "/tmp/contract2.pdf" });
    const obligationId = insertObligation(db, docId);
    insertTask(db, obligationId);

    expect(countTasks(db, obligationId)).toBe(1);
    dbModule.deleteObligationsByDocumentId(docId);
    expect(countTasks(db, obligationId)).toBe(0);
    expect(countObligations(db, docId)).toBe(0);
  });

  it("is idempotent — second call with same documentId succeeds with 0 rows affected", () => {
    const db = dbModule.getDb();
    const docId = insertDocument(db, { name: "contract3.pdf", path: "/tmp/contract3.pdf" });
    insertObligation(db, docId);

    dbModule.deleteObligationsByDocumentId(docId);
    expect(() => dbModule.deleteObligationsByDocumentId(docId)).not.toThrow();
    expect(countObligations(db, docId)).toBe(0);
  });

  it("does not delete obligations for other documents", () => {
    const db = dbModule.getDb();
    const docId1 = insertDocument(db, { name: "contract-a.pdf", path: "/tmp/contract-a.pdf" });
    const docId2 = insertDocument(db, { name: "contract-b.pdf", path: "/tmp/contract-b.pdf" });
    insertObligation(db, docId1);
    insertObligation(db, docId2);

    dbModule.deleteObligationsByDocumentId(docId1);
    expect(countObligations(db, docId1)).toBe(0);
    expect(countObligations(db, docId2)).toBe(1);
  });
});

describe("Plan 060 — deleteDocument cleans up obligations", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("deletes obligations when deleteDocument is called", () => {
    const db = dbModule.getDb();
    const docId = insertDocument(db, { name: "del-test.pdf", path: "/tmp/del-test.pdf" });
    insertObligation(db, docId);

    expect(countObligations(db, docId)).toBe(1);
    dbModule.deleteDocument(docId);
    expect(countObligations(db, docId)).toBe(0);
  });

  it("deletes tasks linked to obligations when deleteDocument is called", () => {
    const db = dbModule.getDb();
    const docId = insertDocument(db, { name: "del-task-test.pdf", path: "/tmp/del-task-test.pdf" });
    const obligationId = insertObligation(db, docId);
    insertTask(db, obligationId);

    dbModule.deleteDocument(docId);
    expect(countTasks(db, obligationId)).toBe(0);
  });
});

describe("Plan 060 — getOverdueObligations safety-net filters", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("excludes obligations from archived contracts", () => {
    const db = dbModule.getDb();
    // archived contract — obligations should NOT appear as overdue
    const archivedDocId = insertDocument(db, {
      name: "archived.pdf", path: "/tmp/archived.pdf",
      status: "archived"
    });
    insertObligation(db, archivedDocId, { dueDate: "2020-01-01", status: "active" });

    // active contract — obligations SHOULD appear as overdue
    const activeDocId = insertDocument(db, {
      name: "active.pdf", path: "/tmp/active.pdf",
      status: "active"
    });
    insertObligation(db, activeDocId, { dueDate: "2020-01-01", status: "active" });

    const overdue = dbModule.getOverdueObligations(1);
    const documentIds = overdue.map((o: any) => o.document_id);
    expect(documentIds).toContain(activeDocId);
    expect(documentIds).not.toContain(archivedDocId);
  });

  it("excludes obligations from sync_status='deleted' contracts", () => {
    const db = dbModule.getDb();
    const deletedDocId = insertDocument(db, {
      name: "gdrived-deleted.pdf", path: "/tmp/gdrived-deleted.pdf",
      syncStatus: "deleted"
    });
    insertObligation(db, deletedDocId, { dueDate: "2020-01-01", status: "active" });

    const activeDocId = insertDocument(db, {
      name: "gdrived-active.pdf", path: "/tmp/gdrived-active.pdf",
      syncStatus: "synced"
    });
    insertObligation(db, activeDocId, { dueDate: "2020-01-01", status: "active" });

    const overdue = dbModule.getOverdueObligations(1);
    const documentIds = overdue.map((o: any) => o.document_id);
    expect(documentIds).toContain(activeDocId);
    expect(documentIds).not.toContain(deletedDocId);
  });
});

describe("Plan 060 — getUpcomingObligations safety-net filters", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("excludes obligations from archived contracts", () => {
    const db = dbModule.getDb();
    // future due_date so it shows up in upcoming
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

    const archivedDocId = insertDocument(db, {
      name: "archived-upcoming.pdf", path: "/tmp/archived-upcoming.pdf",
      status: "archived"
    });
    insertObligation(db, archivedDocId, { dueDate: futureDate, status: "active" });

    const activeDocId = insertDocument(db, {
      name: "active-upcoming.pdf", path: "/tmp/active-upcoming.pdf",
      status: "active"
    });
    insertObligation(db, activeDocId, { dueDate: futureDate, status: "active" });

    const upcoming = dbModule.getUpcomingObligations(30, 1);
    const documentIds = upcoming.map((o: any) => o.document_id);
    expect(documentIds).toContain(activeDocId);
    expect(documentIds).not.toContain(archivedDocId);
  });

  it("excludes obligations from sync_status='deleted' contracts", () => {
    const db = dbModule.getDb();
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

    const deletedDocId = insertDocument(db, {
      name: "deleted-upcoming.pdf", path: "/tmp/deleted-upcoming.pdf",
      syncStatus: "deleted"
    });
    insertObligation(db, deletedDocId, { dueDate: futureDate, status: "active" });

    const activeDocId = insertDocument(db, {
      name: "active-upcoming2.pdf", path: "/tmp/active-upcoming2.pdf",
      syncStatus: "synced"
    });
    insertObligation(db, activeDocId, { dueDate: futureDate, status: "active" });

    const upcoming = dbModule.getUpcomingObligations(30, 1);
    const documentIds = upcoming.map((o: any) => o.document_id);
    expect(documentIds).toContain(activeDocId);
    expect(documentIds).not.toContain(deletedDocId);
  });
});

describe("Plan 060 — getAllObligations safety-net filters", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("excludes obligations from archived contracts", () => {
    const db = dbModule.getDb();
    const archivedDocId = insertDocument(db, {
      name: "archived-all.pdf", path: "/tmp/archived-all.pdf",
      status: "archived"
    });
    insertObligation(db, archivedDocId, { status: "active" });

    const activeDocId = insertDocument(db, {
      name: "active-all.pdf", path: "/tmp/active-all.pdf",
      status: "active"
    });
    insertObligation(db, activeDocId, { status: "active" });

    const all = dbModule.getAllObligations(1);
    const documentIds = all.map((o: any) => o.document_id);
    expect(documentIds).toContain(activeDocId);
    expect(documentIds).not.toContain(archivedDocId);
  });

  it("excludes obligations from sync_status='deleted' contracts", () => {
    const db = dbModule.getDb();
    const deletedDocId = insertDocument(db, {
      name: "deleted-all.pdf", path: "/tmp/deleted-all.pdf",
      syncStatus: "deleted"
    });
    insertObligation(db, deletedDocId, { status: "active" });

    const activeDocId = insertDocument(db, {
      name: "active-all2.pdf", path: "/tmp/active-all2.pdf",
      syncStatus: null
    });
    insertObligation(db, activeDocId, { status: "active" });

    const all = dbModule.getAllObligations(1);
    const documentIds = all.map((o: any) => o.document_id);
    expect(documentIds).toContain(activeDocId);
    expect(documentIds).not.toContain(deletedDocId);
  });
});

describe("Plan 060 — getContractsWithSummaries overdue count excludes archived/deleted", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("archived contract shows 0 overdue obligations in summary", () => {
    const db = dbModule.getDb();
    // Insert an archived gdrive contract with a past-due obligation
    const archivedDocId = insertDocument(db, {
      name: "archived-summary.pdf", path: "/tmp/archived-summary.pdf",
      status: "archived", syncStatus: "synced", source: "gdrive"
    });
    insertObligation(db, archivedDocId, { dueDate: "2020-01-01", status: "active" });

    const summaries = dbModule.getContractsWithSummaries(1);
    const archivedSummary = summaries.find((s: any) => s.id === archivedDocId);

    // Archived contract should not appear at all, or if it does, have 0 overdue
    if (archivedSummary) {
      expect(archivedSummary.overdueObligations).toBe(0);
    }
    // It's acceptable for the query to exclude archived docs entirely
  });

  it("sync_status='deleted' contract shows 0 overdue obligations in summary", () => {
    const db = dbModule.getDb();
    const deletedDocId = insertDocument(db, {
      name: "deleted-summary.pdf", path: "/tmp/deleted-summary.pdf",
      status: "active", syncStatus: "deleted", source: "gdrive"
    });
    insertObligation(db, deletedDocId, { dueDate: "2020-01-01", status: "active" });

    const summaries = dbModule.getContractsWithSummaries(1);
    const deletedSummary = summaries.find((s: any) => s.id === deletedDocId);

    // Deleted contract should not appear at all, or if it does, have 0 overdue
    if (deletedSummary) {
      expect(deletedSummary.overdueObligations).toBe(0);
    }
  });

  it("active contract with past-due obligations still shows correct overdue count", () => {
    const db = dbModule.getDb();
    const activeDocId = insertDocument(db, {
      name: "active-summary.pdf", path: "/tmp/active-summary.pdf",
      status: "active", syncStatus: "synced", source: "gdrive"
    });
    insertObligation(db, activeDocId, { dueDate: "2020-01-01", status: "active" });

    const summaries = dbModule.getContractsWithSummaries(1);
    const activeSummary = summaries.find((s: any) => s.id === activeDocId);
    expect(activeSummary).toBeDefined();
    expect(activeSummary.overdueObligations).toBe(1);
  });
});

describe("Plan 060 — db-imports.ts exports deleteObligationsByDocumentId", () => {
  it("deleteObligationsByDocumentId is accessible from db-imports", async () => {
    // Dynamic import to test the re-export
    // This will fail at parse time if the export is missing
    const dbImports = await import("../../src/lib/db-imports.js");
    expect(typeof (dbImports as any).deleteObligationsByDocumentId).toBe("function");
  });
});
