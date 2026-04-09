/**
 * Tests for Task 1: GDrive engine refactor — per-org foundation (static checks)
 * Plan 053 — Per-Org Google Drive Integration
 *
 * This file verifies source-level properties only (no DB runtime).
 * Runtime/DB tests are in gdrive-per-org-task1-runtime.test.ts
 *
 * Success criteria covered here:
 * 1. GDRIVE_SETTINGS_KEYS exported from src/lib/constants.ts with all five keys
 * 2. is_historical: number on Document interface (required)
 * 3. is_historical?: number on Contract interface (optional)
 * 4. gdrive.js is fully org-scoped (accepts orgId, uses getOrgSetting/setOrgSetting)
 * 5. gdrive-imports.ts re-exports shouldSync in addition to existing exports
 * 6. db.js contractMetadataColumns includes is_historical (INTEGER NOT NULL DEFAULT 0)
 * 7. updateDocumentMetadata allowedFields includes is_historical
 * 8. getContractsWithSummaries SELECT includes d.is_historical
 * 9. getOrgSetting and setOrgSetting are exported from db.js
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

// ── 1. GDRIVE_SETTINGS_KEYS constant ────────────────────────────────────────

describe("GDRIVE_SETTINGS_KEYS exported from src/lib/constants.ts", () => {
  it("exports GDRIVE_SETTINGS_KEYS", () => {
    const src = readSource("src/lib/constants.ts");
    expect(src).toMatch(/export\s+const\s+GDRIVE_SETTINGS_KEYS/);
  });

  it("contains gdrive_service_account key", () => {
    const src = readSource("src/lib/constants.ts");
    expect(src).toContain("'gdrive_service_account'");
  });

  it("contains gdrive_drive_id key", () => {
    const src = readSource("src/lib/constants.ts");
    expect(src).toContain("'gdrive_drive_id'");
  });

  it("contains gdrive_historical_cutoff key", () => {
    const src = readSource("src/lib/constants.ts");
    expect(src).toContain("'gdrive_historical_cutoff'");
  });

  it("contains gdrive_last_sync_time key", () => {
    const src = readSource("src/lib/constants.ts");
    expect(src).toContain("'gdrive_last_sync_time'");
  });

  it("contains gdrive_enabled key", () => {
    const src = readSource("src/lib/constants.ts");
    expect(src).toContain("'gdrive_enabled'");
  });
});

// ── 2. TypeScript interfaces ─────────────────────────────────────────────────

describe("is_historical typed on Document and Contract in src/lib/types.ts", () => {
  it("Document interface has is_historical: number (non-optional)", () => {
    const src = readSource("src/lib/types.ts");
    expect(src).toMatch(/is_historical:\s*number;/);
  });

  it("Contract interface has is_historical?: number (optional)", () => {
    const src = readSource("src/lib/types.ts");
    expect(src).toMatch(/is_historical\?:\s*number;/);
  });
});

// ── 3. gdrive.js org-scoping ─────────────────────────────────────────────────

describe("lib/gdrive.js is fully org-scoped", () => {
  it("no longer imports getAppSetting", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).not.toContain("getAppSetting");
  });

  it("imports getOrgSetting from db.js", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toContain("getOrgSetting");
  });

  it("imports setOrgSetting from db.js", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toContain("setOrgSetting");
  });

  it("getDriveClient accepts orgId parameter", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/function\s+getDriveClient\s*\(\s*orgId\s*\)/);
  });

  it("getDriveId accepts orgId (renamed from getFolderId)", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/function\s+getDriveId\s*\(\s*orgId\s*\)/);
    // Verify the old top-level function declaration is gone (getFolderId as a function def)
    expect(src).not.toMatch(/^function\s+getFolderId/m);
    expect(src).not.toMatch(/^export\s+function\s+getFolderId/m);
  });

  it("exported getGDriveStatus accepts orgId", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/export\s+function\s+getGDriveStatus\s*\(\s*orgId\s*\)/);
  });

  it("exported scanGDrive accepts orgId", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/export\s+async\s+function\s+scanGDrive\s*\(\s*orgId\s*\)/);
  });

  it("exported shouldSync accepts orgId", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/export\s+function\s+shouldSync\s*\(\s*orgId\s*\)/);
  });

  it("no module-level lastSyncTime variable", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).not.toMatch(/^let\s+lastSyncTime/m);
  });

  it("uses Map-based per-org client cache", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toContain("new Map()");
  });

  it("INSERT INTO documents includes org_id column and binding", () => {
    const src = readSource("lib/gdrive.js");
    // The INSERT statement should list org_id in column list
    expect(src).toMatch(/INSERT\s+INTO\s+documents\s*\([^)]*org_id[^)]*\)/s);
  });

  it("existing-docs query filters by org_id = ?", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/WHERE\s+source\s*=\s*'gdrive'.*AND\s+org_id\s*=\s*\?/s);
  });

  it("scanGDrive persists lastSyncTime via setOrgSetting", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/setOrgSetting\s*\(\s*orgId/);
    expect(src).toContain("gdrive_last_sync_time");
  });

  it("shouldSync reads lastSyncTime via getOrgSetting", () => {
    const src = readSource("lib/gdrive.js");
    expect(src).toMatch(/getOrgSetting\s*\(\s*orgId\s*,\s*'gdrive_last_sync_time'\s*\)/);
  });
});

// ── 4. gdrive-imports.ts ─────────────────────────────────────────────────────

describe("src/lib/gdrive-imports.ts re-exports updated signatures", () => {
  it("re-exports scanGDrive", () => {
    const src = readSource("src/lib/gdrive-imports.ts");
    expect(src).toContain("scanGDrive");
  });

  it("re-exports getGDriveStatus", () => {
    const src = readSource("src/lib/gdrive-imports.ts");
    expect(src).toContain("getGDriveStatus");
  });

  it("re-exports shouldSync", () => {
    const src = readSource("src/lib/gdrive-imports.ts");
    expect(src).toContain("shouldSync");
  });
});

// ── 5. db.js migration and allowlist ────────────────────────────────────────

describe("lib/db.js migration and allowlist for is_historical", () => {
  it("contractMetadataColumns includes is_historical entry", () => {
    const src = readSource("lib/db.js");
    expect(src).toContain("is_historical");
  });

  it("is_historical definition is INTEGER NOT NULL DEFAULT 0", () => {
    const src = readSource("lib/db.js");
    expect(src).toMatch(/is_historical.*INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/);
  });

  it("updateDocumentMetadata allowedFields includes is_historical", () => {
    const src = readSource("lib/db.js");
    // The allowedFields array in updateDocumentMetadata must contain "is_historical"
    // We match the function body up to the closing bracket of allowedFields
    const fnStart = src.indexOf("function updateDocumentMetadata");
    expect(fnStart).toBeGreaterThan(-1);
    const fnSlice = src.slice(fnStart, fnStart + 1000);
    expect(fnSlice).toContain("is_historical");
  });

  it("getContractsWithSummaries SELECT lists d.is_historical", () => {
    const src = readSource("lib/db.js");
    expect(src).toMatch(/d\.is_historical/);
  });

  it("getOrgSetting is exported", () => {
    const src = readSource("lib/db.js");
    expect(src).toMatch(/export\s+function\s+getOrgSetting/);
  });

  it("setOrgSetting is exported", () => {
    const src = readSource("lib/db.js");
    expect(src).toMatch(/export\s+function\s+setOrgSetting/);
  });
});
