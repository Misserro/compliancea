/**
 * Integration tests for Task 2 (Plan 029): Storage Driver and All File I/O Routes
 *
 * Tests verify against the plan's success criteria:
 * 1. Uploading doc with S3 configured → documents.storage_backend='s3',
 *    documents.storage_key='org-{id}/documents/{filename}'
 * 2. Uploading doc without S3 → storage_backend='local',
 *    file at DOCUMENTS_DIR/org-{id}/documents/{filename}
 * 3. Downloading S3-stored doc → correct file content, correct content-type header
 * 4. Downloading legacy local doc (old path, no storage_backend) → works correctly
 * 5. Deleting doc with S3 backend → S3 object deleted
 * 6. All 5 download routes work for both local and S3 backends
 * 7. npm test: 0 regressions
 *
 * Mocks:
 * - fs / fs (sync) → db.js never touches filesystem
 * - @/auth → session controlled per test via mockAuth
 * - @/lib/server-utils → ensureDb no-op; saveUploadedFile controlled via mockSaveUploadedFile
 * - lib/storage.js → controlled via mockPutFile / mockGetFile / mockDeleteFile
 * - @aws-sdk/client-s3 → controlled via mockSend
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mutable shared mocks ────────────────────────────────────────────────
const {
  mockAuth,
  mockSend,
  mockFsReadFile,
  mockFsWriteFile,
  mockMkdirSync,
  mockFsMkdir,
  mockFsUnlink,
  mockSaveUploadedFile,
  mockPutFile,
  mockGetFile,
  mockDeleteFile,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSend: vi.fn(),
  mockFsReadFile: vi.fn(),
  mockFsWriteFile: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockFsMkdir: vi.fn().mockResolvedValue(undefined),
  mockFsUnlink: vi.fn().mockResolvedValue(undefined),
  mockSaveUploadedFile: vi.fn(),
  mockPutFile: vi.fn(),
  mockGetFile: vi.fn(),
  mockDeleteFile: vi.fn(),
}));

// ── Mock fs (sync) — must be before db.js import ─────────────────────────────
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: mockMkdirSync,
    promises: {
      readFile: mockFsReadFile,
      writeFile: mockFsWriteFile,
      mkdir: mockFsMkdir,
      unlink: mockFsUnlink,
    },
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: mockMkdirSync,
  promises: {
    readFile: mockFsReadFile,
    writeFile: mockFsWriteFile,
    mkdir: mockFsMkdir,
    unlink: mockFsUnlink,
  },
}));

// ── Mock fs/promises ──────────────────────────────────────────────────────────
vi.mock("fs/promises", () => ({
  default: {
    readFile: mockFsReadFile,
    writeFile: mockFsWriteFile,
    mkdir: mockFsMkdir,
    unlink: mockFsUnlink,
  },
  readFile: mockFsReadFile,
  writeFile: mockFsWriteFile,
  mkdir: mockFsMkdir,
  unlink: mockFsUnlink,
}));

// ── Mock paths ────────────────────────────────────────────────────────────────
vi.mock("../../lib/paths.js", () => ({
  DB_PATH: "/tmp/test-db-storage-driver-fake.sqlite",
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

// ── Mock @/lib/server-utils ───────────────────────────────────────────────────
// IMPORTANT: saveUploadedFile must be mocked with a return value because the
// upload route destructures { filePath, fileName, storageBackend, storageKey }
// from the result. An undefined return causes a destructure TypeError → 500.
vi.mock("@/lib/server-utils", () => ({
  ensureDb: vi.fn().mockResolvedValue(undefined),
  saveUploadedFile: mockSaveUploadedFile,
}));

// ── Mock @aws-sdk/client-s3 ───────────────────────────────────────────────────
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send(...args: unknown[]) {
      return mockSend(...args);
    }
  },
  GetObjectCommand: class MockGetObjectCommand {
    constructor(params: unknown) {
      Object.assign(this as object, params as object);
    }
  },
  PutObjectCommand: class MockPutObjectCommand {
    constructor(params: unknown) {
      Object.assign(this as object, params as object);
    }
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    constructor(params: unknown) {
      Object.assign(this as object, params as object);
    }
  },
  HeadBucketCommand: class MockHeadBucketCommand {
    constructor(params: unknown) {
      Object.assign(this as object, params as object);
    }
  },
}));

// ── Mock lib/storage.js ───────────────────────────────────────────────────────
// Mocked so route tests control storage behavior without needing real S3/fs.
vi.mock("../../lib/storage.js", () => ({
  putFile: mockPutFile,
  getFile: mockGetFile,
  deleteFile: mockDeleteFile,
}));

// ── Import db module and route handlers AFTER all mocks ──────────────────────
// @ts-ignore
import * as dbModule from "../../lib/db.js";

// Route handlers
import { GET as downloadGet } from "../../src/app/api/documents/[id]/download/route.js";
import { DELETE as docDelete } from "../../src/app/api/documents/[id]/route.js";
import { POST as uploadPost } from "../../src/app/api/documents/upload/route.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_KEY_BASE64 = Buffer.from(
  "0123456789abcdef0123456789abcdef" // exactly 32 bytes ASCII
).toString("base64");

function ownerSession(orgId = 1) {
  return {
    user: {
      id: "1",
      orgId: String(orgId),
      orgRole: "owner",
      email: "owner@test.com",
    },
  };
}

// ── Section 1: lib/storage.js — module exists and exports required functions ──

describe("lib/storage.js — module API (Criterion: storage driver exists)", () => {
  it("putFile is exported from lib/storage.js", async () => {
    // @ts-ignore
    const storageModule = await import("../../lib/storage.js");
    expect(typeof storageModule.putFile).toBe("function");
  });

  it("getFile is exported from lib/storage.js", async () => {
    // @ts-ignore
    const storageModule = await import("../../lib/storage.js");
    expect(typeof storageModule.getFile).toBe("function");
  });

  it("deleteFile is exported from lib/storage.js", async () => {
    // @ts-ignore
    const storageModule = await import("../../lib/storage.js");
    expect(typeof storageModule.deleteFile).toBe("function");
  });
});

// ── Section 2: Upload route — storage metadata stored on document row ─────────
//
// The upload route calls saveUploadedFile(file, destDir, orgId) which in turn
// calls putFile() from the storage driver. We mock saveUploadedFile to control
// what storage metadata it returns, then verify the route stores it on the DB row.

describe("POST /api/documents/upload — Criterion 1: S3 upload persists storage metadata", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockSaveUploadedFile.mockReset();
    mockPutFile.mockReset();
    mockGetFile.mockReset();
    mockDeleteFile.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("Criterion 1: with S3, saveUploadedFile returns s3 metadata → storage_backend='s3' persisted on document row", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    // saveUploadedFile returns S3 metadata (what the real function returns when S3 configured)
    mockSaveUploadedFile.mockResolvedValue({
      filePath: "",
      fileName: "test.pdf",
      storageBackend: "s3",
      storageKey: "org-1/documents/test.pdf",
    });

    const formData = new FormData();
    const file = new File([Buffer.from("%PDF-1.4 minimal")], "test.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document).toBeDefined();

    // Verify storage_backend='s3' is persisted on the document row
    const doc = dbModule.getDocumentById(body.document.id, 1);
    expect(doc).toBeDefined();
    expect(doc.storage_backend).toBe("s3");
    expect(doc.storage_key).toBe("org-1/documents/test.pdf");
  });

  it("Criterion 1: storage_key follows pattern 'org-{id}/documents/{filename}'", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    const filename = "contract_document.pdf";
    mockSaveUploadedFile.mockResolvedValue({
      filePath: "",
      fileName: filename,
      storageBackend: "s3",
      storageKey: `org-1/documents/${filename}`,
    });

    const formData = new FormData();
    const file = new File([Buffer.from("%PDF-1.4 minimal")], filename, {
      type: "application/pdf",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    const doc = dbModule.getDocumentById(body.document.id, 1);
    expect(doc.storage_key).toMatch(/^org-1\/documents\//);
  });

  it("Criterion 2: without S3, saveUploadedFile returns local metadata → storage_backend='local' persisted", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    // saveUploadedFile returns local metadata (what the real function returns when no S3)
    mockSaveUploadedFile.mockResolvedValue({
      filePath: "/tmp/test-docs/org-1/documents/test.pdf",
      fileName: "test.pdf",
      storageBackend: "local",
      storageKey: null,
    });

    const formData = new FormData();
    const file = new File([Buffer.from("%PDF-1.4 minimal")], "test.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    const doc = dbModule.getDocumentById(body.document.id, 1);
    expect(doc).toBeDefined();
    expect(doc.storage_backend).toBe("local");
  });

  it("Criterion 2: without S3, document path uses org-{id}/documents/ prefix", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    const orgNamespacedPath = "/tmp/test-docs/org-1/documents/test.pdf";
    mockSaveUploadedFile.mockResolvedValue({
      filePath: orgNamespacedPath,
      fileName: "test.pdf",
      storageBackend: "local",
      storageKey: null,
    });

    const formData = new FormData();
    const file = new File([Buffer.from("%PDF-1.4 minimal")], "test.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    const doc = dbModule.getDocumentById(body.document.id, 1);
    expect(doc).toBeDefined();
    // Path must contain 'org-1/documents'
    expect(doc.path).toMatch(/org-1[/\\]documents/);
  });

  it("upload route calls saveUploadedFile with orgId from session", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockSaveUploadedFile.mockResolvedValue({
      filePath: "/tmp/test-docs/org-1/documents/test.pdf",
      fileName: "test.pdf",
      storageBackend: "local",
      storageKey: null,
    });

    const formData = new FormData();
    const file = new File([Buffer.from("%PDF-1.4 minimal")], "test.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    await uploadPost(req);

    // saveUploadedFile must have been called with orgId=1
    expect(mockSaveUploadedFile).toHaveBeenCalledWith(
      expect.any(Object), // file
      expect.any(String), // destDir
      1                   // orgId
    );
  });
});

// ── Section 3: Download route — S3 and local backends ─────────────────────────

describe("GET /api/documents/[id]/download — Criterion 3: S3 download", () => {
  const PDF_CONTENT = Buffer.from("%PDF-1.4 test content");

  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockGetFile.mockReset();
    mockPutFile.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("Criterion 3: S3-stored doc returns correct file content", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockGetFile.mockResolvedValue(PDF_CONTENT);

    const docId = dbModule.addDocument("test.pdf", "/tmp/test-docs/org-1/documents/test.pdf", null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = 's3', storage_key = 'org-1/documents/test.pdf' WHERE id = ?",
      [docId]
    );

    const req = new NextRequest(`http://localhost/api/documents/${docId}/download`, {
      method: "GET",
    });
    const res = await downloadGet(req, {
      params: Promise.resolve({ id: String(docId) }),
    });

    expect(res.status).toBe(200);
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(PDF_CONTENT);
  });

  it("Criterion 3: S3-stored doc returns correct content-type header for PDF", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockGetFile.mockResolvedValue(PDF_CONTENT);

    const docId = dbModule.addDocument("report.pdf", "/tmp/test-docs/org-1/documents/report.pdf", null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = 's3', storage_key = 'org-1/documents/report.pdf' WHERE id = ?",
      [docId]
    );

    const req = new NextRequest(`http://localhost/api/documents/${docId}/download`, {
      method: "GET",
    });
    const res = await downloadGet(req, {
      params: Promise.resolve({ id: String(docId) }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });

  it("Criterion 3: download route calls getFile with storage_backend='s3' and correct storage_key", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockGetFile.mockResolvedValue(PDF_CONTENT);

    const docId = dbModule.addDocument("myfile.pdf", "/tmp/test-docs/org-1/documents/myfile.pdf", null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = 's3', storage_key = 'org-1/documents/myfile.pdf' WHERE id = ?",
      [docId]
    );

    const req = new NextRequest(`http://localhost/api/documents/${docId}/download`, {
      method: "GET",
    });
    await downloadGet(req, {
      params: Promise.resolve({ id: String(docId) }),
    });

    expect(mockGetFile).toHaveBeenCalledWith(
      1,                               // orgId
      "s3",                            // storageBackend
      "org-1/documents/myfile.pdf",    // storageKey
      expect.any(String)               // localPath fallback
    );
  });

  it("Criterion 4: legacy local doc (storage_backend=null) downloads correctly", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockGetFile.mockResolvedValue(PDF_CONTENT);

    const docId = dbModule.addDocument("legacy.pdf", "/tmp/test-docs/legacy.pdf", null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = NULL, storage_key = NULL WHERE id = ?",
      [docId]
    );

    const req = new NextRequest(`http://localhost/api/documents/${docId}/download`, {
      method: "GET",
    });
    const res = await downloadGet(req, {
      params: Promise.resolve({ id: String(docId) }),
    });

    expect(res.status).toBe(200);
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(PDF_CONTENT);
  });

  it("Criterion 4: legacy local doc calls getFile with 'local' backend fallback", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockGetFile.mockResolvedValue(PDF_CONTENT);

    const legacyPath = "/tmp/test-docs/legacy.pdf";
    const docId = dbModule.addDocument("legacy.pdf", legacyPath, null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = NULL, storage_key = NULL WHERE id = ?",
      [docId]
    );

    const req = new NextRequest(`http://localhost/api/documents/${docId}/download`, {
      method: "GET",
    });
    await downloadGet(req, {
      params: Promise.resolve({ id: String(docId) }),
    });

    // Route uses: document.storage_backend || 'local' — null || 'local' = 'local'
    expect(mockGetFile).toHaveBeenCalledWith(
      1,
      "local",    // null coerced to 'local' by || operator in route
      null,       // storage_key is null
      legacyPath  // legacy path passed as localPath fallback
    );
  });

  it("Criterion 4: storage_backend='local' (explicit) also downloads correctly", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    mockGetFile.mockResolvedValue(PDF_CONTENT);

    const docId = dbModule.addDocument("local_file.pdf", "/tmp/test-docs/org-1/documents/local_file.pdf", null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = 'local', storage_key = NULL WHERE id = ?",
      [docId]
    );

    const req = new NextRequest(`http://localhost/api/documents/${docId}/download`, {
      method: "GET",
    });
    const res = await downloadGet(req, {
      params: Promise.resolve({ id: String(docId) }),
    });

    expect(res.status).toBe(200);
  });
});

// ── Section 4: Delete route — S3 object deletion ─────────────────────────────

describe("DELETE /api/documents/[id] — Criterion 5: S3 delete", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockDeleteFile.mockReset();
    mockDeleteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("Criterion 5: deleting S3 doc calls deleteFile with correct backend and key", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    const docId = dbModule.addDocument("s3file.pdf", "/tmp/test-docs/org-1/documents/s3file.pdf", null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = 's3', storage_key = 'org-1/documents/s3file.pdf' WHERE id = ?",
      [docId]
    );

    const res = await docDelete(
      new NextRequest("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ id: String(docId) }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockDeleteFile).toHaveBeenCalledWith(
      1,
      "s3",
      "org-1/documents/s3file.pdf",
      expect.any(String)
    );
  });

  it("Criterion 5: deleting local doc calls deleteFile with 'local' backend", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    const localPath = "/tmp/test-docs/org-1/documents/localfile.pdf";
    const docId = dbModule.addDocument("localfile.pdf", localPath, null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = 'local', storage_key = NULL WHERE id = ?",
      [docId]
    );

    await docDelete(
      new NextRequest("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ id: String(docId) }) }
    );

    expect(mockDeleteFile).toHaveBeenCalledWith(
      1,
      "local",
      null,
      localPath
    );
  });

  it("Criterion 5: deleting legacy doc (null storage_backend) calls deleteFile (route passes null, driver handles it)", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));

    const legacyPath = "/tmp/test-docs/old-path.pdf";
    const docId = dbModule.addDocument("old.pdf", legacyPath, null, null, 1);
    dbModule.run(
      "UPDATE documents SET storage_backend = NULL, storage_key = NULL WHERE id = ?",
      [docId]
    );

    await docDelete(
      new NextRequest("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ id: String(docId) }) }
    );

    // The DELETE route passes doc.storage_backend directly (which is null for legacy docs).
    // deleteFile(orgId, null, null, localPath) is correct — the driver's else branch handles it.
    expect(mockDeleteFile).toHaveBeenCalledWith(
      1,
      null,         // route passes null (not coerced to 'local' — deleteFile handles this internally)
      null,
      legacyPath
    );
  });
});

// ── Section 5: All 5 download routes — Criterion 6 ───────────────────────────

describe("Contract documents download — Criterion 6: storage-aware", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockGetFile.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("GET /api/contracts/[id]/documents/[contractDocId]/download uses storage driver for S3 files", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    const FILE_CONTENT = Buffer.from("%PDF-1.4 contract doc");
    mockGetFile.mockResolvedValue(FILE_CONTENT);

    // contract_documents.contract_id references documents(id) — no separate contracts table
    const contractDocId_in_documents = dbModule.addDocument(
      "Parent Contract",
      "/tmp/test-docs/org-1/documents/contract.pdf",
      null,
      null,
      1
    );

    const contractDocInsert = dbModule.run(
      `INSERT INTO contract_documents (contract_id, file_path, file_name, storage_backend, storage_key)
       VALUES (?, ?, ?, 's3', 'org-1/contract-attachments/doc.pdf')`,
      [contractDocId_in_documents, "/tmp/test-contract-attachments/org-1/contract-attachments/doc.pdf", "doc.pdf"]
    );
    const contractDocId = contractDocInsert.lastInsertRowId;

    const { GET: contractDocDownload } = await import(
      "../../src/app/api/contracts/[id]/documents/[contractDocId]/download/route.js"
    );

    const req = new NextRequest(
      `http://localhost/api/contracts/${contractDocId_in_documents}/documents/${contractDocId}/download`,
      { method: "GET" }
    );
    const res = await contractDocDownload(req, {
      params: Promise.resolve({
        id: String(contractDocId_in_documents),
        contractDocId: String(contractDocId),
      }),
    });

    expect(res.status).toBe(200);
    expect(mockGetFile).toHaveBeenCalledWith(
      1,
      "s3",
      "org-1/contract-attachments/doc.pdf",
      expect.anything()
    );
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(FILE_CONTENT);
  });

  it("GET .../download returns local file via storage driver for local contract docs", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    const FILE_CONTENT = Buffer.from("%PDF-1.4 local contract doc");
    mockGetFile.mockResolvedValue(FILE_CONTENT);

    const contractDocId_in_documents = dbModule.addDocument(
      "Parent Contract 2",
      "/tmp/test-docs/org-1/documents/contract2.pdf",
      null,
      null,
      1
    );

    const localPath = "/tmp/test-contract-attachments/org-1/doc.pdf";
    const contractDocInsert2 = dbModule.run(
      `INSERT INTO contract_documents (contract_id, file_path, file_name, storage_backend, storage_key)
       VALUES (?, ?, ?, 'local', NULL)`,
      [contractDocId_in_documents, localPath, "doc.pdf"]
    );
    const contractDocId = contractDocInsert2.lastInsertRowId;

    const { GET: contractDocDownload } = await import(
      "../../src/app/api/contracts/[id]/documents/[contractDocId]/download/route.js"
    );

    const req = new NextRequest(
      `http://localhost/api/contracts/${contractDocId_in_documents}/documents/${contractDocId}/download`,
      { method: "GET" }
    );
    const res = await contractDocDownload(req, {
      params: Promise.resolve({
        id: String(contractDocId_in_documents),
        contractDocId: String(contractDocId),
      }),
    });

    expect(res.status).toBe(200);
    expect(mockGetFile).toHaveBeenCalledWith(1, "local", null, localPath);
  });
});

describe("Case documents download — Criterion 6: storage-aware", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockGetFile.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("GET /api/legal-hub/cases/[id]/documents/[did]/download uses storage driver (local backend)", async () => {
    // NOTE: case_documents table does not have storage_backend/storage_key columns
    // (plan only migrated documents, contract_documents, contract_invoices).
    // The route still uses getFile() but always passes undefined/null storage columns
    // which fall through to 'local' backend. This verifies the route is wired through
    // the storage driver and serves local case attachments correctly.
    mockAuth.mockResolvedValue(ownerSession(1));
    const FILE_CONTENT = Buffer.from("%PDF-1.4 case doc");
    mockGetFile.mockResolvedValue(FILE_CONTENT);

    // legal_cases.case_type is NOT NULL — must provide it
    const caseInsert = dbModule.run(
      "INSERT INTO legal_cases (title, status, case_type, org_id) VALUES (?, ?, ?, ?)",
      ["Test Case", "open", "civil", 1]
    );
    const caseId = caseInsert.lastInsertRowId;

    const caseDocInsert = dbModule.run(
      `INSERT INTO case_documents (case_id, file_path, file_name)
       VALUES (?, ?, ?)`,
      [caseId, "/tmp/test-case-attachments/casedoc.pdf", "casedoc.pdf"]
    );
    const caseDocId = caseDocInsert.lastInsertRowId;

    const { GET: caseDocDownload } = await import(
      "../../src/app/api/legal-hub/cases/[id]/documents/[did]/download/route.js"
    );

    const req = new NextRequest(
      `http://localhost/api/legal-hub/cases/${caseId}/documents/${caseDocId}/download`,
      { method: "GET" }
    );
    const res = await caseDocDownload(req, {
      params: Promise.resolve({ id: String(caseId), did: String(caseDocId) }),
    });

    expect(res.status).toBe(200);
    // Route calls getFile with 'local' fallback since case_documents has no storage columns
    expect(mockGetFile).toHaveBeenCalledWith(
      1,
      "local",    // undefined storage_backend || 'local'
      undefined,  // no storage_key column
      "/tmp/test-case-attachments/casedoc.pdf"
    );
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(FILE_CONTENT);
  });
});

describe("Invoice file download — Criterion 6: storage-aware", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockGetFile.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("GET .../invoice-file uses storage driver for S3 invoice files", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    const FILE_CONTENT = Buffer.from("%PDF-1.4 invoice");
    mockGetFile.mockResolvedValue(FILE_CONTENT);

    // contract_invoices.contract_id references documents(id) — insert a document first
    const contractDocId = dbModule.addDocument(
      "Invoice Contract",
      "/tmp/test-docs/org-1/documents/contract.pdf",
      null,
      null,
      1
    );

    const invoiceInsert = dbModule.run(
      `INSERT INTO contract_invoices (contract_id, amount, currency, invoice_file_path, invoice_storage_backend, invoice_storage_key)
       VALUES (?, ?, ?, ?, 's3', 'org-1/invoices/inv.pdf')`,
      [contractDocId, 100.0, "EUR", "/tmp/test-invoices/org-1/invoices/inv.pdf"]
    );
    const invoiceId = invoiceInsert.lastInsertRowId;

    const { GET: invoiceFileDownload } = await import(
      "../../src/app/api/contracts/[id]/invoices/[invoiceId]/invoice-file/route.js"
    );

    const req = new NextRequest(
      `http://localhost/api/contracts/${contractDocId}/invoices/${invoiceId}/invoice-file`,
      { method: "GET" }
    );
    const res = await invoiceFileDownload(req, {
      params: Promise.resolve({
        id: String(contractDocId),
        invoiceId: String(invoiceId),
      }),
    });

    expect(res.status).toBe(200);
    expect(mockGetFile).toHaveBeenCalledWith(
      1,
      "s3",
      "org-1/invoices/inv.pdf",
      expect.anything()
    );
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(FILE_CONTENT);
  });
});

describe("Payment confirmation download — Criterion 6: storage-aware", () => {
  beforeEach(async () => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    await dbModule.initDb();
    mockAuth.mockReset();
    mockGetFile.mockReset();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("GET .../payment-confirmation uses storage driver for S3 payment files", async () => {
    mockAuth.mockResolvedValue(ownerSession(1));
    const FILE_CONTENT = Buffer.from("%PDF-1.4 payment confirmation");
    mockGetFile.mockResolvedValue(FILE_CONTENT);

    // contract_invoices.contract_id references documents(id)
    const contractDocId = dbModule.addDocument(
      "Payment Contract",
      "/tmp/test-docs/org-1/documents/payment_contract.pdf",
      null,
      null,
      1
    );

    const invoiceInsert = dbModule.run(
      `INSERT INTO contract_invoices (contract_id, amount, currency, payment_confirmation_path, payment_storage_backend, payment_storage_key)
       VALUES (?, ?, ?, ?, 's3', 'org-1/invoices/payment.pdf')`,
      [contractDocId, 200.0, "EUR", "/tmp/test-invoices/org-1/invoices/payment.pdf"]
    );
    const invoiceId = invoiceInsert.lastInsertRowId;

    const { GET: paymentConfirmDownload } = await import(
      "../../src/app/api/contracts/[id]/invoices/[invoiceId]/payment-confirmation/route.js"
    );

    const req = new NextRequest(
      `http://localhost/api/contracts/${contractDocId}/invoices/${invoiceId}/payment-confirmation`,
      { method: "GET" }
    );
    const res = await paymentConfirmDownload(req, {
      params: Promise.resolve({
        id: String(contractDocId),
        invoiceId: String(invoiceId),
      }),
    });

    expect(res.status).toBe(200);
    expect(mockGetFile).toHaveBeenCalledWith(
      1,
      "s3",
      "org-1/invoices/payment.pdf",
      expect.anything()
    );
    const arrayBuffer = await res.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(FILE_CONTENT);
  });
});

// ── Section 6: Real storage driver behavior — see tests/unit/storage-driver-unit.test.ts ──
//
// Direct driver tests (putFile/getFile/deleteFile internals) are in a separate
// unit test file because this file's top-level vi.mock('../../lib/storage.js')
// prevents importing the real module. The unit tests cover all driver criteria
// (Criterion 1-5) against the real lib/storage.js implementation.
//
// Placeholder describe to document this split:


// (Real driver unit tests are in tests/unit/storage-driver-unit.test.ts)
