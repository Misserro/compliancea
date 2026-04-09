import fs from "fs";
import path from "path";
import { DOCUMENTS_DIR, GDRIVE_DIR } from "./paths.js";
import { query, get, run, getOrgSetting, setOrgSetting } from "./db.js";
import { logAction } from "./audit.js";

// Dynamic import of googleapis — gracefully degrades if not installed
let google = null;
try {
  const googleapis = await import("googleapis");
  google = googleapis.google;
} catch {
  console.log("Google Drive: 'googleapis' package not installed. Google Drive integration disabled.");
}

// Supported MIME types and their extensions
const SUPPORTED_TYPES = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

// Google Docs export MIME (Google Docs → PDF)
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

// Per-org Drive client cache. Key: orgId, Value: { client, credHash }
const clientCache = new Map();

/**
 * Create a Google Drive client using service account credentials from org settings.
 * Caches the client per org and only rebuilds if credentials change.
 * @param {number} orgId
 * @returns {Object} - Google Drive API client
 */
function getDriveClient(orgId) {
  if (!google) {
    throw new Error("googleapis package not installed. Google Drive integration unavailable.");
  }

  const credentialsJson = getOrgSetting(orgId, 'gdrive_service_account');
  if (!credentialsJson) {
    throw new Error("Google Drive service account not configured for this organisation.");
  }

  // Only re-create the client if credentials changed
  const cached = clientCache.get(orgId);
  if (cached && cached.credHash === credentialsJson) {
    return cached.client;
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error("Invalid service account JSON. Check the format in Settings.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const client = google.drive({ version: "v3", auth });
  clientCache.set(orgId, { client, credHash: credentialsJson });
  return client;
}

/**
 * Get the configured Google Drive ID (Shared Drive or folder) from org settings.
 * @param {number} orgId
 * @returns {string} - Drive/Folder ID
 */
function getDriveId(orgId) {
  let driveId = getOrgSetting(orgId, 'gdrive_drive_id');
  if (!driveId) {
    throw new Error("Google Drive ID not configured for this organisation.");
  }

  // Extract ID from full URL if user pasted the whole link
  // e.g. https://drive.google.com/drive/folders/1AbCdEf... → 1AbCdEf...
  const urlMatch = driveId.match(/\/folders\/([^/?]+)/);
  if (urlMatch) {
    driveId = urlMatch[1];
  }

  // Also strip any query params or trailing slashes
  driveId = driveId.split("?")[0].replace(/\/+$/, "");

  return driveId;
}

/**
 * Check if Google Drive is configured and available for an org
 * @param {number} orgId
 * @returns {{available: boolean, lastSync: string|null, error?: string, folderId?: string}}
 */
export function getGDriveStatus(orgId) {
  const lastSync = getOrgSetting(orgId, 'gdrive_last_sync_time');

  if (!google) {
    return {
      available: false,
      lastSync,
      error: "googleapis package not installed.",
    };
  }

  const credentialsJson = getOrgSetting(orgId, 'gdrive_service_account');
  if (!credentialsJson) {
    return {
      available: false,
      lastSync,
      error: "Google Drive service account not configured. Set it in Settings.",
    };
  }

  // Validate JSON format
  try {
    JSON.parse(credentialsJson);
  } catch {
    return {
      available: false,
      lastSync,
      error: "Invalid service account JSON format. Check Settings.",
    };
  }

  const folderId = getOrgSetting(orgId, 'gdrive_drive_id');
  if (!folderId) {
    return {
      available: false,
      lastSync,
      error: "Google Drive Folder ID not configured. Set it in Settings.",
    };
  }

  return {
    available: true,
    lastSync,
    folderId,
  };
}

/**
 * List all PDF/DOCX files in the configured Google Drive folder (recursive)
 * @param {number} orgId
 * @param {string} [folderId] - Folder ID to scan (defaults to org setting)
 * @returns {Promise<Object[]>} - Array of file objects
 */
export async function listFiles(orgId, folderId = null) {
  const driveClient = getDriveClient(orgId);
  const targetFolderId = folderId || getDriveId(orgId);

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
    const query = `'${folderId}' in parents and trashed = false`;
    console.log(`Google Drive: listing files with query: ${query}`);

    const response = await driveClient.files.list({
      q: query,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)",
      pageSize: 100,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const files = response.data.files || [];
    console.log(`Google Drive: found ${files.length} items in folder ${folderId}`);

    for (const file of files) {
      console.log(`  - ${file.name} (${file.mimeType})`);

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
      } else {
        console.log(`  (skipped — unsupported MIME type: ${file.mimeType})`);
      }
    }

    pageToken = response.data.nextPageToken;
  } while (pageToken);
}

/**
 * Download a file from Google Drive
 * @param {number} orgId
 * @param {string} fileId - Google Drive file ID
 * @param {string} mimeType - File's MIME type
 * @returns {Promise<{buffer: Buffer, name: string, extension: string}>}
 */
export async function downloadFile(orgId, fileId, mimeType) {
  const driveClient = getDriveClient(orgId);

  let response;
  let extension;

  if (mimeType === GOOGLE_DOC_MIME) {
    // Export Google Docs as PDF
    response = await driveClient.files.export(
      { fileId, mimeType: "application/pdf", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    extension = ".pdf";
  } else {
    response = await driveClient.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    extension = SUPPORTED_TYPES[mimeType] || ".pdf";
  }

  const buffer = Buffer.from(response.data);

  // Get file metadata for the name
  const meta = await driveClient.files.get({
    fileId,
    fields: "name",
    supportsAllDrives: true,
  });

  return {
    buffer,
    name: meta.data.name,
    extension,
  };
}

/**
 * Main sync function: scan Google Drive and sync with local library for an org
 * @param {number} orgId
 * @returns {Promise<{added: number, updated: number, deleted: number, unchanged: number, errors: string[]}>}
 */
export async function scanGDrive(orgId) {
  // Validate config (will throw if not configured)
  getDriveClient(orgId);
  const driveId = getDriveId(orgId);

  const stats = { added: 0, updated: 0, deleted: 0, unchanged: 0, errors: [] };

  // 1. List all files in Google Drive (let errors propagate — don't swallow them)
  console.log(`Google Drive: scanning folder ${driveId} for org ${orgId}...`);
  const driveFiles = await listFiles(orgId, driveId);
  console.log(`Google Drive: found ${driveFiles.length} supported files total`);
  const driveFileIds = new Set(driveFiles.map((f) => f.id));

  try {

    // 2. Get existing gdrive documents from DB for this org
    const existingDocs = query(
      `SELECT id, name, gdrive_file_id, gdrive_modified_time, sync_status
       FROM documents WHERE source = 'gdrive' AND gdrive_file_id IS NOT NULL AND org_id = ?`,
      [orgId]
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
          const { buffer, name, extension } = await downloadFile(orgId, file.id, file.mimeType);

          // Ensure filename has extension
          let filename = name;
          if (!filename.toLowerCase().endsWith(extension)) {
            filename += extension;
          }

          // Save to local gdrive directory
          const localPath = path.join(GDRIVE_DIR, `${file.id}_${filename}`);
          fs.writeFileSync(localPath, buffer);

          // Add to database with org_id
          const result = run(
            `INSERT INTO documents (name, path, folder, source, gdrive_file_id, gdrive_modified_time, sync_status, org_id)
             VALUES (?, ?, 'gdrive', 'gdrive', ?, ?, 'synced', ?)`,
            [filename, localPath, file.id, file.modifiedTime, orgId]
          );

          logAction("document", result.lastInsertRowId, "created", {
            source: "gdrive",
            gdrive_file_id: file.id,
            name: filename,
          });

          stats.added++;
        } else if (existing.gdrive_modified_time !== file.modifiedTime) {
          // MODIFIED — re-download and flag
          const { buffer, name, extension } = await downloadFile(orgId, file.id, file.mimeType);

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

    setOrgSetting(orgId, 'gdrive_last_sync_time', new Date().toISOString());
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
 * Check if enough time has passed since last sync for an org
 * @param {number} orgId
 * @returns {boolean}
 */
export function shouldSync(orgId) {
  const interval = getSyncInterval();
  if (interval <= 0) return false;

  const lastSyncTime = getOrgSetting(orgId, 'gdrive_last_sync_time');
  if (!lastSyncTime) return true;

  const elapsed = (Date.now() - new Date(lastSyncTime).getTime()) / 1000 / 60;
  return elapsed >= interval;
}

export { GDRIVE_DIR };
