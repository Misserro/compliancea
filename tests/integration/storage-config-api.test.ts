/**
 * Integration tests for Task 1 (Plan 029): Storage Config Layer
 *
 * Tests verify against the plan's success criteria:
 * 1. encrypt("test") → decrypt(result) === "test"  [covered in unit tests]
 * 2. GET /api/org/storage without S3 configured returns { configured: false }
 * 3. PUT /api/org/storage with valid credentials: config persisted, secret NOT stored plaintext
 * 4. PUT /api/org/storage with invalid credentials: returns 400 before persisting anything
 * 5. POST /api/org/storage/test with valid S3 credentials returns { success: true }
 * 6. POST /api/org/storage/test with invalid bucket/credentials returns { success: false, error }
 * 7. DELETE /api/org/storage clears all s3* keys; subsequent GET returns { configured: false }
 * 8. All 8 ALTER TABLE migrations run without error
 *
 * Route handlers are imported directly. Mocks established before any imports:
 * - fs / paths  → DB never touches filesystem
 * - @/auth      → session controlled per test via mockAuth
 * - @/lib/server-utils → ensureDb no-op
 * - @aws-sdk/client-s3 → S3Client and HeadBucketCommand controlled per test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist variables that are referenced inside vi.mock() factories ────────────
// vi.mock() calls are hoisted to the top of the file by vitest — any variables
// they reference must also be hoisted via vi.hoisted() or they'll be undefined.
const { mockAuth, mockSend } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSend: vi.fn(),
}));

// ── Mock fs and paths (MUST be first — db.js checks these on import) ──────────
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
  DB_PATH: "/tmp/test-db-storage-cfg-fake.sqlite",
  DOCUMENTS_DIR: "/tmp/test-docs",
  GDRIVE_DIR: "/tmp/test-gdrive",
  INVOICES_DIR: "/tmp/test-invoices",
  CONTRACT_ATTACHMENTS_DIR: "/tmp/test-contract-attachments",
  CASE_ATTACHMENTS_DIR: "/tmp/test-case-attachments",
  DB_DIR: "/tmp/test-db",
  isRailway: false,
  ensureDirectories: vi.fn(),
}));

// ── Mock auth ─────────────────────────────────────────────────────────────────
vi.mock("@/auth", () => ({ auth: mockAuth }));

// ── Mock ensureDb (no-op in tests) ───────────────────────────────────────────
vi.mock("@/lib/server-utils", () => ({
  ensureDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  // S3Client must be a proper class (constructor) so `new S3Client(...)` works
  S3Client: class MockS3Client {
    send(...args: unknown[]) {
      return mockSend(...args);
    }
  },
  HeadBucketCommand: class MockHeadBucketCommand {
    constructor(params: unknown) {
      Object.assign(this as object, params as object);
    }
  },
}));

// ── Import db module and route handlers AFTER all mocks ──────────────────────
// @ts-ignore
import * as dbModule from "../../lib/db.js";

// Route handlers — imported once; they share the same db module instance via @/lib/db-imports
import { GET, PUT, DELETE } from "../../src/app/api/org/storage/route.js";
import { POST as TEST_POST } from "../../src/app/api/org/storage/test/route.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function ownerSession(orgId = 1) {
  return {
    user: { id: "1", orgId: String(orgId), orgRole: "owner", email: "owner@test.com" },
  };
}

function adminSession(orgId = 1) {
  return {
    user: { id: "2", orgId: String(orgId), orgRole: "admin", email: "admin@test.com" },
  };
}

function memberSession(orgId = 1) {
  return {
    user: { id: "3", orgId: String(orgId), orgRole: "member", email: "member@test.com" },
  };
}

const VALID_PAYLOAD = {
  bucket: "my-test-bucket",
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

const VALID_KEY_BASE64 = Buffer.from(
  "0123456789abcdef0123456789abcdef" // exactly 32 bytes ASCII
).toString("base64");

// Helper: clear all s3* settings for org 1
function clearS3Settings() {
  for (const key of [
    "s3Bucket",
    "s3Region",
    "s3AccessKeyId",
    "s3SecretEncrypted",
    "s3Endpoint",
  ]) {
    try {
      dbModule.run(
        `DELETE FROM app_settings WHERE org_id = 1 AND key = ?`,
        [key]
      );
    } catch {
      // ignore
    }
  }
}

// ── Section 1: DB Migrations — 8 ALTER TABLE columns ─────────────────────────

describe("DB Migrations — 8 storage columns (Criterion 8)", () => {
  beforeEach(async () => {
    await dbModule.initDb();
  });

  const expectedColumns: Array<{ table: string; column: string }> = [
    { table: "documents", column: "storage_backend" },
    { table: "documents", column: "storage_key" },
    { table: "contract_documents", column: "storage_backend" },
    { table: "contract_documents", column: "storage_key" },
    { table: "contract_invoices", column: "invoice_storage_backend" },
    { table: "contract_invoices", column: "invoice_storage_key" },
    { table: "contract_invoices", column: "payment_storage_backend" },
    { table: "contract_invoices", column: "payment_storage_key" },
  ];

  for (const { table, column } of expectedColumns) {
    it(`${table}.${column} exists after initDb()`, () => {
      const db = dbModule.getDb();
      const result = db.exec(`PRAGMA table_info(${table})`);
      expect(result.length).toBeGreaterThan(0);
      const columns = result[0].values.map((row: any[]) => row[1]);
      expect(columns).toContain(column);
    });
  }

  it("migrations are idempotent — calling initDb() twice does not throw", async () => {
    await expect(dbModule.initDb()).resolves.not.toThrow();
  });

  it("storage_backend defaults to 'local' on documents", () => {
    const db = dbModule.getDb();
    const result = db.exec(`PRAGMA table_info(documents)`);
    const storageBackendRow = result[0].values.find(
      (row: any[]) => row[1] === "storage_backend"
    );
    expect(storageBackendRow).toBeDefined();
    // PRAGMA table_info column index 4 = dflt_value
    expect(storageBackendRow[4]).toBe("'local'");
  });
});

// ── Section 2: GET /api/org/storage ──────────────────────────────────────────

describe("GET /api/org/storage (Criterion 2)", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockSend.mockReset();
    clearS3Settings();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 403 for member role", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("Criterion 2: returns { configured: false } when no S3 config stored", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ configured: false }));
  });

  it("returns { configured: true } with masked secret when config is stored", async () => {
    dbModule.setOrgSetting(1, "s3Bucket", "my-bucket");
    dbModule.setOrgSetting(1, "s3Region", "us-east-1");
    dbModule.setOrgSetting(1, "s3AccessKeyId", "AKIATEST");
    dbModule.setOrgSetting(
      1,
      "s3SecretEncrypted",
      '{"iv":"aabb","ciphertext":"ccddeeff","tag":"11223344"}'
    );
    dbModule.setOrgSetting(1, "s3Endpoint", "");

    mockAuth.mockResolvedValue(ownerSession());
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.bucket).toBe("my-bucket");
    expect(body.region).toBe("us-east-1");
    expect(body.accessKeyId).toBe("AKIATEST");
    expect(body.secretKey).toBe("*****");
    // Raw encrypted value must NOT appear in response
    expect(JSON.stringify(body)).not.toContain("ccddeeff");
  });

  it("admin role can also GET config", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ── Section 3: PUT /api/org/storage ──────────────────────────────────────────

describe("PUT /api/org/storage (Criteria 3 & 4)", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockSend.mockReset();
    clearS3Settings();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when bucket is missing", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const req = makeRequest("PUT", "http://localhost/api/org/storage", {
      region: "us-east-1",
      accessKeyId: "KEY",
      secretKey: "SECRET",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/bucket/i);
  });

  it("returns 400 when region is missing", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const req = makeRequest("PUT", "http://localhost/api/org/storage", {
      bucket: "my-bucket",
      accessKeyId: "KEY",
      secretKey: "SECRET",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/region/i);
  });

  it("returns 400 when accessKeyId is missing", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const req = makeRequest("PUT", "http://localhost/api/org/storage", {
      bucket: "my-bucket",
      region: "us-east-1",
      secretKey: "SECRET",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/access key/i);
  });

  it("returns 400 when secretKey is missing", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const req = makeRequest("PUT", "http://localhost/api/org/storage", {
      bucket: "my-bucket",
      region: "us-east-1",
      accessKeyId: "KEY",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/secret/i);
  });

  it("Criterion 4: returns 400 and does NOT persist when S3 test fails (NoSuchBucket)", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockRejectedValue({
      name: "NoSuchBucket",
      message: "The specified bucket does not exist",
      $metadata: { httpStatusCode: 404 },
    });

    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();

    // Nothing must be persisted
    const settings = dbModule.getOrgSettings(1);
    const config = Object.fromEntries(
      settings.map((s: { key: string; value: string }) => [s.key, s.value])
    );
    expect(config.s3SecretEncrypted).toBeUndefined();
    expect(config.s3Bucket).toBeUndefined();
  });

  it("Criterion 4: AccessDenied maps to descriptive error message", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockRejectedValue({
      name: "AccessDenied",
      message: "Access denied",
      $metadata: { httpStatusCode: 403 },
    });

    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/access denied/i);
  });

  it("Criterion 3: valid credentials → 200, config persisted, secret NOT stored plaintext", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockResolvedValue({});

    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const settings = dbModule.getOrgSettings(1);
    const config = Object.fromEntries(
      settings.map((s: { key: string; value: string }) => [s.key, s.value])
    );

    expect(config.s3Bucket).toBe(VALID_PAYLOAD.bucket);
    expect(config.s3Region).toBe(VALID_PAYLOAD.region);
    expect(config.s3AccessKeyId).toBe(VALID_PAYLOAD.accessKeyId);
    expect(config.s3SecretEncrypted).toBeDefined();

    // CRITICAL: secret must NOT be stored plaintext
    expect(config.s3SecretEncrypted).not.toBe(VALID_PAYLOAD.secretKey);
    const parsed = JSON.parse(config.s3SecretEncrypted);
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("ciphertext");
    expect(parsed).toHaveProperty("tag");
  });

  it("Criterion 3: encrypted secret is decryptable back to original (round-trip)", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockResolvedValue({});

    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    await PUT(req);

    const settings = dbModule.getOrgSettings(1);
    const config = Object.fromEntries(
      settings.map((s: { key: string; value: string }) => [s.key, s.value])
    );

    // @ts-ignore
    const { decrypt } = await import("../../lib/storage-crypto.js");
    expect(decrypt(config.s3SecretEncrypted)).toBe(VALID_PAYLOAD.secretKey);
  });

  it("admin role can also PUT config", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockSend.mockResolvedValue({});
    const req = makeRequest("PUT", "http://localhost/api/org/storage", VALID_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(200);
  });
});

// ── Section 4: POST /api/org/storage/test ────────────────────────────────────

describe("POST /api/org/storage/test (Criteria 5 & 6)", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockSend.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    expect(res.status).toBe(403);
  });

  it("Criterion 5: valid credentials → { success: true }", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockResolvedValue({});
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it("Criterion 6: NoSuchBucket → { success: false, error: 'Bucket not found' }", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockRejectedValue({
      name: "NoSuchBucket",
      message: "Not found",
      $metadata: { httpStatusCode: 404 },
    });
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/bucket not found/i);
  });

  it("Criterion 6: AccessDenied → { success: false, error contains 'access denied' }", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockRejectedValue({
      name: "AccessDenied",
      message: "Access denied",
      $metadata: { httpStatusCode: 403 },
    });
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/access denied/i);
  });

  it("Criterion 6: generic network error → { success: false, error: message }", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    mockSend.mockRejectedValue({
      name: "NetworkError",
      message: "Could not connect to endpoint",
      $metadata: {},
    });
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 400 when bucket is missing from POST body", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", {
      region: "us-east-1",
      accessKeyId: "KEY",
      secretKey: "SECRET",
    });
    const res = await TEST_POST(req);
    expect(res.status).toBe(400);
  });

  it("admin role can also POST /test", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockSend.mockResolvedValue({});
    const req = makeRequest("POST", "http://localhost/api/org/storage/test", VALID_PAYLOAD);
    const res = await TEST_POST(req);
    expect(res.status).toBe(200);
  });
});

// ── Section 5: DELETE /api/org/storage ───────────────────────────────────────

describe("DELETE /api/org/storage (Criterion 7)", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockSend.mockReset();

    // Pre-seed S3 config so DELETE has something to clear
    dbModule.setOrgSetting(1, "s3Bucket", "my-bucket");
    dbModule.setOrgSetting(1, "s3Region", "us-east-1");
    dbModule.setOrgSetting(1, "s3AccessKeyId", "AKIATEST");
    dbModule.setOrgSetting(
      1,
      "s3SecretEncrypted",
      '{"iv":"aabb","ciphertext":"ccddeeff","tag":"11223344"}'
    );
    dbModule.setOrgSetting(1, "s3Endpoint", "");
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 403 for admin role (DELETE is owner-only per spec)", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("returns 403 for member role", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("Criterion 7: returns 204 and clears all s3* keys", async () => {
    mockAuth.mockResolvedValue(ownerSession());
    const res = await DELETE();
    expect(res.status).toBe(204);

    const settings = dbModule.getOrgSettings(1);
    const config = Object.fromEntries(
      settings.map((s: { key: string; value: string }) => [s.key, s.value])
    );
    // After DELETE, s3SecretEncrypted must be null (stored as null) or absent
    const s3SecretValue = config.s3SecretEncrypted;
    // setOrgSetting with null stores a row with value=null — so it's null not undefined
    expect(s3SecretValue == null).toBe(true);
  });

  it("Criterion 7: subsequent GET returns { configured: false } after DELETE", async () => {
    mockAuth.mockResolvedValue(ownerSession());

    const deleteRes = await DELETE();
    expect(deleteRes.status).toBe(204);

    // GET with same session
    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body).toEqual(expect.objectContaining({ configured: false }));
  });
});

// ── Section 6: @aws-sdk/client-s3 package presence ───────────────────────────

describe("Package: @aws-sdk/client-s3 installed", () => {
  it("is listed in package.json dependencies", async () => {
    // @ts-ignore
    const pkg = await import("../../package.json", { assert: { type: "json" } });
    const deps = { ...pkg.default.dependencies, ...pkg.default.devDependencies };
    expect(deps["@aws-sdk/client-s3"]).toBeDefined();
  });
});
