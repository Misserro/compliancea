import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { DOCUMENTS_DIR } from "./paths.js";
import { getOrgSettings, getPlatformSettings, getOrgStoragePolicy } from "./db.js";
import { decrypt } from "./storage-crypto.js";

/**
 * Get S3 config for an org (own credentials). Returns null if not configured.
 * @param {number} orgId
 * @returns {Object|null}
 */
function getS3Config(orgId) {
  const settings = getOrgSettings(orgId);
  const config = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  if (!config.s3Bucket || !config.s3SecretEncrypted) return null;
  return {
    bucket: config.s3Bucket,
    region: config.s3Region,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: decrypt(config.s3SecretEncrypted),
    endpoint: config.s3Endpoint || undefined,
  };
}

/**
 * Get platform-wide S3 config. Returns null if not configured.
 * @returns {Object|null}
 */
function getPlatformS3Config() {
  const rows = getPlatformSettings();
  const config = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!config.s3Bucket || !config.s3SecretEncrypted) return null;
  return {
    bucket: config.s3Bucket,
    region: config.s3Region,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: decrypt(config.s3SecretEncrypted),
    endpoint: config.s3Endpoint || undefined,
  };
}

/**
 * Create an S3Client from config.
 * @param {Object} s3Config
 * @returns {S3Client}
 */
function getS3Client(s3Config) {
  return new S3Client({
    region: s3Config.endpoint ? "auto" : s3Config.region,
    endpoint: s3Config.endpoint || undefined,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
    forcePathStyle: !!s3Config.endpoint,
  });
}

/**
 * Resolve the effective S3 config for writing, using the three-tier chain:
 * 1. Org has own S3 credentials → use org S3
 * 2. Org storage_policy = 'platform_s3' AND platform S3 configured → use platform S3
 * 3. Fallback → local filesystem
 * @param {number} orgId
 * @returns {{type: 'org_s3'|'platform_s3'|'local', config: Object|null}}
 */
function resolveWriteBackend(orgId) {
  const orgS3 = getS3Config(orgId);
  if (orgS3) {
    return { type: "org_s3", config: orgS3 };
  }

  const policyRow = getOrgStoragePolicy(orgId);
  if (policyRow && policyRow.storage_policy === "platform_s3") {
    const platformS3 = getPlatformS3Config();
    if (platformS3) {
      return { type: "platform_s3", config: platformS3 };
    }
  }

  return { type: "local", config: null };
}

/**
 * Resolve S3 config for reading/deleting a file.
 * Tries org S3 first, falls back to platform S3.
 * @param {number} orgId
 * @returns {Object|null}
 */
function resolveReadS3Config(orgId) {
  return getS3Config(orgId) || getPlatformS3Config();
}

/**
 * Write a file to S3 or local filesystem.
 * Uses the three-tier routing chain: org S3 → platform S3 → local.
 * @param {number} orgId
 * @param {string} prefix - e.g. 'documents', 'invoices', 'contract-attachments'
 * @param {string} filename - sanitized filename
 * @param {Buffer} buffer - file contents
 * @param {string} contentType - MIME type
 * @returns {Promise<{storageBackend: string, storageKey: string|null, localPath: string|null}>}
 */
export async function putFile(orgId, prefix, filename, buffer, contentType) {
  const backend = resolveWriteBackend(orgId);

  if (backend.type === "org_s3" || backend.type === "platform_s3") {
    const key = `org-${orgId}/${prefix}/${filename}`;
    const client = getS3Client(backend.config);
    await client.send(
      new PutObjectCommand({
        Bucket: backend.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      })
    );
    return { storageBackend: "s3", storageKey: key, localPath: null };
  } else {
    const dir = path.join(DOCUMENTS_DIR, `org-${orgId}`, prefix);
    await fs.promises.mkdir(dir, { recursive: true });
    const localPath = path.join(dir, filename);
    await fs.promises.writeFile(localPath, buffer);
    return { storageBackend: "local", storageKey: null, localPath };
  }
}

/**
 * Read a file from S3 or local filesystem.
 * For S3 reads, resolves credentials via org S3 → platform S3 fallback.
 * @param {number} orgId
 * @param {string} storageBackend - 's3' or 'local'
 * @param {string|null} storageKey - S3 object key
 * @param {string|null} localPath - local filesystem path (fallback for legacy)
 * @returns {Promise<Buffer>}
 */
export async function getFile(orgId, storageBackend, storageKey, localPath) {
  if (storageBackend === "s3" && storageKey) {
    const s3Config = resolveReadS3Config(orgId);
    if (!s3Config) throw new Error("S3 configured but no credentials found");
    const client = getS3Client(s3Config);
    const response = await client.send(
      new GetObjectCommand({ Bucket: s3Config.bucket, Key: storageKey })
    );
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } else {
    // local or legacy (no storage_backend set)
    return fs.promises.readFile(localPath);
  }
}

/**
 * Delete a file from S3 or local filesystem.
 * For S3 deletes, resolves credentials via org S3 → platform S3 fallback.
 * @param {number} orgId
 * @param {string|null} storageBackend - 's3' or 'local'
 * @param {string|null} storageKey - S3 object key
 * @param {string|null} localPath - local filesystem path
 * @returns {Promise<void>}
 */
export async function deleteFile(orgId, storageBackend, storageKey, localPath) {
  if (storageBackend === "s3" && storageKey) {
    const s3Config = resolveReadS3Config(orgId);
    if (s3Config) {
      const client = getS3Client(s3Config);
      await client.send(
        new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: storageKey })
      );
    }
  } else if (localPath) {
    try {
      await fs.promises.unlink(localPath);
    } catch (e) {
      /* ignore ENOENT */
    }
  }
}
