/**
 * Runtime/DB integration tests for Task 1: GDrive engine refactor — per-org foundation
 * Plan 053 — Per-Org Google Drive Integration
 *
 * Tests use an in-memory sql.js database (same pattern as org-foundation.test.ts).
 *
 * Success criteria covered:
 * 1. is_historical column exists in documents table after initDb() (no migration error)
 * 2. documents inserted with org_id correctly store and return that org_id
 * 3. is_historical defaults to 0 on new document
 * 4. getOrgSetting / setOrgSetting round-trip works correctly
 * 5. Per-org setting isolation: org A and org B have independent settings
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
  DB_PATH: "/tmp/test-db-gdrive-runtime.sqlite",
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

describe("DB: is_historical column exists after initDb()", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("documents table has is_historical column", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(documents)`);
    expect(result.length).toBeGreaterThan(0);
    const columns = result[0].values.map((row: any[]) => row[1] as string);
    expect(columns).toContain("is_historical");
  });

  it("documents table also has org_id column (prerequisite for org-scoped inserts)", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(documents)`);
    const columns = result[0].values.map((row: any[]) => row[1] as string);
    expect(columns).toContain("org_id");
  });

  it("is_historical defaults to 0 on a new document insert", () => {
    const db = dbModule.getDb();
    db.run(
      `INSERT INTO documents (name, path, org_id) VALUES ('test.pdf', '/tmp/test.pdf', 1)`
    );
    const rows = db.exec(
      `SELECT is_historical FROM documents WHERE name = 'test.pdf'`
    );
    expect(rows.length).toBeGreaterThan(0);
    const value = rows[0].values[0][0];
    expect(value).toBe(0);
  });
});

describe("DB: scanGDrive-style insert stores correct org_id", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("document inserted with org_id=42 has org_id=42 and is_historical=0", () => {
    const db = dbModule.getDb();
    db.run(
      `INSERT INTO documents (name, path, source, gdrive_file_id, gdrive_modified_time, sync_status, org_id)
       VALUES ('contract.pdf', '/tmp/gdrive/contract.pdf', 'gdrive', 'gfile-abc', '2024-01-01T00:00:00Z', 'synced', 42)`
    );
    const rows = db.exec(
      `SELECT org_id, is_historical FROM documents WHERE gdrive_file_id = 'gfile-abc'`
    );
    expect(rows.length).toBeGreaterThan(0);
    const [orgId, isHistorical] = rows[0].values[0] as [number, number];
    expect(orgId).toBe(42);
    expect(isHistorical).toBe(0);
  });

  it("documents from different orgs share no rows when filtered by org_id", () => {
    const db = dbModule.getDb();
    db.run(
      `INSERT INTO documents (name, path, source, gdrive_file_id, sync_status, org_id)
       VALUES ('org1.pdf', '/tmp/org1.pdf', 'gdrive', 'gfile-org1', 'synced', 1)`
    );
    db.run(
      `INSERT INTO documents (name, path, source, gdrive_file_id, sync_status, org_id)
       VALUES ('org2.pdf', '/tmp/org2.pdf', 'gdrive', 'gfile-org2', 'synced', 2)`
    );
    const org1Rows = db.exec(
      `SELECT name FROM documents WHERE source = 'gdrive' AND org_id = 1`
    );
    const org2Rows = db.exec(
      `SELECT name FROM documents WHERE source = 'gdrive' AND org_id = 2`
    );
    expect(org1Rows[0].values.length).toBe(1);
    expect(org1Rows[0].values[0][0]).toBe("org1.pdf");
    expect(org2Rows[0].values.length).toBe(1);
    expect(org2Rows[0].values[0][0]).toBe("org2.pdf");
  });
});

describe("DB: getOrgSetting / setOrgSetting round-trip", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  it("setOrgSetting stores a value retrievable by getOrgSetting", () => {
    dbModule.setOrgSetting(1, "gdrive_service_account", '{"type":"service_account"}');
    const val = dbModule.getOrgSetting(1, "gdrive_service_account");
    expect(val).toBe('{"type":"service_account"}');
  });

  it("getOrgSetting returns null for a missing key", () => {
    const val = dbModule.getOrgSetting(99, "nonexistent_key");
    expect(val).toBeNull();
  });

  it("org A and org B have isolated gdrive_drive_id settings", () => {
    dbModule.setOrgSetting(1, "gdrive_drive_id", "drive-org-1");
    dbModule.setOrgSetting(2, "gdrive_drive_id", "drive-org-2");
    expect(dbModule.getOrgSetting(1, "gdrive_drive_id")).toBe("drive-org-1");
    expect(dbModule.getOrgSetting(2, "gdrive_drive_id")).toBe("drive-org-2");
  });

  it("updating a key via setOrgSetting replaces the old value", () => {
    dbModule.setOrgSetting(1, "gdrive_last_sync_time", "2024-01-01T00:00:00.000Z");
    dbModule.setOrgSetting(1, "gdrive_last_sync_time", "2024-06-01T12:00:00.000Z");
    const val = dbModule.getOrgSetting(1, "gdrive_last_sync_time");
    expect(val).toBe("2024-06-01T12:00:00.000Z");
  });

  it("all five GDRIVE_SETTINGS_KEYS can be stored and retrieved per org", () => {
    const keys = [
      "gdrive_service_account",
      "gdrive_drive_id",
      "gdrive_historical_cutoff",
      "gdrive_last_sync_time",
      "gdrive_enabled",
    ];
    for (const key of keys) {
      dbModule.setOrgSetting(5, key, `value-for-${key}`);
    }
    for (const key of keys) {
      expect(dbModule.getOrgSetting(5, key)).toBe(`value-for-${key}`);
    }
  });
});
