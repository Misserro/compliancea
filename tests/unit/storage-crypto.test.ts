/**
 * Unit tests for lib/storage-crypto.js — AES-256-GCM encrypt/decrypt
 *
 * Tests verify against Task 1 success criteria:
 * - encrypt("test") → decrypt(result) === "test" (round-trip)
 * - STORAGE_ENCRYPTION_KEY not set → throws with clear message
 * - Two encryptions of same plaintext produce different ciphertexts (IV randomness)
 * - Tampered ciphertext → decrypt throws (GCM auth tag enforcement)
 * - Tampered auth tag → decrypt throws
 * - Invalid JSON → decrypt throws
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We manipulate process.env directly per test
const VALID_KEY_BASE64 = Buffer.from(
  "0123456789abcdef0123456789abcdef"  // exactly 32 bytes
).toString("base64");

// Force module to be re-evaluated for each env scenario — we use dynamic import
// with a cache-busting trick via vi.resetModules()

describe("storage-crypto — encrypt/decrypt", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STORAGE_ENCRYPTION_KEY = VALID_KEY_BASE64;
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("round-trip: encrypt('test') → decrypt(result) === 'test'", async () => {
    const { encrypt, decrypt } = await import("../../lib/storage-crypto.js");
    const encrypted = encrypt("test");
    expect(decrypt(encrypted)).toBe("test");
  });

  it("round-trip: preserves special characters and long strings", async () => {
    const { encrypt, decrypt } = await import("../../lib/storage-crypto.js");
    const plaintext = "AKIA1234567890abcdef!@#$%^&*()_+= unicode: 😀";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("round-trip: encrypts empty string without throwing", async () => {
    const { encrypt, decrypt } = await import("../../lib/storage-crypto.js");
    const result = encrypt("");
    expect(decrypt(result)).toBe("");
  });

  it("produces valid JSON with iv, ciphertext, tag fields", async () => {
    const { encrypt } = await import("../../lib/storage-crypto.js");
    const result = encrypt("test");
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("ciphertext");
    expect(parsed).toHaveProperty("tag");
    // All should be non-empty hex strings
    expect(typeof parsed.iv).toBe("string");
    expect(parsed.iv.length).toBeGreaterThan(0);
    expect(typeof parsed.ciphertext).toBe("string");
    expect(typeof parsed.tag).toBe("string");
    expect(parsed.tag.length).toBeGreaterThan(0);
  });

  it("two encryptions of same plaintext produce different ciphertexts (random IV)", async () => {
    const { encrypt } = await import("../../lib/storage-crypto.js");
    const enc1 = encrypt("same plaintext");
    const enc2 = encrypt("same plaintext");
    // They must not be identical (different IV each time)
    expect(enc1).not.toBe(enc2);
    // But the IVs specifically must differ
    const p1 = JSON.parse(enc1);
    const p2 = JSON.parse(enc2);
    expect(p1.iv).not.toBe(p2.iv);
  });

  it("tampered ciphertext causes decrypt to throw (GCM auth tag check)", async () => {
    const { encrypt, decrypt } = await import("../../lib/storage-crypto.js");
    const encrypted = encrypt("secret");
    const parsed = JSON.parse(encrypted);
    // Flip first byte of ciphertext
    const ciphertextBuf = Buffer.from(parsed.ciphertext, "hex");
    ciphertextBuf[0] ^= 0xff;
    const tampered = JSON.stringify({
      ...parsed,
      ciphertext: ciphertextBuf.toString("hex"),
    });
    expect(() => decrypt(tampered)).toThrow();
  });

  it("tampered auth tag causes decrypt to throw", async () => {
    const { encrypt, decrypt } = await import("../../lib/storage-crypto.js");
    const encrypted = encrypt("secret");
    const parsed = JSON.parse(encrypted);
    const tagBuf = Buffer.from(parsed.tag, "hex");
    tagBuf[0] ^= 0xff;
    const tampered = JSON.stringify({
      ...parsed,
      tag: tagBuf.toString("hex"),
    });
    expect(() => decrypt(tampered)).toThrow();
  });

  it("invalid JSON input to decrypt throws", async () => {
    const { decrypt } = await import("../../lib/storage-crypto.js");
    expect(() => decrypt("not-json-at-all")).toThrow();
  });
});

describe("storage-crypto — missing STORAGE_ENCRYPTION_KEY", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("encrypt() throws with clear message when key is not set", async () => {
    const { encrypt } = await import("../../lib/storage-crypto.js");
    expect(() => encrypt("test")).toThrow("STORAGE_ENCRYPTION_KEY");
  });

  it("decrypt() throws with clear message when key is not set", async () => {
    const { decrypt } = await import("../../lib/storage-crypto.js");
    expect(() => decrypt('{"iv":"aa","ciphertext":"bb","tag":"cc"}')).toThrow(
      "STORAGE_ENCRYPTION_KEY"
    );
  });
});

describe("storage-crypto — invalid key length", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  });

  it("encrypt() throws when key decodes to fewer than 32 bytes", async () => {
    // 16 bytes base64-encoded
    process.env.STORAGE_ENCRYPTION_KEY =
      Buffer.from("0123456789abcdef").toString("base64"); // 16 bytes
    const { encrypt } = await import("../../lib/storage-crypto.js");
    expect(() => encrypt("test")).toThrow();
  });
});
