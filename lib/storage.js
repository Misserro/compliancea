import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { DOCUMENTS_DIR } from "./paths.js";
import { getOrgSettings } from "./db.js";
import { decrypt } from "./storage-crypto.js";

/**
 * Get S3 config for an org. Returns null if not configured.
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
 * Write a file to S3 or local filesystem.
 * @param {number} orgId
 * @param {string} prefix - e.g. 'documents', 'invoices', 'contract-attachments'
 * @param {string} filename - sanitized filename
 * @param {Buffer} buffer - file contents
 * @param {string} contentType - MIME type
 * @returns {Promise<{storageBackend: string, storageKey: string|null, localPath: string|null}>}
 */
export async function putFile(orgId, prefix, filename, buffer, contentType) {
  const s3Config = getS3Config(orgId);
  if (s3Config) {
    const key = `org-${orgId}/${prefix}/${filename}`;
    const client = getS3Client(s3Config);
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
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
 * @param {number} orgId
 * @param {string} storageBackend - 's3' or 'local'
 * @param {string|null} storageKey - S3 object key
 * @param {string|null} localPath - local filesystem path (fallback for legacy)
 * @returns {Promise<Buffer>}
 */
export async function getFile(orgId, storageBackend, storageKey, localPath) {
  if (storageBackend === "s3" && storageKey) {
    const s3Config = getS3Config(orgId);
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
 * @param {number} orgId
 * @param {string|null} storageBackend - 's3' or 'local'
 * @param {string|null} storageKey - S3 object key
 * @param {string|null} localPath - local filesystem path
 * @returns {Promise<void>}
 */
export async function deleteFile(orgId, storageBackend, storageKey, localPath) {
  if (storageBackend === "s3" && storageKey) {
    const s3Config = getS3Config(orgId);
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
