import fs from "fs";
import path from "path";
import { DOCUMENTS_DIR, GDRIVE_DIR } from "./paths.js";
import { query, get, run, getAppSetting } from "./db.js";
import { logAction } from "./audit.js";

// Dynamic import of googleapis — gracefully degrades if not installed
let google = null;
try {
  const googleapis = await import("googleapis");
  google = googleapis.google;
} catch {
  console.log("Google Drive: 'googleapis' package not installed. Google Drive integration disabled.");
}

let lastSyncTime = null;

// Supported MIME types and their extensions
const SUPPORTED_TYPES = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

// Google Docs export MIME (Google Docs → PDF)
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/**
 * Create a Google Drive client using API key from app settings.
 * Created per-call to always use the latest API key (no stale cache).
 * @returns {Object} - Google Drive API client
 */
function getDriveClient() {
  if (!google) {
    throw new Error("googleapis package not installed. Google Drive integration unavailable.");
  }

  const apiKey = getAppSetting("gdriveApiKey");
  if (!apiKey) {
    throw new Error("Google Drive API key not configured. Set it in Settings.");
  }

  return google.drive({ version: "v3", auth: apiKey });
}

/**
 * Get the configured Google Drive folder ID from app settings.
 * @returns {string} - Folder ID
 */
function getFolderId() {
  const folderId = getAppSetting("gdriveFolderId");
  if (!folderId) {
    throw new Error("Google Drive Folder ID not configured. Set it in Settings.");
  }
  return folderId;
}

/**
 * Check if Google Drive is configured and available
 * @returns {{available: boolean, lastSync: string|null, error?: string, folderId?: string}}
 */
export function getGDriveStatus() {
  if (!google) {
    return {
      available: false,
      lastSync: lastSyncTime,
      error: "googleapis package not installed.",
    };
  }

  const apiKey = getAppSetting("gdriveApiKey");
  if (!apiKey) {
    return {
      available: false,
      lastSync: lastSyncTime,
      error: "Google Drive API key not configured. Set it in Settings.",
    };
  }

  const folderId = getAppSetting("gdriveFolderId");
  if (!folderId) {
    return {
      available: false,
      lastSync: lastSyncTime,
      error: "Google Drive Folder ID not configured. Set it in Settings.",
    };
  }

  return {
    available: true,
    lastSync: lastSyncTime,
    folderId,
  };
}

/**
 * List all PDF/DOCX files in the configured Google Drive folder (recursive)
 * @param {string} [folderId] - Folder ID to scan (defaults to setting)
 * @returns {Promise<Object[]>} - Array of file objects
 */
export async function listFiles(folderId = null) {
  const driveClient = getDriveClient();
  const targetFolderId = folderId || getFolderId();

  const allFiles = [];
  await listFilesRecursive(targetFolderId, allFiles, driveClient);
  return allFiles;
}

/**
 * Recursively list files in a folder and subfolders
 * @param {string} folderId
 * @param {Object[]} accumulator
 * @param {Object} driveClient - Google Drive API client
 */
async function listFilesRecursive(folderId, accumulator, driveClient) {
  let pageToken = null;

  do {
    const response = await driveClient.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)",
      pageSize: 100,
      pageToken: pageToken || undefined,
    });

    const files = response.data.files || [];

    for (const file of files) {
      // If it's a folder, recurse into it
      if (file.mimeType === "application/vnd.google-apps.folder") {
        await listFilesRecursive(file.id, accumulator, driveClient);
        continue;
      }

      // If it's a supported file type or a Google Doc (exportable)
      if (SUPPORTED_TYPES[file.mimeType] || file.mimeType === GOOGLE_DOC_MIME) {
        accumulator.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          size: file.size ? parseInt(file.size) : null,
          parents: file.parents,
        });
      }
    }

    pageToken = response.data.nextPageToken;
  } while (pageToken);
}

/**
 * Download a file from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @param {string} mimeType - File's MIME type
 * @returns {Promise<{buffer: Buffer, name: string, extension: string}>}
 */
export async function downloadFile(fileId, mimeType) {
  const driveClient = getDriveClient();

  let response;
  let extension;

  if (mimeType === GOOGLE_DOC_MIME) {
    // Export Google Docs as PDF
    response = await driveClient.files.export(
      { fileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );
    extension = ".pdf";
  } else {
    response = await driveClient.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    extension = SUPPORTED_TYPES[mimeType] || ".pdf";
  }

  const buffer = Buffer.from(response.data);

  // Get file metadata for the name
  const meta = await driveClient.files.get({
    fileId,
    fields: "name",
  });

  return {
    buffer,
    name: meta.data.name,
    extension,
  };
}

/**
 * Main sync function: scan Google Drive and sync with local library
 * @returns {Promise<{added: number, updated: number, deleted: number, unchanged: number, errors: string[]}>}
 */
export async function scanGDrive() {
  // Validate config (will throw if not configured)
  getDriveClient();
  const folderId = getFolderId();

  const stats = { added: 0, updated: 0, deleted: 0, unchanged: 0, errors: [] };

  try {
    // 1. List all files in Google Drive
    const driveFiles = await listFiles(folderId);
    const driveFileIds = new Set(driveFiles.map((f) => f.id));

    // 2. Get existing gdrive documents from DB
    const existingDocs = query(
      `SELECT id, name, gdrive_file_id, gdrive_modified_time, sync_status
       FROM documents WHERE source = 'gdrive' AND gdrive_file_id IS NOT NULL`
    );
    const existingByGdriveId = new Map(
      existingDocs.map((d) => [d.gdrive_file_id, d])
    );

    // 3. Process each Drive file
    for (const file of driveFiles) {
      try {
        const existing = existingByGdriveId.get(file.id);

        if (!existing) {
          // NEW FILE — download and add to library
          const { buffer, name, extension } = await downloadFile(file.id, file.mimeType);

          // Ensure filename has extension
          let filename = name;
          if (!filename.toLowerCase().endsWith(extension)) {
            filename += extension;
          }

          // Save to local gdrive directory
          const localPath = path.join(GDRIVE_DIR, `${file.id}_${filename}`);
          fs.writeFileSync(localPath, buffer);

          // Add to database
          const result = run(
            `INSERT INTO documents (name, path, folder, source, gdrive_file_id, gdrive_modified_time, sync_status)
             VALUES (?, ?, 'gdrive', 'gdrive', ?, ?, 'synced')`,
            [filename, localPath, file.id, file.modifiedTime]
          );

          logAction("document", result.lastInsertRowId, "created", {
            source: "gdrive",
            gdrive_file_id: file.id,
            name: filename,
          });

          stats.added++;
        } else if (existing.gdrive_modified_time !== file.modifiedTime) {
          // MODIFIED — re-download and flag
          const { buffer, name, extension } = await downloadFile(file.id, file.mimeType);

          let filename = name;
          if (!filename.toLowerCase().endsWith(extension)) {
            filename += extension;
          }

          // Update local file
          const localPath = path.join(GDRIVE_DIR, `${file.id}_${filename}`);
          fs.writeFileSync(localPath, buffer);

          // Update database
          run(
            `UPDATE documents
             SET name = ?, path = ?, gdrive_modified_time = ?, sync_status = 'modified', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [filename, localPath, file.modifiedTime, existing.id]
          );

          // Create task for user review
          run(
            `INSERT INTO tasks (title, description, entity_type, entity_id, task_type)
             VALUES (?, ?, 'document', ?, 'review_metadata')`,
            [
              `Google Drive document updated: ${filename}`,
              `The document "${filename}" was modified in Google Drive. Consider reprocessing it.`,
              existing.id,
            ]
          );

          logAction("document", existing.id, "synced", {
            source: "gdrive",
            change: "modified",
            old_modified: existing.gdrive_modified_time,
            new_modified: file.modifiedTime,
          });

          stats.updated++;
        } else {
          // UNCHANGED
          stats.unchanged++;
        }
      } catch (err) {
        stats.errors.push(`Error processing ${file.name}: ${err.message}`);
      }
    }

    // 4. Check for deleted files (in DB but not in Drive)
    for (const [gdriveId, doc] of existingByGdriveId) {
      if (!driveFileIds.has(gdriveId) && doc.sync_status !== "deleted") {
        run(
          `UPDATE documents SET sync_status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [doc.id]
        );

        run(
          `INSERT INTO tasks (title, description, entity_type, entity_id, task_type)
           VALUES (?, ?, 'document', ?, 'review_metadata')`,
          [
            `Document removed from Google Drive: ${doc.name}`,
            `The document "${doc.name}" was deleted or moved in Google Drive.`,
            doc.id,
          ]
        );

        logAction("document", doc.id, "synced", {
          source: "gdrive",
          change: "deleted_from_source",
        });

        stats.deleted++;
      }
    }

    lastSyncTime = new Date().toISOString();
    logAction("system", null, "gdrive_sync", stats);
  } catch (err) {
    stats.errors.push(`Scan error: ${err.message}`);
    console.error("Google Drive scan error:", err);
  }

  return stats;
}

/**
 * Get the sync interval in minutes (from env var)
 * @returns {number} - Interval in minutes (0 = disabled)
 */
export function getSyncInterval() {
  const interval = parseInt(process.env.GDRIVE_SYNC_INTERVAL_MINUTES || "30");
  return isNaN(interval) ? 30 : interval;
}

/**
 * Check if enough time has passed since last sync
 * @returns {boolean}
 */
export function shouldSync() {
  const interval = getSyncInterval();
  if (interval <= 0) return false;
  if (!lastSyncTime) return true;

  const elapsed = (Date.now() - new Date(lastSyncTime).getTime()) / 1000 / 60;
  return elapsed >= interval;
}

export { GDRIVE_DIR };
