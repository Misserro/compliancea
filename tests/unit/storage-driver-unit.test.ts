/**
 * Unit tests for lib/storage.js — real driver behavior without route-level mocks.
 *
 * These tests verify the storage driver's internal logic directly:
 * - putFile with no S3 config → local filesystem, org-namespaced path (Criterion 2)
 * - putFile with S3 config → S3 upload, storageKey = 'org-{id}/{prefix}/{filename}' (Criterion 1)
 * - getFile with storageBackend='local' → reads from localPath (Criterion 4)
 * - getFile with storageBackend=null → falls back to local (backward compatibility, Criterion 4)
 * - deleteFile with S3 backend → calls DeleteObjectCommand (Criterion 5)
 *
 * This file does NOT mock lib/storage.js itself — it imports the real module.
 * All external dependencies (db.js, fs, paths, @aws-sdk/client-s3) ARE mocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Hoist mutable shared mocks ────────────────────────────────────────────────
const {
  mockSend,
  mockFsReadFile,
  mockFsWriteFile,
  mockFsMkdir,
  mockFsUnlink,
  mockGetOrgSettings,
} = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockFsReadFile: vi.fn(),
  mockFsWriteFile: vi.fn(),
  mockFsMkdir: vi.fn().mockResolvedValue(undefined),
  mockFsUnlink: vi.fn().mockResolvedValue(undefined),
  mockGetOrgSettings: vi.fn(),
}));

// ── Mock fs (sync + promises) ─────────────────────────────────────────────────
// lib/storage.js uses `import fs from "fs"` (default import).
// All mock functions must be on the default export so the real module sees them.
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
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
  mkdirSync: vi.fn(),
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
  DB_PATH: "/tmp/test-db-storage-unit-fake.sqlite",
  DOCUMENTS_DIR: "/tmp/test-docs",
  GDRIVE_DIR: "/tmp/test-gdrive",
  INVOICES_DIR: "/tmp/test-invoices",
  CONTRACT_ATTACHMENTS_DIR: "/tmp/test-contract-attachments",
  CASE_ATTACHMENTS_DIR: "/tmp/test-case-attachments",
  DB_DIR: "/tmp/test-db",
  isRailway: false,
  ensureDirectories: vi.fn(),
}));

// ── Mock db.js ────────────────────────────────────────────────────────────────
vi.mock("../../lib/db.js", () => ({
  getOrgSettings: mockGetOrgSettings,
  run: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  saveDb: vi.fn(),
  initDb: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
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
}));

// ── VALID ENCRYPTION KEY ──────────────────────────────────────────────────────
const VALID_KEY_BASE64 = Buffer.from(
  "0123456789abcdef0123456789abcdef"
).toString("base64");

// ── Import real storage module AFTER mocks ────────────────────────────────────
// @ts-ignore
import { putFile, getFile, deleteFile } from "../../lib/storage.js";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("putFile — local backend (Criterion 2: no S3 config)", () => {
  beforeEach(() => {
    mockGetOrgSettings.mockReturnValue([]); // no S3 configured
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsMkdir.mockResolvedValue(undefined);
  });

  it("returns storageBackend='local' when no S3 config", async () => {
    const result = await putFile(1, "documents", "test.pdf", Buffer.from("content"), "application/pdf");
    expect(result.storageBackend).toBe("local");
  });

  it("returns storageKey=null when no S3 config", async () => {
    const result = await putFile(1, "documents", "test.pdf", Buffer.from("content"), "application/pdf");
    expect(result.storageKey).toBeNull();
  });

  it("localPath contains org-{id}/{prefix}/{filename} (Criterion 2: org-namespaced path)", async () => {
    const result = await putFile(1, "documents", "contract.pdf", Buffer.from("content"), "application/pdf");
    expect(result.localPath).toMatch(/org-1[/\\]documents[/\\]contract\.pdf$/);
  });

  it("creates directory with recursive option", async () => {
    await putFile(1, "documents", "test.pdf", Buffer.from("content"), "application/pdf");
    expect(mockFsMkdir).toHaveBeenCalledWith(
      expect.stringContaining("org-1"),
      { recursive: true }
    );
  });

  it("writes file buffer to the local path", async () => {
    const buf = Buffer.from("file bytes");
    await putFile(1, "documents", "test.pdf", buf, "application/pdf");
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("test.pdf"),
      buf
    );
  });
});

describe("putFile — S3 backend (Criterion 1: storageKey format)", () => {
  beforeEach(() => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  async function seedS3Config() {
    // @ts-ignore
    const { encrypt } = await import("../../lib/storage-crypto.js");
    const encryptedSecret = encrypt("my-secret-key");
    mockGetOrgSettings.mockReturnValue([
      { key: "s3Bucket", value: "test-bucket" },
      { key: "s3Region", value: "us-east-1" },
      { key: "s3AccessKeyId", value: "AKIATEST" },
      { key: "s3SecretEncrypted", value: encryptedSecret },
      { key: "s3Endpoint", value: "" },
    ]);
  }

  it("Criterion 1: storageBackend='s3' when S3 configured", async () => {
    await seedS3Config();
    const result = await putFile(1, "documents", "file.pdf", Buffer.from("c"), "application/pdf");
    expect(result.storageBackend).toBe("s3");
  });

  it("Criterion 1: storageKey = 'org-{id}/{prefix}/{filename}'", async () => {
    await seedS3Config();
    const result = await putFile(1, "documents", "file.pdf", Buffer.from("c"), "application/pdf");
    expect(result.storageKey).toBe("org-1/documents/file.pdf");
  });

  it("Criterion 1: localPath=null for S3 upload", async () => {
    await seedS3Config();
    const result = await putFile(1, "documents", "file.pdf", Buffer.from("c"), "application/pdf");
    expect(result.localPath).toBeNull();
  });

  it("Criterion 1: S3 PutObjectCommand is sent", async () => {
    await seedS3Config();
    await putFile(1, "documents", "file.pdf", Buffer.from("c"), "application/pdf");
    expect(mockSend).toHaveBeenCalled();
  });

  it("Criterion 1: org prefix is enforced — org-2 gets 'org-2/...' key", async () => {
    await seedS3Config();
    const result = await putFile(2, "documents", "file.pdf", Buffer.from("c"), "application/pdf");
    expect(result.storageKey).toBe("org-2/documents/file.pdf");
    expect(result.storageKey).not.toMatch(/^org-1\//);
  });
});

describe("getFile — local backend (Criterion 4: legacy backward compatibility)", () => {
  beforeEach(() => {
    mockGetOrgSettings.mockReturnValue([]);
    mockFsReadFile.mockResolvedValue(Buffer.from("file content"));
  });

  it("reads from localPath when storageBackend='local'", async () => {
    await getFile(1, "local", null, "/tmp/test-docs/legacy.pdf");
    expect(mockFsReadFile).toHaveBeenCalledWith("/tmp/test-docs/legacy.pdf");
  });

  it("Criterion 4: returns file buffer from localPath when storageBackend='local'", async () => {
    const expected = Buffer.from("legacy content");
    mockFsReadFile.mockResolvedValue(expected);
    const result = await getFile(1, "local", null, "/tmp/test-docs/legacy.pdf");
    expect(result).toEqual(expected);
  });

  it("Criterion 4: null storageBackend falls back to local — reads localPath (backward compat)", async () => {
    await getFile(1, null, null, "/tmp/test-docs/old.pdf");
    expect(mockFsReadFile).toHaveBeenCalledWith("/tmp/test-docs/old.pdf");
  });

  it("Criterion 4: undefined storageBackend falls back to local", async () => {
    await getFile(1, undefined, null, "/tmp/test-docs/old.pdf");
    expect(mockFsReadFile).toHaveBeenCalledWith("/tmp/test-docs/old.pdf");
  });
});

describe("getFile — S3 backend (Criterion 3: correct content returned)", () => {
  beforeEach(() => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("Criterion 3: returns buffer assembled from S3 stream", async () => {
    // @ts-ignore
    const { encrypt } = await import("../../lib/storage-crypto.js");
    const encryptedSecret = encrypt("my-secret-key");
    mockGetOrgSettings.mockReturnValue([
      { key: "s3Bucket", value: "test-bucket" },
      { key: "s3Region", value: "us-east-1" },
      { key: "s3AccessKeyId", value: "AKIATEST" },
      { key: "s3SecretEncrypted", value: encryptedSecret },
    ]);

    const fileContent = Buffer.from("S3 file content here");
    // Mock an async iterable (S3 response Body)
    const mockBody = {
      [Symbol.asyncIterator]: async function* () {
        yield fileContent;
      },
    };
    mockSend.mockResolvedValue({ Body: mockBody });

    const result = await getFile(1, "s3", "org-1/documents/file.pdf", null);
    expect(result).toEqual(fileContent);
  });
});

describe("deleteFile — S3 backend (Criterion 5: S3 object deleted)", () => {
  beforeEach(() => {
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("Criterion 5: calls S3 DeleteObjectCommand when storageBackend='s3'", async () => {
    // @ts-ignore
    const { encrypt } = await import("../../lib/storage-crypto.js");
    const encryptedSecret = encrypt("my-secret-key");
    mockGetOrgSettings.mockReturnValue([
      { key: "s3Bucket", value: "test-bucket" },
      { key: "s3Region", value: "us-east-1" },
      { key: "s3AccessKeyId", value: "AKIATEST" },
      { key: "s3SecretEncrypted", value: encryptedSecret },
    ]);

    await deleteFile(1, "s3", "org-1/documents/file.pdf", "/tmp/path");
    expect(mockSend).toHaveBeenCalled();
  });

  it("does NOT call fs.unlink when storageBackend='s3'", async () => {
    // @ts-ignore
    const { encrypt } = await import("../../lib/storage-crypto.js");
    mockGetOrgSettings.mockReturnValue([
      { key: "s3Bucket", value: "test-bucket" },
      { key: "s3Region", value: "us-east-1" },
      { key: "s3AccessKeyId", value: "AKIATEST" },
      { key: "s3SecretEncrypted", value: encrypt("secret") },
    ]);

    mockFsUnlink.mockClear();

    await deleteFile(1, "s3", "org-1/documents/file.pdf", "/tmp/path");
    expect(mockFsUnlink).not.toHaveBeenCalled();
  });
});

describe("deleteFile — local backend", () => {
  beforeEach(() => {
    mockGetOrgSettings.mockReturnValue([]);
    mockFsUnlink.mockReset();
    mockFsUnlink.mockResolvedValue(undefined);
  });

  it("calls fs.promises.unlink for local files", async () => {
    await deleteFile(1, "local", null, "/tmp/test-docs/local.pdf");
    expect(mockFsUnlink).toHaveBeenCalledWith("/tmp/test-docs/local.pdf");
  });

  it("does not throw if local file does not exist (ENOENT swallowed)", async () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockFsUnlink.mockRejectedValue(err);

    await expect(
      deleteFile(1, "local", null, "/tmp/test-docs/missing.pdf")
    ).resolves.not.toThrow();
  });
});
